/* ============================================================
   Receiptly — js/storage.js
   ------------------------------------------------------------
   PHASE 1 STORAGE REPAIR

   This is the ONE central application storage API:

       HTML pages  ->  DB (this file)  ->  Scope  ->  localStorage

   It does not introduce a second storage system and does not
   replace js/user-scope.js — it is built entirely on top of the
   public Scope API (Scope.key, Scope.getSession, Scope.setSession,
   Scope.clearSession, Scope.getUsers, Scope.saveUsers) so every
   page keeps using the exact same per-account namespacing rules
   ("<baseKey>__u_<userId>") that user-scope.js already defines.

   IMPORTANT LOAD-ORDER NOTE: some existing pages include this file
   before js/user-scope.js, others after. Every function below only
   touches `Scope` at CALL time (never at parse/top-level time), so
   it works correctly either way, as long as user-scope.js has run
   by the time any DB method is actually invoked (true in every
   existing page — script tags run in document order before any
   inline handler fires).

   STORAGE KEYS
   ------------
   Per-account (namespaced via Scope.key(), i.e. "<base>__u_<userId>"):
     receiptly_profile     -> single object   (business profile)
     receiptly_receipts    -> array           (receipts)
     receiptly_customers   -> array           (customers)
     receiptly_products    -> array           (products)
     receiptly_expenses    -> array           (expenses)
     receiptly_payments    -> array           (payments)
     receiptly_settings    -> single object   (app/display settings)
     receiptly_subscription-> single object   (billing — owned by
                                                Scope, DB does not
                                                duplicate it)

   Global / not user-scoped (by design — confirmed by existing page
   behavior: admin/admin-templates.html manages ONE shared catalog
   read by every account's Template Picker; audit-log.html reads a
   single shared log and filters by userId itself):
     receiptly_templates   -> array (shared template catalog)
     receiptly_audit_log   -> array (every account + admin action;
                                      each entry carries its own
                                      userId so pages can filter to
                                      "my activity")

   Session / users (already owned by Scope — DB.getSession /
   DB.setSession / DB.clearSession / DB.getUsers are thin pass-
   throughs so every page can keep calling them on `DB` without
   caring whether Scope or DB is in scope):
     receiptpro_session, receiptly_auth  -> session (Scope)
     receiptly_users, receiptpro_users   -> user records (Scope)

   ERROR HANDLING
   --------------
   Every getter safely parses JSON and returns a sensible default
   (empty array for collections, empty object for single records)
   instead of throwing if localStorage holds missing/empty/malformed
   data. Errors are logged to the console (not swallowed silently)
   so problems are still visible during development.
   ============================================================ */

