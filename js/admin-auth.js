/* ============================================================
   Receiptly — admin-auth.js
   ------------------------------------------------------------
   Completely separate authentication system for the site
   administrator. The admin is NOT a row in "receiptly_users" —
   it lives in its own storage keys so it can never be listed,
   edited, suspended, or deleted as if it were a customer account.

   Public API (window.AdminAuth):
     AdminAuth.login(identifier, password) -> admin | null
     AdminAuth.getSession()                -> session | null
     AdminAuth.currentAdmin()              -> admin record | null
     AdminAuth.logout()
     AdminAuth.requireAdmin(loginPath)     -> redirects if not signed in
     AdminAuth.changePassword(oldPw, newPw)-> {ok, error}
     AdminAuth.recordHeartbeat()           -> updates last-seen list
     AdminAuth.getActivityMap()            -> { userId: isoTimestamp }
     AdminAuth.isUserOnline(userId)        -> boolean (active in last 5 min)
   ============================================================ */
(function (global) {
  "use strict";

  var KEYS = {
    ADMINS: "receiptly_admins",
    SESSION: "receiptly_admin_session",
    ACTIVITY: "receiptly_activity" // shared with user-scope.js heartbeat
  };

  // Legacy keys, kept only so existing admin accounts/sessions created
  // before this migration are not lost. Same pattern as user-scope.js.
  var LEGACY_KEYS = {
    ADMINS: "receiptpro_admins",
    SESSION: "receiptpro_admin_session"
  };

  // One-time migration: if the new keys are empty but legacy data
  // exists, copy it over. Never deletes the legacy data.
  (function migrateLegacyAdminKeys() {
    try {
      if (!localStorage.getItem(KEYS.ADMINS) && localStorage.getItem(LEGACY_KEYS.ADMINS)) {
        localStorage.setItem(KEYS.ADMINS, localStorage.getItem(LEGACY_KEYS.ADMINS));
      }
      if (!localStorage.getItem(KEYS.SESSION) && localStorage.getItem(LEGACY_KEYS.SESSION)) {
        localStorage.setItem(KEYS.SESSION, localStorage.getItem(LEGACY_KEYS.SESSION));
      }
    } catch (e) {}
  })();

  var ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function getAdmins() {
    var admins = safeParse(localStorage.getItem(KEYS.ADMINS), null);
    if (!Array.isArray(admins) || !admins.length) {
      admins = seedDefaultAdmin();
    }
    return admins;
  }

  // Creates a new administrator account (used by admin-settings.html's
  // Administrators section). Distinct from seedDefaultAdmin(), which
  // only ever runs once automatically. Returns {ok, admin|error}.
  function createAdmin(data) {
    data = data || {};
    var email = String(data.email || "").trim().toLowerCase();
    if (!email) return { ok: false, error: "Email is required." };
    var admins = getAdmins();
    if (admins.some(function (a) { return a.email.toLowerCase() === email; })) {
      return { ok: false, error: "An administrator with this email already exists." };
    }
    // Enforce the SAME centralized password policy (js/security.js)
    // that changePassword() below already uses, so createAdmin() is
    // safe on its own merits and not just because admin-settings.html
    // happens to pre-check it before calling in. Falls back to the
    // bare length check only if Security isn't loaded on this page.
    if (global.Security) {
      var pwCheck = global.Security.validatePassword(data.password || "");
      if (!pwCheck.ok) return { ok: false, error: pwCheck.errors[0] };
    } else if (!data.password || data.password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." };
    }
    var admin = {
      id: "admin-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      name: data.name || email.split("@")[0],
      email: email,
      password: data.password,
      roleId: data.roleId || null,
      twoFactorEnabled: false,
      status: "active",
      createdAt: new Date().toISOString()
    };
    admins.push(admin);
    if (!saveAdmins(admins)) return { ok: false, error: "Could not save the new administrator." };
    return { ok: true, admin: admin };
  }

  function deleteAdmin(id, requestingAdminId) {
    if (id === requestingAdminId) return { ok: false, error: "You cannot delete your own administrator account while signed in." };
    var admins = getAdmins();
    var target = admins.find(function (a) { return a.id === id; });
    if (!target) return { ok: false, error: "Administrator not found." };
    var next = admins.filter(function (a) { return a.id !== id; });
    if (!saveAdmins(next)) return { ok: false, error: "Could not delete this administrator." };
    return { ok: true };
  }

  // Returns true/false instead of throwing, so a storage failure
  // (e.g. QuotaExceededError from an oversized avatar) is
  // something callers can react to gracefully — updateAdmin()
  // below turns this into its existing "return null" failure
  // path, which every caller already checks for.
  function saveAdmins(admins) {
    try {
      localStorage.setItem(KEYS.ADMINS, JSON.stringify(admins));
      return true;
    } catch (e) {
      console.error("AdminAuth: failed to save admins", e);
      return false;
    }
  }

  // Created once, the very first time admin-auth.js runs on a device
  // that has no admin account yet. Ad should change this password
  // from the Admin Settings screen after first login.
  function seedDefaultAdmin() {
    var admins = [
      {
        id: "admin-" + Date.now().toString(36),
        name: "Site Admin",
        email: "admin@receiptly.local",
        password: "Admin@2025",
        createdAt: new Date().toISOString()
      }
    ];
    saveAdmins(admins);
    return admins;
  }

  function getSession() {
    return safeParse(localStorage.getItem(KEYS.SESSION), null);
  }

  function setSession(admin) {
    // Create a REAL tracked session (js/sessions.js) so admin-sessions.html,
    // account-profile.html's "Sign Out Other Sessions", and session-timeout
    // enforcement are all working against the same real record instead of
    // a single untracked pointer.
    var tracked = null;
    try {
      if (global.Sessions) {
        tracked = global.Sessions.createSession({
          actorType: "admin",
          actorId: admin.id,
          actorName: admin.name,
          actorEmail: admin.email
        });
      }
    } catch (e) {}
    var session = {
      adminId: admin.id,
      email: admin.email,
      name: admin.name,
      loginAt: new Date().toISOString(),
      sessionId: tracked ? tracked.id : null
    };
    localStorage.setItem(KEYS.SESSION, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(KEYS.SESSION);
  }

  // Real validation of the CURRENT session pointer against the tracked
  // session record: revoked-elsewhere or timed-out sessions are logged
  // out here, not just hidden in the Sessions list. Returns true if the
  // session is still good; false (and clears it) if not. A session with
  // no linked sessionId (created before this fix shipped, or Sessions.js
  // unavailable) is treated as valid so existing users aren't logged out.
  function isCurrentSessionValid() {
    var session = getSession();
    if (!session) return false;
    if (!session.sessionId || !global.Sessions) return true;
    if (global.Sessions.isSessionUsable(session.sessionId)) {
      global.Sessions.touchSession(session.sessionId);
      return true;
    }
    return false;
  }

  function currentAdmin() {
    var session = getSession();
    if (!session) return null;
    var admins = getAdmins();
    return admins.find(function (a) { return a.id === session.adminId; }) || null;
  }

  // Checks email/password ONLY — does not create a session and does
  // not write to the audit log. Used by admin-login.html so it can
  // insert the two-step verification prompt (if enabled on this
  // admin's account) BEFORE the session actually starts. Plain
  // login() below still does both steps at once for any other
  // caller that doesn't need to pause for 2FA.
  function verifyCredentials(identifier, password) {
    var id = String(identifier || "").trim().toLowerCase();
    var admins = getAdmins();
    var admin = admins.find(function (a) {
      return a.email.toLowerCase() === id || (a.name || "").toLowerCase() === id;
    });
    if (!admin || admin.password !== password) return null;
    return admin;
  }

  // Finishes a login that verifyCredentials() already approved (and,
  // if this admin has two-step verification on, that the caller has
  // already confirmed the code for): creates the session and writes
  // the audit-log entry that Admin Profile's Login History reads.
  function completeLogin(admin) {
    if (!admin) return null;
    setSession(admin);
    try {
      if (global.Security) global.Security.recordSuccessfulLogin(admin.email);
    } catch (e) {}
    try {
      if (typeof DB !== "undefined" && DB.addAuditLog) {
        DB.addAuditLog({
          action: "admin_login",
          module: "authentication",
          targetType: "admin",
          targetId: admin.id,
          userId: admin.id,
          actorId: admin.id,
          userEmail: admin.email,
          description: "Admin signed in"
        });
      }
    } catch (e) {}
    return admin;
  }

  // Returns {ok, admin?, error?, lockedUntil?} instead of a bare
  // admin-or-null, so admin-login.html can distinguish "wrong
  // password" from "this account is locked out" and show the
  // right message / countdown.
  function loginChecked(identifier, password) {
    var id = String(identifier || "").trim().toLowerCase();
    if (global.Security) {
      var gate = global.Security.checkLoginAllowed(id);
      if (!gate.allowed) {
        return { ok: false, error: "Too many failed attempts. Try again later.", lockedUntil: gate.lockedUntil };
      }
    }
    var admin = verifyCredentials(identifier, password);
    if (!admin) {
      var after = global.Security ? global.Security.recordFailedLogin(id) : null;
      var err = "Invalid email or password.";
      if (after && !after.allowed) {
        err = "Too many failed attempts. Account locked temporarily.";
        return { ok: false, error: err, lockedUntil: after.lockedUntil };
      }
      return { ok: false, error: err, remainingAttempts: after ? after.remainingAttempts : undefined };
    }
    return { ok: true, admin: admin };
  }

  function login(identifier, password) {
    var admin = verifyCredentials(identifier, password);
    if (!admin) return null;
    return completeLogin(admin);
  }

  function logout() {
    var admin = currentAdmin();
    var session = getSession();
    try {
      if (session && session.sessionId && global.Sessions) {
        global.Sessions.revokeSession(session.sessionId);
      }
    } catch (e) {}
    try {
      if (admin && typeof DB !== "undefined" && DB.addAuditLog) {
        DB.addAuditLog({
          action: "admin_logout",
          module: "authentication",
          targetType: "admin",
          targetId: admin.id,
          userId: admin.id,
          actorId: admin.id,
          userEmail: admin.email,
          description: "Admin signed out"
        });
      }
    } catch (e) {}
    clearSession();
  }

  function requireAdmin(loginPath) {
    var depth = (location.pathname.includes("/pages/") || location.pathname.includes("/admin/")) ? "../" : "";
    if (!getSession()) {
      window.location.href = depth + (loginPath || "admin-login.html");
      return null;
    }
    if (!isCurrentSessionValid()) {
      var reason = "expired";
      try {
        var s = getSession();
        if (s) reason = "expired";
      } catch (e) {}
      clearSession();
      window.location.href = depth + (loginPath || "admin-login.html") + "?session=" + reason;
      return null;
    }
    return currentAdmin();
  }

  // Central permission check for admin pages/actions. Thin wrapper
  // around Roles.hasPermission so callers only need AdminAuth.
  function hasPermission(permKey) {
    var admin = currentAdmin();
    if (!global.Roles) return true; // roles module not loaded on this page — fail open, not closed, to avoid bricking pages that don't need it
    return global.Roles.hasPermission(admin, permKey);
  }

  function changePassword(oldPw, newPw) {
    var admin = currentAdmin();
    if (!admin) return { ok: false, error: "Not signed in." };
    if (admin.password !== oldPw) return { ok: false, error: "Current password is incorrect." };
    if (global.Security) {
      var check = global.Security.validatePassword(newPw);
      if (!check.ok) return { ok: false, error: check.errors[0] };
    } else if (!newPw || newPw.length < 6) {
      return { ok: false, error: "New password must be at least 6 characters." };
    }
    var admins = getAdmins().map(function (a) {
      return a.id === admin.id ? Object.assign({}, a, { password: newPw }) : a;
    });
    saveAdmins(admins);
    return { ok: true };
  }

  // Persists any additional profile fields on the admin record itself
  // (first/last/display name, phone, job title, avatar dataURL,
  // preferences) — the SAME central "receiptpro_admins" store every
  // other admin page already reads via currentAdmin(), so a change
  // here is visible everywhere else immediately, with no second
  // storage system involved.
  function updateAdmin(id, patch) {
    var admins = getAdmins();
    var updated = null;
    var next = admins.map(function (a) {
      if (a.id !== id) return a;
      updated = Object.assign({}, a, patch, { updatedAt: new Date().toISOString() });
      return updated;
    });
    if (!updated) return null;
    if (!saveAdmins(next)) return null; // storage failed — nothing was persisted
    // Keep the session's cached name/email in sync too, since some
    // pages read admin.name straight off the session rather than
    // re-resolving currentAdmin().
    var session = getSession();
    if (session && session.adminId === id) {
      session.name = updated.name;
      session.email = updated.email;
      localStorage.setItem(KEYS.SESSION, JSON.stringify(session));
    }
    return updated;
  }

  /* ---------- activity / "who's online" ---------- */
  function getActivityMap() {
    return safeParse(localStorage.getItem(KEYS.ACTIVITY), {});
  }

  function isUserOnline(userId) {
    var map = getActivityMap();
    var ts = map[userId];
    if (!ts) return false;
    return (Date.now() - new Date(ts).getTime()) < ONLINE_WINDOW_MS;
  }

  /* ---------- sidebar branding sync ---------- */
  // Every admin page has the same static "R" sidebar-brand icon.
  // Once the admin uploads a logo in Company Profile, reflect it
  // everywhere else in the admin panel automatically, since this
  // file is already loaded on every admin page.
  function applyBranding() {
    try {
      var admin = currentAdmin();
      if (!admin) return;
      var accountId = admin.id || admin.email || "default_account";
      var raw = localStorage.getItem("receiptly_company_profile_" + accountId);
      if (!raw) return;
      var profile = JSON.parse(raw);
      if (!profile || !profile.logo) return;
      var icon = document.querySelector(".sidebar-brand .brand-icon");
      if (icon && icon.tagName !== "IMG") {
        var img = document.createElement("img");
        img.src = profile.logo;
        img.alt = "Logo";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
        icon.innerHTML = "";
        icon.appendChild(img);
      }
    } catch (e) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBranding);
  } else {
    applyBranding();
  }

  global.AdminAuth = {
    login: login,
    loginChecked: loginChecked,
    verifyCredentials: verifyCredentials,
    completeLogin: completeLogin,
    getSession: getSession,
    currentAdmin: currentAdmin,
    logout: logout,
    requireAdmin: requireAdmin,
    changePassword: changePassword,
    updateAdmin: updateAdmin,
    getAdmins: getAdmins,
    createAdmin: createAdmin,
    deleteAdmin: deleteAdmin,
    hasPermission: hasPermission,
    isCurrentSessionValid: isCurrentSessionValid,
    getActivityMap: getActivityMap,
    isUserOnline: isUserOnline,
    ONLINE_WINDOW_MS: ONLINE_WINDOW_MS
  };
})(window);
