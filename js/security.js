/* ============================================================
   Receiptly — js/security.js
   ------------------------------------------------------------
   ONE centralized, application-wide security module. Replaces the
   old admin-security.html-local "gatherFormData()" config object
   (which was saved but never read by anything else) with a real
   config that login.html, admin-login.html, user-scope.js and
   admin-auth.js all actually consult.

   Public API (window.Security):
     getConfig()                    -> current security config (merged w/ defaults)
     saveConfig(patch)               -> shallow-merges patch into config, persists
     resetConfig()                   -> restores hard-coded defaults
     recordEvent(evt)                -> audit-log entry (module: "security")
     checkLoginAllowed(identifier)   -> {allowed, remainingAttempts, lockedUntil}
     recordFailedLogin(identifier)   -> increments counter, applies lockout if tripped
     recordSuccessfulLogin(identifier)-> clears counter for this identifier
     resetLoginAttempts(identifier)  -> clears counter for ONE identifier
     resetAllLoginAttempts()         -> clears every tracked identifier ("Reset Login Attempt Counter")
     validatePassword(pw)            -> {ok, errors[]} against configured password policy
     isSessionTimedOut(lastActiveMs) -> boolean, using configured sessionTimeout (minutes)
     requireSensitiveVerification(admin, password) -> {ok, error} — used before
                                        destructive/sensitive actions when the
                                        config's requireSensitiveVerify is on
     runSecurityTest()               -> {score, checks:[{key,label,status,detail}]}
                                        computed from REAL current config + REAL
                                        current state (not hardcoded pass/fail)
   ============================================================ */
