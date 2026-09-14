/* ============================================================
   Receiptly / Receiptly — user-scope.js
   ------------------------------------------------------------
   Adds per-account data isolation on top of the existing
   localStorage-based storage system, WITHOUT changing the
   overall architecture (still plain localStorage, no backend).

   Load this file on every page (via <script src="...js/user-scope.js">)
   BEFORE any inline script that reads/writes app data
   (customers, receipts, expenses, profile, settings, etc).

   Public API (window.Scope):
     Scope.getUsers()              -> array of registered users
     Scope.getSession()            -> current session object or null
     Scope.setSession(session)     -> writes session (adds no fields)
     Scope.clearSession()          -> logs out (session only, keeps data)
     Scope.currentUser()           -> the logged in user record, or null
     Scope.currentUserId()         -> the logged in user's unique id, or null
     Scope.key(baseKey)            -> namespaced localStorage key for the
                                       current user, e.g. "receiptly_customers__u_abc123"
     Scope.requireLogin(loginPath) -> redirects to loginPath if nobody is
                                       logged in. Returns true if logged in.
     Scope.migrateLegacyDataIfOwner(userId) -> one-time move of old,
                                       un-scoped (pre-fix) data into the
                                       namespace of the account that
                                       originally created it.
   ============================================================ */

(function (global) {
  "use strict";

  // All the historical key names this app has used for the session /
  // user list, kept here so every page agrees on the same data no
  // matter which of the old inconsistent names it happens to read.
  var SESSION_KEYS = ["receiptpro_session", "receiptly_auth"];
  var USERS_KEYS = ["receiptly_users", "receiptpro_users"];

  // Base (un-scoped) keys that hold per-account data. These are the
  // keys that get a "__u_<userId>" suffix appended once someone is
  // logged in.
  var SCOPED_BASE_KEYS = [
    "receiptly_profile",
    "receiptly_receipts",
    "receiptly_customers",
    "receiptly_expenses",
    "receiptly_payments",
    "receiptly_products",
    "receiptly_settings",
    "receiptly_subscription",
    "receiptCounter",
    "currentReceipt"
  ];

  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  /* ---------- users ---------- */
  function getUsers() {
    for (var i = 0; i < USERS_KEYS.length; i++) {
      var raw = localStorage.getItem(USERS_KEYS[i]);
      var parsed = safeParse(raw, null);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
    return [];
  }

  function saveUsers(users) {
    // Keep both historical key names in sync so every page (old or
    // patched) sees the same user list.
    USERS_KEYS.forEach(function (k) {
      try {
        localStorage.setItem(k, JSON.stringify(users));
      } catch (e) {}
    });
  }

  /* ---------- first-run bootstrap ----------
     If browser localStorage was completely cleared, there is no user
     record to authenticate against. Create a safe local demo account
     so the app remains usable after a storage reset. This is only a
     fallback: real registered accounts are never overwritten. */
  function ensureDefaultUser() {
    var users = getUsers();
    if (users.length) return users;

    var now = new Date().toISOString();
    var demoUser = {
      id: "demo_receiptpro",
      fullName: "Demo User",
      name: "Demo User",
      email: "demo@receiptpro.com",
      phone: "+234 800 000 0000",
      businessName: "Demo Business",
      businessType: "Services",
      address: "123 Demo Street",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      password: "demo123",
      marketingOptIn: false,
      createdAt: now,
      role: "user",
      status: "active",
      theme: "light"
    };
    saveUsers([demoUser]);

    // Seed only the demo account's own namespace. Never use shared keys.
    var profileKey = "receiptly_profile__u_" + demoUser.id;
    if (!localStorage.getItem(profileKey)) {
      localStorage.setItem(profileKey, JSON.stringify({
        businessName: "Demo Business",
        address: "123 Demo Street, Lagos, Lagos, Nigeria",
        phone: "+234 800 000 0000",
        email: "demo@receiptpro.com",
        website: "",
        logo: "",
        footerMessage: "Thank you for your business!",
        currency: "₦"
      }));
    }
  }

  ensureDefaultUser();

  /* ---------- session ---------- */
  function getSession() {
    for (var i = 0; i < SESSION_KEYS.length; i++) {
      var raw = localStorage.getItem(SESSION_KEYS[i]);
      var parsed = safeParse(raw, null);
      if (parsed) return parsed;
    }
    return null;
  }

  function setSession(session) {
    // Attach a REAL tracked session (js/sessions.js) the first time a
    // session is created (login), so the same store that backs the
    // admin Sessions page can also support per-user session tracking
    // and real timeout/revocation, not just a single untracked pointer.
    // Callers that only refresh fields on an EXISTING session (no
    // userId change) keep whatever sessionId was already present.
    if (session && !session.sessionId && session.userId && global.Sessions) {
      try {
        var tracked = global.Sessions.createSession({
          actorType: "user",
          actorId: session.userId,
          actorName: session.name || "",
          actorEmail: session.email || ""
        });
        session.sessionId = tracked.id;
      } catch (e) {}
    }
    SESSION_KEYS.forEach(function (k) {
      try {
        localStorage.setItem(k, JSON.stringify(session));
      } catch (e) {}
    });
  }

  function clearSession() {
    // Logout clears ONLY the session pointer + "remember me" email.
    // It must never touch any of the SCOPED_BASE_KEYS / per-user data.
    try {
      var current = getSession();
      if (current && current.sessionId && global.Sessions) {
        global.Sessions.revokeSession(current.sessionId);
      }
    } catch (e) {}
    SESSION_KEYS.forEach(function (k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
    try {
      localStorage.removeItem("receiptpro_remember_email");
    } catch (e) {}
  }

  // Real session-timeout / revocation check, mirroring AdminAuth's
  // isCurrentSessionValid(). A session created before this fix (no
  // sessionId) or a page that hasn't loaded js/sessions.js is treated
  // as valid so nobody is unexpectedly logged out.
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

  /* ---------- current user resolution ---------- */
  function currentUser() {
    var session = getSession();
    if (!session) return null;
    var users = getUsers();
    var user = null;
    if (session.userId) {
      user = users.find(function (u) {
        return u.id === session.userId;
      });
    }
    if (!user && session.email) {
      user = users.find(function (u) {
        return (
          u.email && session.email &&
          u.email.toLowerCase() === session.email.toLowerCase()
        );
      });
    }
    return user || null;
  }

  function currentUserId() {
    var session = getSession();
    if (session && session.userId) return session.userId;
    var user = currentUser();
    if (user && user.id) return user.id;
    // Legacy sessions (pre-fix) only stored an email — fall back to a
    // stable id derived from it so data stays isolated per-email even
    // before the user record itself can be matched.
    if (session && session.email) return "legacy_" + session.email.toLowerCase();
    return null;
  }

  /* ---------- scoped key builder ---------- */
  function key(baseKey) {
    var uid = currentUserId();
    if (!uid) {
      // Nobody logged in: never fall back to the old shared/global key,
      // otherwise a logged-out screen could still read leaked data.
      return baseKey + "__u_anonymous";
    }
    return baseKey + "__u_" + uid;
  }

  /* ---------- login guard ---------- */
  function requireLogin(loginPath) {
    if (!currentUserId()) {
      window.location.href = loginPath || "../login.html";
      return false;
    }
    if (isSuspended()) {
      clearSession();
      var depth = location.pathname.indexOf("/pages/") !== -1 ? "../" : "";
      window.location.href = depth + "login.html?suspended=1";
      return false;
    }
    if (!isCurrentSessionValid()) {
      clearSession();
      var depth2 = location.pathname.indexOf("/pages/") !== -1 ? "../" : "";
      window.location.href = depth2 + "login.html?session=expired";
      return false;
    }
    return true;
  }

  /* ---------- account status (admin control) ---------- */
  // Lets the admin dashboard suspend an account. Checked on every
  // page load and on a light interval so a suspension takes effect
  // even in a tab the user already has open.
  function isSuspended() {
    var user = currentUser();
    return !!(user && user.status === "suspended");
  }

  /* ---------- subscription / billing ----------
     Separate from admin-initiated account suspension above: this is
     a per-account monthly subscription record the user manages from
     Settings > Billing. If a subscription goes past its renewal date
     without a confirmed payment, access to the app (but NOT login)
     is locked until the user submits a payment and an admin confirms
     it. This intentionally never touches user.status/isSuspended(),
     so a billing lock never triggers the "suspended by admin, blocked
     at login" flow above — the user can still log in to pay. */
  function getSubscription() {
    var raw = safeParse(localStorage.getItem(key("receiptly_subscription")), null);
    return raw && typeof raw === "object" ? raw : null;
  }

  function saveSubscription(sub) {
    try {
      localStorage.setItem(key("receiptly_subscription"), JSON.stringify(sub));
    } catch (e) {}
  }

  // Auto-suspend: if a subscription exists, is currently "active", and
  // its renewsAt date has passed, flip it to "suspended". A sub with
  // status "pending" (payment already submitted, awaiting admin) is
  // left alone so the user isn't locked out while waiting on admin.
  // Accounts with no subscription record yet are left untouched.
  function checkBillingStatus() {
    var sub = getSubscription();
    if (!sub || !sub.renewsAt) return sub;
    if (sub.status !== "active") return sub;
    var due = new Date(sub.renewsAt).getTime();
    if (isNaN(due) || Date.now() <= due) return sub;
    sub.status = "suspended";
    saveSubscription(sub);
    return sub;
  }

  function isBillingLocked() {
    var sub = getSubscription();
    return !!(sub && sub.status === "suspended");
  }

  // Bounces the user to Settings > Billing if their subscription is
  // locked, everywhere in the app except Settings itself (so they can
  // always reach the page that lets them pay).
  function enforceBillingLock() {
    var path = location.pathname;
    if (path.indexOf("/pages/") === -1) return; // only guard the app, not marketing/login/admin
    if (path.indexOf("settings.html") !== -1) return;
    if (isBillingLocked()) {
      window.location.href = "settings.html?locked=1";
    }
  }

  /* ---------- activity heartbeat (for admin "online now") ---------- */
  var ACTIVITY_KEY = "receiptly_activity";

  function touchActivity() {
    var uid = currentUserId();
    if (!uid) return;
    var map = safeParse(localStorage.getItem(ACTIVITY_KEY), {});
    map[uid] = new Date().toISOString();
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  /* ---------- one-time legacy data migration ---------- */
  // Before this fix, every account shared the SAME global keys
  // (e.g. "receiptly_customers"). We cannot know for certain which
  // account originally created that data, so — to avoid destroying
  // anyone's existing work — we migrate it exactly once into the
  // namespace of the FIRST account ever registered (users[0]), since
  // that is the account that was almost certainly used to create it.
  // Every other (newer) account starts empty, as required.
  function migrateLegacyDataIfOwner(userId) {
    if (!userId) return;
    var globalFlag = "receiptly_legacy_migration_done";
    if (localStorage.getItem(globalFlag)) return;

    var users = getUsers();
    var firstUser = users && users.length ? users[0] : null;
    if (!firstUser || firstUser.id !== userId) return;

    SCOPED_BASE_KEYS.forEach(function (base) {
      var legacyRaw = localStorage.getItem(base);
      if (legacyRaw === null) return;
      var scopedKeyName = base + "__u_" + userId;
      if (localStorage.getItem(scopedKeyName) === null) {
        localStorage.setItem(scopedKeyName, legacyRaw);
      }
      // Remove the old shared copy so it can never leak into another
      // account again.
      localStorage.removeItem(base);
    });

    localStorage.setItem(globalFlag, "1");
  }

  global.Scope = {
    getUsers: getUsers,
    saveUsers: saveUsers,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    currentUser: currentUser,
    currentUserId: currentUserId,
    key: key,
    requireLogin: requireLogin,
    migrateLegacyDataIfOwner: migrateLegacyDataIfOwner,
    SCOPED_BASE_KEYS: SCOPED_BASE_KEYS,
    isSuspended: isSuspended,
    isCurrentSessionValid: isCurrentSessionValid,
    touchActivity: touchActivity,
    getSubscription: getSubscription,
    saveSubscription: saveSubscription,
    checkBillingStatus: checkBillingStatus,
    isBillingLocked: isBillingLocked
  };

  // Record a heartbeat as soon as this script loads on any signed-in
  // page, and again every 30s while the tab stays open. Also re-checks
  // suspension periodically so an admin's suspend action takes effect
  // in already-open tabs, not just on next navigation.
  if (currentUserId()) {
    // Immediate check: a suspended account must never see so much as
    // one render of a protected page, not even for the 30s until the
    // interval below first fires.
    if (isSuspended()) {
      clearSession();
      var initialDepth = location.pathname.indexOf("/pages/") !== -1 ? "../" : "";
      window.location.href = initialDepth + "login.html?suspended=1";
    } else {
      touchActivity();
      checkBillingStatus();
      enforceBillingLock();
      global.setInterval(function () {
        touchActivity();
        checkBillingStatus();
        enforceBillingLock();
        if (isSuspended()) {
          clearSession();
          var depth = location.pathname.indexOf("/pages/") !== -1 ? "../" : "";
          window.location.href = depth + "login.html?suspended=1";
          return;
        }
        if (!isCurrentSessionValid()) {
          clearSession();
          var depth3 = location.pathname.indexOf("/pages/") !== -1 ? "../" : "";
          window.location.href = depth3 + "login.html?session=expired";
        }
      }, 30000);
    }
  }

  /* ---------- unread "Messages" badge (sidebar nav) ----------
     Runs on every page that loads user-scope.js (i.e. every
     signed-in page) so the badge next to "Messages" in the
     sidebar stays in sync no matter which page the user is on.
     Reads the same "receiptly_support_tickets" /
     "receiptly_support_messages__<id>" schema used by
     pages/messages.html and admin/admin-support.html.
  */
  function updateMessagesBadge() {
    try {
      var badge = document.getElementById("msgNavBadge");
      if (!badge) return;
      var uid = currentUserId();
      if (!uid) return;
      var tickets = JSON.parse(localStorage.getItem("receiptly_support_tickets") || "[]");
      var mine = tickets.filter(function (t) { return t.userId === uid; });
      var unread = 0;
      mine.forEach(function (t) {
        var msgs = JSON.parse(localStorage.getItem("receiptly_support_messages__" + t.id) || "[]");
        var lastRead = localStorage.getItem("receiptly_msg_last_read__" + uid + "__" + t.id);
        msgs.forEach(function (m) {
          if (m.sender === "admin" && (!lastRead || new Date(m.createdAt) > new Date(lastRead))) unread++;
        });
      });
      if (unread > 0) {
        badge.style.display = "inline-block";
        badge.textContent = unread > 9 ? "9+" : String(unread);
      } else {
        badge.style.display = "none";
      }
    } catch (e) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateMessagesBadge);
  } else {
    updateMessagesBadge();
  }
  global.addEventListener("storage", function (e) {
    if (e.key && (e.key.indexOf("receiptly_support_messages__") === 0 || e.key === "receiptly_support_tickets")) {
      updateMessagesBadge();
    }
  });
})(window);
