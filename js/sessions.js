/* ============================================================
   Receiptly — js/sessions.js
   ------------------------------------------------------------
   ONE centralized session store, shared by the admin session
   system (admin-sessions.html, account-profile.html) and,
   optionally, regular user logins. Replaces admin-sessions.html's
   old createDefaultSessions(), which fabricated four sessions for
   admin accounts that do not exist ("Jane Smith", "admin_2", ...).

   A session here represents one real sign-in (created by
   AdminAuth.setSession / Scope.setSession) and is the thing that
   actually gets checked on every protected page load. Revoking or
   expiring a session here is what makes "Revoke Session" /
   "Sign Out Other Sessions" / session-timeout real instead of
   cosmetic.

   Public API (window.Sessions):
     createSession(info)                 -> new session record (status: "active").
                                             Also enforces Security's configured
                                             maxActiveSessions for this actor by
                                             auto-revoking their oldest active
                                             sessions if the new one pushes them
                                             over the limit.
     getSessions(actorType, actorId)     -> array, newest first
     getAllSessions()                    -> every session (admin use, e.g. system health)
     getSessionById(id)                  -> session or null
     touchSession(id)                    -> updates lastActive to now
     revokeSession(id)                   -> marks revoked (cannot revoke current-of-itself; caller decides)
     revokeOtherSessions(actorType, actorId, keepId) -> revokes every OTHER session for this actor
     isSessionUsable(id)                 -> false if missing/revoked/timed-out (marks expired lazily)
     enforceSessionLimit(actorType, actorId) -> prunes oldest active sessions down
                                             to the configured maxActiveSessions;
                                             called automatically by createSession,
                                             exposed for callers (e.g. Security
                                             config-change handlers) to re-apply
                                             after the limit itself is lowered.
   ============================================================ */
