/* ============================================================
   Receiptly — js/two-factor.js
   ------------------------------------------------------------
   Adds an optional second login step ("two-step verification")
   on top of the existing password-only login, for BOTH the
   regular user account system (Scope/receiptly_users) and the
   separate admin account system (AdminAuth/receiptly_admins).

   Nothing here talks to a server — like the rest of this app it
   is a local, browser-only demo — so the "second factor" is a
   secret code the account owner sets for themselves from
   Settings (user) or Admin Settings (admin), and is then asked
   to re-enter every time they sign in, after their email +
   password already checked out.

   Storage: two new fields are added directly onto the existing
   user / admin record (no new storage system):
     twoFactorEnabled -> boolean
     twoFactorCode    -> string (4-8 characters, the secret code)

   Public API (window.TwoFactor):
     TwoFactor.isEnabledForUser(user)   -> boolean
     TwoFactor.isEnabledForAdmin(admin) -> boolean
     TwoFactor.setupForUser()           -> Promise<boolean>  (shows the
                                            styled Popup.prompt flow to
                                            turn ON 2FA for the signed-in
                                            user; saves via Scope)
     TwoFactor.disableForUser()         -> Promise<boolean>  (asks for the
                                            current code, then turns 2FA off)
     TwoFactor.setupForAdmin()          -> Promise<boolean>  (same, for the
                                            signed-in admin; saves via
                                            AdminAuth.updateAdmin)
     TwoFactor.disableForAdmin()        -> Promise<boolean>
     TwoFactor.verify(expectedCode)     -> Promise<boolean>  (shows the
                                            styled Popup.prompt "enter your
                                            code" step used during login;
                                            resolves true only on a match)
   Requires js/ui-popup.js (Popup) to already be loaded on the page.
   ============================================================ */