(function (global) {
  "use strict";

  function hasScope() {
    return typeof global.Scope !== "undefined" && global.Scope;
  }

  function scopedKey(base) {
    return hasScope() ? global.Scope.key(base) : base + "__u_anonymous";
  }

  function currentUserId() {
    return hasScope() ? global.Scope.currentUserId() : null;
  }

  function safeGetArray(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("DB: failed to parse array at '" + key + "', returning []", e);
      return [];
    }
  }

  function safeGetObject(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      console.error("DB: failed to parse object at '" + key + "', returning {}", e);
      return {};
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("DB: failed to write '" + key + "'", e);
      return false;
    }
  }

  function makeId(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- generic per-account collection CRUD ---------- */
  // Builds get/add/update/delete for a simple array-of-objects
  // collection stored at Scope.key(baseKey), keyed by `.id`.
  function makeCollection(baseKey, idPrefix) {
    function getAll() {
      return safeGetArray(scopedKey(baseKey));
    }
    function saveAll(list) {
      return safeSet(scopedKey(baseKey), list);
    }
    function add(record) {
      var list = getAll();
      var item = Object.assign({}, record);
      if (!item.id) item.id = makeId(idPrefix);
      if (!item.userId) item.userId = currentUserId();
      if (!item.createdAt) item.createdAt = new Date().toISOString();
      list.push(item);
      saveAll(list);
      return item;
    }
    function update(id, patch) {
      var list = getAll();
      var found = null;
      var next = list.map(function (item) {
        if (item && item.id === id) {
          found = Object.assign({}, item, patch, { id: item.id });
          found.updatedAt = new Date().toISOString();
          return found;
        }
        return item;
      });
      saveAll(next);
      return found;
    }
    function remove(id) {
      var list = getAll();
      var next = list.filter(function (item) {
        return !(item && item.id === id);
      });
      saveAll(next);
      return next.length !== list.length;
    }
    return { getAll: getAll, saveAll: saveAll, add: add, update: update, remove: remove };
  }

  var Receipts = makeCollection("receiptly_receipts", "rcpt");
  var Customers = makeCollection("receiptly_customers", "cust");
  var Products = makeCollection("receiptly_products", "prod");
  var Expenses = makeCollection("receiptly_expenses", "exp");
  var Payments = makeCollection("receiptly_payments", "pay");

  /* ---------- profile (single object, per account) ---------- */
  function getProfile() {
    return safeGetObject(scopedKey("receiptly_profile"));
  }
  function saveProfile(profile) {
    safeSet(scopedKey("receiptly_profile"), profile || {});
    return profile;
  }

  /* ---------- settings (single object, per account) ---------- */
  function getSettings() {
    return safeGetObject(scopedKey("receiptly_settings"));
  }
  function saveSettings(settings) {
    safeSet(scopedKey("receiptly_settings"), settings || {});
    return settings;
  }

  /* ---------- templates (GLOBAL — shared catalog, not per-user) ----------
     Confirmed by admin/admin-templates.html, admin-template-edit.html,
     and admin-template-view.html, which all read/write the plain
     "receiptly_templates" key with no Scope suffix, and by
     js/templates.js / js/template-picker.js which read the same
     catalog for every logged-in account. Keeping this unscoped
     preserves that existing, working behavior. */
  var TEMPLATES_KEY = "receiptly_templates";

  function getTemplates() {
    return safeGetArray(TEMPLATES_KEY);
  }
  function saveTemplates(list) {
    return safeSet(TEMPLATES_KEY, list);
  }
  function addTemplate(tpl) {
    var list = getTemplates();
    var item = Object.assign({}, tpl);
    if (!item.id) item.id = makeId("tpl");
    if (!item.createdAt) item.createdAt = new Date().toISOString();
    if (item.isDefault) {
      list = list.map(function (t) { return Object.assign({}, t, { isDefault: false }); });
    }
    list.push(item);
    saveTemplates(list);
    return item;
  }
  function updateTemplate(id, patch) {
    var list = getTemplates();
    var found = null;
    var next = list.map(function (t) {
      if (t && t.id === id) {
        found = Object.assign({}, t, patch, { id: t.id });
        return found;
      }
      return t;
    });
    saveTemplates(next);
    return found;
  }
  function deleteTemplate(id) {
    var list = getTemplates();
    var next = list.filter(function (t) { return !(t && t.id === id); });
    saveTemplates(next);
    return next.length !== list.length;
  }
  function setDefaultTemplate(id) {
    var list = getTemplates().map(function (t) {
      return Object.assign({}, t, { isDefault: t.id === id });
    });
    saveTemplates(list);
    return list.find(function (t) { return t.id === id; }) || null;
  }

  /* ---------- audit log (GLOBAL shared log, filtered per-user) ----------
     Confirmed by pages/audit-log.html's own comments: ONE shared key,
     each entry carries its own userId, "my activity" pages filter to
     the current user, "clear" only removes the current user's own
     entries. */
  var AUDIT_KEY = "receiptly_audit_log";

  function getAuditLogs() {
    return safeGetArray(AUDIT_KEY);
  }
  function addAuditLog(entry) {
    var list = getAuditLogs();
    var item = Object.assign({
      userId: currentUserId(),
      actorId: currentUserId(),
      action: "unknown",
      module: "system",
      details: "",
      targetId: null,
      targetType: null,
      userEmail: (hasScope() && global.Scope.currentUser() && global.Scope.currentUser().email) || "",
      description: ""
    }, entry, {
      id: makeId("log"),
      timestamp: new Date().toISOString()
    });
    list.push(item);
    safeSet(AUDIT_KEY, list);
    return item;
  }
  function getAuditLogsForUser(userId) {
    var uid = userId || currentUserId();
    if (!uid) return [];
    return getAuditLogs().filter(function (l) { return l && l.userId === uid; });
  }
  function clearAuditLogsForUser(userId) {
    var uid = userId || currentUserId();
    if (!uid) return;
    var remaining = getAuditLogs().filter(function (l) { return !(l && l.userId === uid); });
    safeSet(AUDIT_KEY, remaining);
  }

  /* ---------- session / users — thin pass-throughs onto Scope ----------
     DB does not own this data; Scope does. These exist purely so any
     page/script can call DB.getSession()/DB.clearSession()/etc.
     without needing to know whether Scope is also in scope. */
  function getSession() {
    return hasScope() ? global.Scope.getSession() : null;
  }
  function setSession(session) {
    if (hasScope()) global.Scope.setSession(session);
    return session;
  }
  function clearSession() {
    if (hasScope()) global.Scope.clearSession();
  }
  function getUsers() {
    return hasScope() ? global.Scope.getUsers() : [];
  }

  /* ---------- receipt integrity fingerprint + global lookup ----------
     Used by pages/verify-receipt.html to separate three DIFFERENT
     questions that used to be collapsed into one:
       1. does a receipt with this number exist ANYWHERE in this
          browser's data (any business account)?
       2. does it belong to the specific business being asked about?
       3. does its content still match what was recorded when it was
          issued (has it been edited since)?

     IMPORTANT HONESTY NOTE: this is a client-side, localStorage-only
     app. computeReceiptFingerprint() is a plain, non-cryptographic
     checksum — it can catch accidental drift or an in-app edit, but
     it provides NO real security guarantee, because anyone with
     access to this browser's storage can edit both the receipt AND
     its stored fingerprint at the same time. A genuinely tamper-proof
     public verification system needs a backend/database that the
     person doing the verifying does not control — this function is a
     best-effort, in-app "has this changed since it was issued?"
     check, not a cryptographic signature. */

  // Small, dependency-free, deterministic string hash (djb2/FNV-style).
  // Not cryptographic — do not treat this as tamper-*proof*, only
  // tamper-*evident* within this browser's own data.
  function simpleChecksum(str) {
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (h2 + c) >>> 0;
      h2 = Math.imul(h2, 2246822519) >>> 0;
    }
    return h1.toString(16) + h2.toString(16);
  }

  // Only the fields that describe what was actually issued go into
  // the fingerprint — never volatile bookkeeping fields like
  // updatedAt or the hash itself, or the check would trivially always
  // "pass" or always "fail".
  function receiptFingerprintFields(receipt) {
    return {
      receiptNumber: receipt.receiptNumber || "",
      userId: receipt.userId || "",
      businessName: receipt.businessName || "",
      customerName: receipt.customerName || "",
      items: (receipt.items || []).map(function (it) {
        return { name: it && it.name, qty: it && it.qty, price: it && it.price };
      }),
      subtotal: receipt.subtotal || 0,
      discount: receipt.discount || 0,
      taxAmount: receipt.taxAmount || 0,
      total: receipt.total || 0,
      amountPaid: receipt.amountPaid != null ? receipt.amountPaid : null,
      balanceDue: receipt.balanceDue != null ? receipt.balanceDue : null,
      createdAt: receipt.createdAt || ""
    };
  }

  function computeReceiptFingerprint(receipt) {
    if (!receipt) return null;
    try {
      return simpleChecksum(JSON.stringify(receiptFingerprintFields(receipt)));
    } catch (e) {
      console.error("DB: failed to compute receipt fingerprint", e);
      return null;
    }
  }

  // Scans every "receiptly_receipts__u_<id>" key in localStorage (i.e.
  // every business account that has ever saved a receipt in this
  // browser) and returns every receipt matching the given receipt
  // number, tagged with which account owns it. This is what makes it
  // possible to tell "doesn't exist anywhere" apart from "exists, but
  // was issued by a different business."
  function findReceiptsGlobally(receiptNumber) {
    var matches = [];
    if (!receiptNumber) return matches;
    var needle = String(receiptNumber).trim().toLowerCase();
    if (!needle) return matches;
    var prefix = "receiptly_receipts__u_";
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || key.indexOf(prefix) !== 0) continue;
      var ownerUserId = key.slice(prefix.length);
      var list = safeGetArray(key);
      var changed = false;
      list = list.map(function (r) {
        if (r && !r.integrityHash) {
          changed = true;
          return Object.assign({}, r, { integrityHash: computeReceiptFingerprint(r) });
        }
        return r;
      });
      // Lazily backfill receipts that predate the fingerprint feature,
      // using their CURRENT stored content as the baseline. This can't
      // retroactively prove nothing was ever altered before today, but
      // it means every receipt gets a real "unaltered since" baseline
      // going forward instead of a permanent "unavailable".
      if (changed) safeSet(key, list);
      list.forEach(function (r) {
        if (r && String(r.receiptNumber || "").trim().toLowerCase() === needle) {
          matches.push({ ownerUserId: ownerUserId, receipt: r });
        }
      });
    }
    return matches;
  }

  // Same lazy backfill as findReceiptsGlobally, but for the current
  // account's own receipt list (used by DB.getReceipts, i.e.
  // pages/receipts.html, dashboard widgets, exports, etc). Kept as a
  // thin wrapper around the generic Receipts collection so every
  // other Receipts.* method (add/update/remove) is untouched.
  function getReceiptsWithIntegrity() {
    var list = Receipts.getAll();
    var changed = false;
    var next = list.map(function (r) {
      if (r && !r.integrityHash) {
        changed = true;
        return Object.assign({}, r, { integrityHash: computeReceiptFingerprint(r) });
      }
      return r;
    });
    if (changed) Receipts.saveAll(next);
    return next;
  }

  /* ---------- clear all data for the CURRENT account ----------
     Used by pages/settings.html's "Delete all data" button. Wipes
     every per-account collection/profile/settings key for the
     currently signed-in user ONLY — never another account's data,
     never the shared template catalog, never other users' audit
     history. The caller (settings.html) already re-applies the
     session afterward so the user isn't logged out. */
  function clearData() {
    var uid = currentUserId();
    if (!uid) return;
    var bases = (hasScope() && global.Scope.SCOPED_BASE_KEYS) || [
      "receiptly_profile", "receiptly_receipts", "receiptly_customers",
      "receiptly_expenses", "receiptly_payments", "receiptly_products",
      "receiptly_settings", "receiptly_subscription"
    ];
    bases.forEach(function (base) {
      try { localStorage.removeItem(base + "__u_" + uid); } catch (e) {}
    });
    // This account's own audit history should go too, since "delete
    // all my data" is meant to be a full local reset for this user.
    clearAuditLogsForUser(uid);
  }

  /* ---------- purge ALL data for an ARBITRARY user (admin delete) ----------
     Used by admin/admin-users.html when an admin deletes an account.
     Unlike clearData() above, this takes an explicit userId (not
     necessarily the current session) and also removes that user's
     audit history, matching the existing fallback behavior in
     admin-users.html (which scans localStorage for any "__u_<id>"
     suffixed key). */
  function purgeUserData(userId) {
    if (!userId) return;
    var suffix = "__u_" + userId;
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(suffix) !== -1) keysToRemove.push(k);
    }
    keysToRemove.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    clearAuditLogsForUser(userId);
  }

  global.DB = {
    // profile
    getProfile: getProfile,
    saveProfile: saveProfile,

    // receipts
    getReceipts: getReceiptsWithIntegrity,
    addReceipt: Receipts.add,
    updateReceipt: Receipts.update,
    deleteReceipt: Receipts.remove,

    // customers
    getCustomers: Customers.getAll,
    addCustomer: Customers.add,
    updateCustomer: Customers.update,
    deleteCustomer: Customers.remove,

    // products
    getProducts: Products.getAll,
    addProduct: Products.add,
    updateProduct: Products.update,
    deleteProduct: Products.remove,

    // expenses
    getExpenses: Expenses.getAll,
    addExpense: Expenses.add,
    updateExpense: Expenses.update,
    deleteExpense: Expenses.remove,

    // payments
    getPayments: Payments.getAll,
    addPayment: Payments.add,
    updatePayment: Payments.update,
    deletePayment: Payments.remove,

    // settings
    getSettings: getSettings,
    saveSettings: saveSettings,

    // templates (global catalog)
    getTemplates: getTemplates,
    addTemplate: addTemplate,
    updateTemplate: updateTemplate,
    deleteTemplate: deleteTemplate,
    setDefaultTemplate: setDefaultTemplate,

    // audit log (global, filtered per-user)
    getAuditLogs: getAuditLogs,
    getAuditLogsForUser: getAuditLogsForUser,
    addAuditLog: addAuditLog,
    clearAuditLogsForUser: clearAuditLogsForUser,

    // session / users (pass-through onto Scope)
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    getUsers: getUsers,

    // bulk data management
    clearData: clearData,
    purgeUserData: purgeUserData,

    // receipt verification (see comment block above these functions)
    computeReceiptFingerprint: computeReceiptFingerprint,
    findReceiptsGlobally: findReceiptsGlobally
  };
})(window);