(function (global) {
  "use strict";

  var CONFIG_KEY = "receiptly_security_config"; // single, global — not per-admin-id
  var LEGACY_CONFIG_PREFIX = "receiptly_security_settings_"; // old per-admin key, migrated in once
  var ATTEMPTS_KEY = "receiptly_login_attempts"; // { identifier: {count, lockedUntil, lastAttemptAt} }

  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Security: failed to write '" + key + "'", e);
      return false;
    }
  }

  function getDefaults() {
    return {
      twoFactorRequired: false,
      minPasswordLength: 8,
      passwordRequireUppercase: true,
      passwordRequireNumber: true,
      passwordRequireSymbol: false,
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 15,
      sessionTimeoutMinutes: 60,
      maxActiveSessions: 5,
      requireSensitiveVerify: true,
      updatedAt: null
    };
  }

  // One-time migration from the old per-admin-id key created by a
  // prior version of admin-security.html, so settings someone already
  // configured are not silently discarded by this fix.
  function migrateLegacyIfNeeded() {
    try {
      if (localStorage.getItem(CONFIG_KEY)) return; // already migrated / already exists
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LEGACY_CONFIG_PREFIX) === 0) {
          var legacy = safeParse(localStorage.getItem(k), null);
          if (legacy && typeof legacy === "object") {
            var merged = Object.assign({}, getDefaults(), {
              twoFactorRequired: !!legacy.twoFactorEnabled,
              minPasswordLength: legacy.minPasswordLength || 8,
              maxLoginAttempts: legacy.maxLoginAttempts != null ? legacy.maxLoginAttempts : 5,
              sessionTimeoutMinutes: legacy.sessionTimeout || 60,
              maxActiveSessions: legacy.maxActiveSessions != null ? legacy.maxActiveSessions : 5,
              requireSensitiveVerify: !!legacy.requireSensitiveVerify
            });
            safeSet(CONFIG_KEY, merged);
            return;
          }
        }
      }
    } catch (e) {}
  }

  function getConfig() {
    migrateLegacyIfNeeded();
    var stored = safeParse(localStorage.getItem(CONFIG_KEY), null);
    if (!stored || typeof stored !== "object") return getDefaults();
    return Object.assign({}, getDefaults(), stored);
  }

  function saveConfig(patch) {
    var next = Object.assign({}, getConfig(), patch || {}, { updatedAt: new Date().toISOString() });
    safeSet(CONFIG_KEY, next);
    recordEvent({ action: "security_config_updated", description: "Security configuration updated" });
    return next;
  }

  function resetConfig() {
    var defaults = Object.assign({}, getDefaults(), { updatedAt: new Date().toISOString() });
    safeSet(CONFIG_KEY, defaults);
    recordEvent({ action: "security_config_reset", description: "Security configuration reset to defaults" });
    return defaults;
  }

  /* ---------- audit log passthrough ---------- */
  function recordEvent(evt) {
    try {
      if (typeof global.DB === "undefined" || !global.DB.addAuditLog) return null;
      var actor = null;
      try {
        if (typeof global.AdminAuth !== "undefined" && global.AdminAuth.currentAdmin) {
          actor = global.AdminAuth.currentAdmin();
        }
      } catch (e) {}
      var entry = Object.assign({
        module: "security",
        targetType: "security",
        actorId: actor ? actor.id : (evt.actorId || "system"),
        userId: actor ? actor.id : (evt.actorId || "system"),
        userEmail: actor ? actor.email : (evt.actorEmail || undefined)
      }, evt);
      return global.DB.addAuditLog(entry);
    } catch (e) {
      console.error("Security: failed to record event", e);
      return null;
    }
  }

  /* ---------- login attempt tracking + lockout ---------- */
  function getAttemptsMap() {
    return safeParse(localStorage.getItem(ATTEMPTS_KEY), {});
  }
  function saveAttemptsMap(map) {
    safeSet(ATTEMPTS_KEY, map);
  }
  function normId(identifier) {
    return String(identifier || "").trim().toLowerCase();
  }

  function checkLoginAllowed(identifier) {
    var cfg = getConfig();
    var id = normId(identifier);
    var map = getAttemptsMap();
    var rec = map[id];
    if (!rec) return { allowed: true, remainingAttempts: cfg.maxLoginAttempts, lockedUntil: null };
    if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
      return { allowed: false, remainingAttempts: 0, lockedUntil: rec.lockedUntil };
    }
    // Lock has expired (or never set) — clear it lazily and report attempts left.
    if (rec.lockedUntil && Date.now() >= rec.lockedUntil) {
      delete map[id];
      saveAttemptsMap(map);
      return { allowed: true, remainingAttempts: cfg.maxLoginAttempts, lockedUntil: null };
    }
    var used = rec.count || 0;
    return { allowed: true, remainingAttempts: Math.max(0, cfg.maxLoginAttempts - used), lockedUntil: null };
  }

  function recordFailedLogin(identifier) {
    var cfg = getConfig();
    var id = normId(identifier);
    if (!cfg.maxLoginAttempts || cfg.maxLoginAttempts <= 0) return checkLoginAllowed(id); // limit disabled
    var map = getAttemptsMap();
    var rec = map[id] || { count: 0, lockedUntil: null };
    rec.count = (rec.count || 0) + 1;
    rec.lastAttemptAt = new Date().toISOString();
    var locked = false;
    if (rec.count >= cfg.maxLoginAttempts) {
      rec.lockedUntil = Date.now() + (cfg.lockoutDurationMinutes || 15) * 60000;
      rec.count = 0; // reset the counter once locked, so unlocking starts fresh
      locked = true;
    }
    map[id] = rec;
    saveAttemptsMap(map);
    if (locked) {
      recordEvent({
        action: "account_locked",
        description: "Account locked after repeated failed login attempts: " + id,
        actorEmail: id
      });
    }
    return checkLoginAllowed(id);
  }

  function recordSuccessfulLogin(identifier) {
    var id = normId(identifier);
    var map = getAttemptsMap();
    if (map[id]) {
      delete map[id];
      saveAttemptsMap(map);
    }
  }

  function resetLoginAttempts(identifier) {
    var id = normId(identifier);
    var map = getAttemptsMap();
    delete map[id];
    saveAttemptsMap(map);
  }

  function resetAllLoginAttempts() {
    saveAttemptsMap({});
    recordEvent({ action: "login_attempts_reset", description: "All login-attempt counters were reset" });
  }

  /* ---------- password policy ---------- */
  function validatePassword(pw) {
    var cfg = getConfig();
    var errors = [];
    pw = pw || "";
    if (pw.length < cfg.minPasswordLength) {
      errors.push("Must be at least " + cfg.minPasswordLength + " characters long.");
    }
    if (cfg.passwordRequireUppercase && !/[A-Z]/.test(pw)) {
      errors.push("Must include at least one uppercase letter.");
    }
    if (cfg.passwordRequireNumber && !/[0-9]/.test(pw)) {
      errors.push("Must include at least one number.");
    }
    if (cfg.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(pw)) {
      errors.push("Must include at least one symbol.");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------- session timeout ---------- */
  function isSessionTimedOut(lastActiveMs) {
    var cfg = getConfig();
    if (!cfg.sessionTimeoutMinutes || cfg.sessionTimeoutMinutes <= 0) return false;
    if (!lastActiveMs) return false;
    return (Date.now() - lastActiveMs) > cfg.sessionTimeoutMinutes * 60000;
  }

  /* ---------- sensitive-action verification ---------- */
  // Used before destructive/sensitive admin actions (delete role,
  // delete admin, reset security config, etc.) when the config asks
  // for it. Re-checks the CURRENT admin's real password against the
  // real admin record — this is a real re-auth check, not a modal
  // that always resolves true.
  function requireSensitiveVerification(admin, password) {
    var cfg = getConfig();
    if (!cfg.requireSensitiveVerify) return { ok: true };
    if (!admin) return { ok: false, error: "Not signed in." };
    if (!password) return { ok: false, error: "Please re-enter your password to confirm this action." };
    if (admin.password !== password) return { ok: false, error: "Incorrect password." };
    return { ok: true };
  }

  /* ---------- real security test ---------- */
  // Every check here reads the ACTUAL current config and, where
  // possible, ACTUAL current state (real session counts, real admin
  // 2FA adoption) rather than returning a canned result. Running it
  // twice in a row with different config produces different output —
  // that's what "not hardcoded" is verified against below.
  function runSecurityTest() {
    var cfg = getConfig();
    var checks = [];

    function addCheck(key, label, status, detail) {
      checks.push({ key: key, label: label, status: status, detail: detail });
    }

    // 2FA
    var admins = [];
    try { admins = (global.AdminAuth && global.AdminAuth.getAdmins) ? global.AdminAuth.getAdmins() : []; } catch (e) {}
    var without2fa = admins.filter(function (a) { return !a.twoFactorEnabled; });
    if (cfg.twoFactorRequired && without2fa.length > 0) {
      addCheck("2fa", "Two-factor authentication", "FAIL",
        without2fa.length + " of " + admins.length + " administrator(s) have not enabled 2FA, but it is required.");
    } else if (cfg.twoFactorRequired) {
      addCheck("2fa", "Two-factor authentication", "PASS", "Required, and all administrators have it enabled.");
    } else {
      addCheck("2fa", "Two-factor authentication", "WARNING", "Not required. Consider requiring 2FA for all administrators.");
    }

    // Password policy
    if (cfg.minPasswordLength >= 12 && cfg.passwordRequireUppercase && cfg.passwordRequireNumber) {
      addCheck("password", "Password policy", "PASS", "Minimum length " + cfg.minPasswordLength + " with complexity rules enforced.");
    } else if (cfg.minPasswordLength >= 8) {
      addCheck("password", "Password policy", "WARNING", "Minimum length is " + cfg.minPasswordLength + ". Recommend 12+ with uppercase and number required.");
    } else {
      addCheck("password", "Password policy", "FAIL", "Minimum length is only " + cfg.minPasswordLength + " characters.");
    }

    // Login attempt limit
    if (cfg.maxLoginAttempts > 0 && cfg.maxLoginAttempts <= 5) {
      addCheck("lockout", "Login attempt protection", "PASS", "Locks after " + cfg.maxLoginAttempts + " failed attempts for " + cfg.lockoutDurationMinutes + " minutes.");
    } else if (cfg.maxLoginAttempts > 0) {
      addCheck("lockout", "Login attempt protection", "WARNING", "Locks after " + cfg.maxLoginAttempts + " attempts — consider lowering to 5 or fewer.");
    } else {
      addCheck("lockout", "Login attempt protection", "FAIL", "No login-attempt limit is configured. Brute-force attempts are not blocked.");
    }

    // Currently-locked-out accounts (real state)
    var attemptsMap = getAttemptsMap();
    var lockedNow = Object.keys(attemptsMap).filter(function (id) {
      return attemptsMap[id].lockedUntil && attemptsMap[id].lockedUntil > Date.now();
    });
    if (lockedNow.length > 0) {
      addCheck("active-lockouts", "Active lockouts", "WARNING", lockedNow.length + " account(s) currently locked out: " + lockedNow.join(", "));
    }

    // Session timeout
    if (cfg.sessionTimeoutMinutes > 0 && cfg.sessionTimeoutMinutes <= 60) {
      addCheck("timeout", "Session timeout", "PASS", "Sessions expire after " + cfg.sessionTimeoutMinutes + " minutes of inactivity.");
    } else if (cfg.sessionTimeoutMinutes > 60) {
      addCheck("timeout", "Session timeout", "WARNING", cfg.sessionTimeoutMinutes + " minutes is longer than recommended (60).");
    } else {
      addCheck("timeout", "Session timeout", "FAIL", "Sessions never time out.");
    }

    // Active session count vs configured max (real state, via Sessions module)
    try {
      if (global.Sessions && global.AdminAuth) {
        var overLimit = [];
        admins.forEach(function (a) {
          var active = global.Sessions.getSessions("admin", a.id).filter(function (s) {
            return s.status === "active" && !isSessionTimedOut(s.lastActive);
          });
          if (cfg.maxActiveSessions > 0 && active.length > cfg.maxActiveSessions) {
            overLimit.push(a.email + " (" + active.length + ")");
          }
        });
        if (overLimit.length) {
          addCheck("session-limit", "Maximum active sessions", "FAIL", "Over the configured limit of " + cfg.maxActiveSessions + ": " + overLimit.join(", "));
        } else if (cfg.maxActiveSessions > 0) {
          addCheck("session-limit", "Maximum active sessions", "PASS", "Limit of " + cfg.maxActiveSessions + " is being respected.");
        } else {
          addCheck("session-limit", "Maximum active sessions", "WARNING", "No limit is configured.");
        }
      }
    } catch (e) {}

    // Sensitive action verification
    addCheck("sensitive-verify", "Sensitive-action verification", cfg.requireSensitiveVerify ? "PASS" : "WARNING",
      cfg.requireSensitiveVerify ? "Re-authentication is required before destructive actions." : "Destructive actions do not require re-authentication.");

    var weights = { PASS: 100, WARNING: 55, FAIL: 0 };
    var score = checks.length
      ? Math.round(checks.reduce(function (sum, c) { return sum + weights[c.status]; }, 0) / checks.length)
      : 0;

    recordEvent({ action: "security_test_run", description: "Security test run — score " + score + "/100" });

    return { score: score, checks: checks, ranAt: new Date().toISOString() };
  }

  global.Security = {
    getConfig: getConfig,
    saveConfig: saveConfig,
    resetConfig: resetConfig,
    recordEvent: recordEvent,
    checkLoginAllowed: checkLoginAllowed,
    recordFailedLogin: recordFailedLogin,
    recordSuccessfulLogin: recordSuccessfulLogin,
    resetLoginAttempts: resetLoginAttempts,
    resetAllLoginAttempts: resetAllLoginAttempts,
    validatePassword: validatePassword,
    isSessionTimedOut: isSessionTimedOut,
    requireSensitiveVerification: requireSensitiveVerification,
    runSecurityTest: runSecurityTest
  };
})(window);