(function (global) {
  "use strict";

  var KEY = "receiptly_sessions";

  function safeGetArray() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Sessions: failed to parse store", e);
      return [];
    }
  }

  function safeSaveArray(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error("Sessions: failed to save store", e);
      return false;
    }
  }

  function makeId() {
    return "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function detectDevice(ua) {
    ua = ua || "";
    if (/mobile/i.test(ua) && !/ipad|tablet/i.test(ua)) return "mobile";
    if (/ipad|tablet/i.test(ua)) return "tablet";
    return "desktop";
  }
  function detectBrowser(ua) {
    ua = ua || "";
    if (/edg/i.test(ua)) return "Edge";
    if (/chrome/i.test(ua)) return "Chrome";
    if (/firefox/i.test(ua)) return "Firefox";
    if (/safari/i.test(ua)) return "Safari";
    return "Unknown";
  }
  function detectOS(ua) {
    ua = ua || "";
    if (/windows/i.test(ua)) return "Windows";
    if (/mac os/i.test(ua)) return "macOS";
    if (/android/i.test(ua)) return "Android";
    if (/iphone|ipad|ios/i.test(ua)) return "iOS";
    if (/linux/i.test(ua)) return "Linux";
    return "Unknown";
  }

  // Enforces the configured maxActiveSessions for one actor by
  // auto-revoking their OLDEST active sessions (by lastActive) until
  // the count is back within the limit. Called right after a new
  // session is pushed, so the just-created session (newest lastActive)
  // is never the one pruned. A limit of 0/undefined means unlimited —
  // skip. This is what makes the limit actually enforced at creation
  // time, instead of only being reported after the fact by
  // Security.runSecurityTest().
  function enforceSessionLimit(actorType, actorId) {
    var limit = 0;
    try {
      if (global.Security && typeof global.Security.getConfig === "function") {
        var cfg = global.Security.getConfig();
        limit = cfg && cfg.maxActiveSessions > 0 ? cfg.maxActiveSessions : 0;
      }
    } catch (e) {}
    if (!limit) return [];

    var list = safeGetArray();
    var active = list.filter(function (s) {
      return s.actorType === actorType && s.actorId === actorId && s.status === "active";
    }).sort(function (a, b) { return a.lastActive - b.lastActive; }); // oldest first

    var overBy = active.length - limit;
    if (overBy <= 0) return [];

    var toRevoke = active.slice(0, overBy).map(function (s) { return s.id; });
    var revokedIds = [];
    var next = list.map(function (s) {
      if (toRevoke.indexOf(s.id) !== -1) {
        revokedIds.push(s.id);
        return Object.assign({}, s, { status: "revoked", revokedAt: Date.now(), revokedReason: "session_limit_exceeded" });
      }
      return s;
    });
    safeSaveArray(next);
    return revokedIds;
  }

  function createSession(info) {
    info = info || {};
    var ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    var now = Date.now();
    var session = {
      id: makeId(),
      actorType: info.actorType || "admin", // "admin" | "user"
      actorId: info.actorId,
      actorName: info.actorName || "",
      actorEmail: info.actorEmail || "",
      deviceType: info.deviceType || detectDevice(ua),
      browser: info.browser || detectBrowser(ua),
      operatingSystem: info.operatingSystem || detectOS(ua),
      ipAddress: info.ipAddress || "Local",
      location: info.location || "Unknown",
      createdAt: now,
      lastActive: now,
      status: "active"
    };
    var list = safeGetArray();
    list.push(session);
    safeSaveArray(list);
    // Enforce the configured cap now that this session is in the
    // store — prunes the actor's oldest active sessions, if any,
    // never this one (it's the newest by construction).
    enforceSessionLimit(session.actorType, session.actorId);
    return session;
  }

  function getAllSessions() {
    return safeGetArray();
  }

  function getSessions(actorType, actorId) {
    return safeGetArray()
      .filter(function (s) { return s.actorType === actorType && s.actorId === actorId; })
      .sort(function (a, b) { return b.lastActive - a.lastActive; });
  }

  function getSessionById(id) {
    return safeGetArray().find(function (s) { return s.id === id; }) || null;
  }

  function updateSession(id, patch) {
    var list = safeGetArray();
    var found = null;
    var next = list.map(function (s) {
      if (s.id === id) {
        found = Object.assign({}, s, patch);
        return found;
      }
      return s;
    });
    if (found) safeSaveArray(next);
    return found;
  }

  function touchSession(id) {
    return updateSession(id, { lastActive: Date.now() });
  }

  function revokeSession(id) {
    return updateSession(id, { status: "revoked", revokedAt: Date.now() });
  }

  function revokeOtherSessions(actorType, actorId, keepId) {
    var list = safeGetArray();
    var revokedCount = 0;
    var next = list.map(function (s) {
      if (s.actorType === actorType && s.actorId === actorId && s.id !== keepId && s.status === "active") {
        revokedCount++;
        return Object.assign({}, s, { status: "revoked", revokedAt: Date.now() });
      }
      return s;
    });
    safeSaveArray(next);
    return revokedCount;
  }

  // Returns false (and lazily flips status to "expired") if the
  // session has been revoked OR has gone idle past the configured
  // session timeout. This is what a protected page should call on
  // every load — not just "does a session object exist".
  function isSessionUsable(id) {
    var s = getSessionById(id);
    if (!s) return false;
    if (s.status === "revoked" || s.status === "expired") return false;
    if (global.Security && global.Security.isSessionTimedOut(s.lastActive)) {
      updateSession(id, { status: "expired" });
      return false;
    }
    return true;
  }

  global.Sessions = {
    createSession: createSession,
    getSessions: getSessions,
    getAllSessions: getAllSessions,
    getSessionById: getSessionById,
    touchSession: touchSession,
    revokeSession: revokeSession,
    revokeOtherSessions: revokeOtherSessions,
    isSessionUsable: isSessionUsable,
    enforceSessionLimit: enforceSessionLimit
  };
})(window);