(function (global) {
  "use strict";

  function normalizeCode(raw) {
    return String(raw || "").trim();
  }

  function isEnabledForUser(user) {
    return !!(user && user.twoFactorEnabled && user.twoFactorCode);
  }

  function isEnabledForAdmin(admin) {
    return !!(admin && admin.twoFactorEnabled && admin.twoFactorCode);
  }

  function validCodeError(code, confirmCode) {
    if (!code || code.length < 4 || code.length > 8) {
      return "Your code must be 4-8 characters.";
    }
    if (confirmCode !== undefined && code !== confirmCode) {
      return "Codes do not match.";
    }
    return null;
  }

  /* ---------- the "enter your code" step shown during login ---------- */
  function verify(expectedCode) {
    if (typeof Popup === "undefined") {
      // Fallback so a page that forgot to load ui-popup.js still works,
      // rather than silently letting anyone through.
      var entered = window.prompt("Enter your two-step verification code:");
      return Promise.resolve(normalizeCode(entered) === normalizeCode(expectedCode));
    }
    return Popup.prompt({
      title: "Two-step verification",
      message: "Enter the secret code you set up for your account to finish signing in.",
      submitText: "Verify & continue",
      cancelText: "Cancel",
      fields: [
        { id: "code", label: "Verification code", type: "password", placeholder: "Enter your code", maxlength: 8, inputmode: "text", autocomplete: "one-time-code" }
      ],
      validate: function (values) {
        if (!normalizeCode(values.code)) return "Please enter your verification code.";
        return null;
      }
    }).then(function (values) {
      if (!values) return false;
      var ok = normalizeCode(values.code) === normalizeCode(expectedCode);
      if (!ok && typeof Popup !== "undefined") {
        Popup.alert({ title: "Incorrect code", message: "That verification code doesn't match. Please try again.", danger: true });
      }
      return ok;
    });
  }

  /* ---------- turn ON 2FA (shared prompt flow) ---------- */
  function runSetupFlow(saveFn) {
    return Popup.prompt({
      title: "Turn on two-step verification",
      message: "Create a secret code (4-8 characters). You'll be asked for it every time you sign in, in addition to your password.",
      submitText: "Turn on",
      cancelText: "Cancel",
      fields: [
        { id: "code", label: "Create a secret code", type: "password", placeholder: "e.g. 4-8 characters", maxlength: 8, autocomplete: "new-password" },
        { id: "confirm", label: "Confirm secret code", type: "password", placeholder: "Re-enter your code", maxlength: 8, autocomplete: "new-password" }
      ],
      validate: function (values) {
        return validCodeError(normalizeCode(values.code), normalizeCode(values.confirm));
      }
    }).then(function (values) {
      if (!values) return false;
      saveFn(normalizeCode(values.code));
      Popup.alert({ title: "Two-step verification is on", message: "From now on you'll be asked for your secret code every time you sign in. Keep it somewhere safe.", danger: false });
      return true;
    });
  }

  /* ---------- turn OFF 2FA (shared prompt flow) ---------- */
  function runDisableFlow(currentCode, saveFn) {
    return Popup.prompt({
      title: "Turn off two-step verification",
      message: "Enter your current secret code to confirm you want to turn this off.",
      submitText: "Turn off",
      cancelText: "Cancel",
      fields: [
        { id: "code", label: "Current secret code", type: "password", placeholder: "Enter your code", maxlength: 8, autocomplete: "off" }
      ],
      validate: function (values) {
        if (normalizeCode(values.code) !== normalizeCode(currentCode)) return "That code is incorrect.";
        return null;
      }
    }).then(function (values) {
      if (!values) return false;
      saveFn();
      Popup.alert({ title: "Two-step verification is off", message: "You'll only need your password to sign in from now on.", danger: false });
      return true;
    });
  }

  /* ---------- user-side wiring (Scope) ---------- */
  function setupForUser() {
    if (typeof Scope === "undefined") return Promise.resolve(false);
    return runSetupFlow(function (code) {
      var uid = Scope.currentUserId();
      var users = Scope.getUsers();
      var next = users.map(function (u) {
        if (u.id !== uid) return u;
        return Object.assign({}, u, { twoFactorEnabled: true, twoFactorCode: code });
      });
      Scope.saveUsers(next);
    });
  }

  function disableForUser() {
    if (typeof Scope === "undefined") return Promise.resolve(false);
    var user = Scope.currentUser();
    if (!isEnabledForUser(user)) return Promise.resolve(false);
    return runDisableFlow(user.twoFactorCode, function () {
      var uid = Scope.currentUserId();
      var users = Scope.getUsers();
      var next = users.map(function (u) {
        if (u.id !== uid) return u;
        return Object.assign({}, u, { twoFactorEnabled: false, twoFactorCode: "" });
      });
      Scope.saveUsers(next);
    });
  }

  /* ---------- admin-side wiring (AdminAuth) ---------- */
  function setupForAdmin() {
    if (typeof AdminAuth === "undefined") return Promise.resolve(false);
    return runSetupFlow(function (code) {
      var admin = AdminAuth.currentAdmin();
      if (admin) AdminAuth.updateAdmin(admin.id, { twoFactorEnabled: true, twoFactorCode: code });
    });
  }

  function disableForAdmin() {
    if (typeof AdminAuth === "undefined") return Promise.resolve(false);
    var admin = AdminAuth.currentAdmin();
    if (!isEnabledForAdmin(admin)) return Promise.resolve(false);
    return runDisableFlow(admin.twoFactorCode, function () {
      AdminAuth.updateAdmin(admin.id, { twoFactorEnabled: false, twoFactorCode: "" });
    });
  }

  global.TwoFactor = {
    isEnabledForUser: isEnabledForUser,
    isEnabledForAdmin: isEnabledForAdmin,
    setupForUser: setupForUser,
    disableForUser: disableForUser,
    setupForAdmin: setupForAdmin,
    disableForAdmin: disableForAdmin,
    verify: verify
  };
})(window);
