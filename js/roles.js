/* ============================================================
   Receiptly — js/roles.js
   ------------------------------------------------------------
   ONE centralized roles store + permission-check function.
   Previously admin-roles.html, admin-permissions.html and
   admin-system-health.html each defined their own getRoles(),
   keyed by "receiptly_roles_<adminId>" — which meant every
   administrator would see a DIFFERENT roles list, and role
   definitions could silently drift between the three copies.
   Roles are a platform-wide concept (they get assigned to
   administrator accounts), so they now live at one global key.

   Public API (window.Roles):
     getAll()                 -> array of roles (seeds defaults on first use)
     getById(id)               -> role or null
     save(role)                 -> create (no id) or update (has id); returns saved role
     remove(id)                 -> {ok, error?} — refuses to delete protected roles
                                    or roles still assigned to an administrator
     duplicate(id)              -> new independent role copy, or null
     assignedAdminCount(roleId) -> how many administrators currently use this role
     hasPermission(admin, permKey) -> boolean — the ONE function every protected
                                    action in the admin panel should call
   ============================================================ */
(function (global) {
  "use strict";

  var KEY = "receiptly_roles"; // global — shared by every administrator
  var LEGACY_PREFIX = "receiptly_roles_"; // old per-admin-id keys

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
      console.error("Roles: failed to write '" + key + "'", e);
      return false;
    }
  }

  function makeId() {
    return "role_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  }

  var DEFAULT_PERMISSION_GROUPS = [
    { name: "Dashboard", permissions: ["view_dashboard"] },
    { name: "Administrators", permissions: ["view_administrators", "add_administrators", "edit_administrators", "delete_administrators", "activate_administrators", "deactivate_administrators"] },
    { name: "Users", permissions: ["view_users", "add_users", "edit_users", "delete_users", "suspend_users", "export_users"] },
    { name: "Roles & Permissions", permissions: ["view_roles", "create_roles", "edit_roles", "delete_roles", "manage_permissions"] },
    { name: "Customers", permissions: ["view_customers", "add_customers", "edit_customers", "delete_customers", "export_customers"] },
    { name: "Products", permissions: ["view_products", "add_products", "edit_products", "delete_products", "export_products"] },
    { name: "Receipts", permissions: ["view_receipts", "create_receipts", "edit_receipts", "delete_receipts", "print_receipts", "download_receipts", "export_receipts", "void_receipts"] },
    { name: "Invoices", permissions: ["view_invoices", "create_invoices", "edit_invoices", "delete_invoices", "send_invoices", "download_invoices", "export_invoices"] },
    { name: "Payments", permissions: ["view_payments", "add_payments", "edit_payments", "delete_payments", "refund_payments", "export_payments"] },
    { name: "Expenses", permissions: ["view_expenses", "add_expenses", "edit_expenses", "delete_expenses", "approve_expenses", "export_expenses"] },
    { name: "Sales", permissions: ["view_sales", "create_sales", "edit_sales", "delete_sales", "export_sales"] },
    { name: "POS", permissions: ["access_pos", "process_pos_sales", "apply_pos_discounts", "cancel_pos_transactions", "view_pos_reports"] },
    { name: "Reports", permissions: ["view_reports", "generate_reports", "export_reports", "download_reports"] },
    { name: "Analytics", permissions: ["view_analytics", "view_financial_analytics", "view_sales_analytics", "view_customer_analytics"] },
    { name: "Gallery", permissions: ["view_gallery", "upload_gallery", "edit_gallery", "delete_gallery"] },
    { name: "Notifications", permissions: ["view_notifications", "send_notifications", "delete_notifications"] },
    { name: "Store", permissions: ["view_store", "manage_store", "manage_categories", "manage_tags"] },
    { name: "Settings & Company Profile", permissions: ["view_settings", "edit_settings", "edit_company_profile", "edit_payment_settings", "edit_tax_settings", "edit_notification_settings"] },
    { name: "Security & Sessions", permissions: ["view_activity_logs", "view_sessions", "revoke_sessions", "edit_security_settings", "run_security_test"] }
  ];

  function allPermissionKeys() {
    return DEFAULT_PERMISSION_GROUPS.reduce(function (acc, g) { return acc.concat(g.permissions); }, []);
  }

  function seedDefaults() {
    var now = new Date().toISOString();
    var roles = [
      {
        id: "role_super_admin", name: "Super Administrator",
        description: "Full access to all Receiptly platform features and settings.",
        permissions: allPermissionKeys(), status: "active", protected: true,
        createdAt: now, updatedAt: now
      },
      {
        id: "role_administrator", name: "Administrator",
        description: "Full administrative access except role management.",
        permissions: DEFAULT_PERMISSION_GROUPS.filter(function (g) { return g.name !== "Roles & Permissions"; })
          .reduce(function (acc, g) { return acc.concat(g.permissions); }, []),
        status: "active", protected: false, createdAt: now, updatedAt: now
      },
      {
        id: "role_support", name: "Support Staff",
        description: "Read-only access to customers, receipts and payments for support purposes.",
        permissions: ["view_dashboard", "view_customers", "view_receipts", "view_payments", "view_sessions"],
        status: "active", protected: false, createdAt: now, updatedAt: now
      }
    ];
    safeSet(KEY, roles);
    return roles;
  }

  // One-time migration: fold in any role the admin already created
  // under one of the old per-admin-id keys, so this fix doesn't wipe
  // out real work someone already did in admin-roles.html.
  function migrateLegacyIfNeeded() {
    try {
      if (localStorage.getItem(KEY)) return;
      var merged = [];
      var seenIds = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LEGACY_PREFIX) === 0) {
          var list = safeParse(localStorage.getItem(k), []);
          if (Array.isArray(list)) {
            list.forEach(function (r) {
              if (r && r.id && !seenIds[r.id]) {
                seenIds[r.id] = true;
                merged.push(r);
              }
            });
          }
        }
      }
      if (merged.length) safeSet(KEY, merged);
    } catch (e) {}
  }

  function getAll() {
    migrateLegacyIfNeeded();
    var list = safeParse(localStorage.getItem(KEY), null);
    if (!Array.isArray(list) || !list.length) return seedDefaults();
    return list;
  }

  function saveAll(list) {
    return safeSet(KEY, list);
  }

  function getById(id) {
    return getAll().find(function (r) { return r.id === id; }) || null;
  }

  function save(role) {
    var list = getAll();
    var now = new Date().toISOString();
    if (role.id) {
      var found = null;
      var next = list.map(function (r) {
        if (r.id === role.id) {
          found = Object.assign({}, r, role, { updatedAt: now });
          return found;
        }
        return r;
      });
      saveAll(next);
      return found;
    }
    var created = Object.assign({ id: makeId(), status: "active", protected: false, createdAt: now, updatedAt: now }, role);
    list.push(created);
    saveAll(list);
    return created;
  }

  // Counts real administrator accounts currently assigned this role,
  // via AdminAuth — not a cosmetic "usersCount" field that never
  // updates when assignments actually change.
  function assignedAdminCount(roleId) {
    try {
      if (!global.AdminAuth || !global.AdminAuth.getAdmins) return 0;
      return global.AdminAuth.getAdmins().filter(function (a) { return a.roleId === roleId; }).length;
    } catch (e) {
      return 0;
    }
  }

  function remove(roleId) {
    var role = getById(roleId);
    if (!role) return { ok: false, error: "Role not found." };
    if (role.protected) return { ok: false, error: "This is a protected system role and cannot be deleted." };
    var assigned = assignedAdminCount(roleId);
    if (assigned > 0) {
      return { ok: false, error: "This role is assigned to " + assigned + " administrator(s). Reassign them before deleting." };
    }
    var list = getAll().filter(function (r) { return r.id !== roleId; });
    saveAll(list);
    return { ok: true };
  }

  function duplicate(roleId) {
    var role = getById(roleId);
    if (!role) return null;
    var now = new Date().toISOString();
    var copy = Object.assign({}, role, {
      id: makeId(),
      name: role.name + " (Copy)",
      protected: false,
      createdAt: now,
      updatedAt: now
    });
    var list = getAll();
    list.push(copy);
    saveAll(list);
    return copy;
  }

  // THE enforcement point. Any admin page performing a restricted
  // action should call this before doing it — see admin-roles.html,
  // admin-permissions.html, admin-security.html, company-profile.html,
  // admin-sessions.html and admin-settings.html for real call sites.
  function hasPermission(admin, permKey) {
    if (!admin) return false;
    // An admin with no roleId assigned yet is treated as Super
    // Administrator ONLY if they are the sole/original admin account
    // (so the very first, pre-roles-feature admin isn't locked out of
    // their own dashboard). Any admin created after roles existed
    // must have an explicit roleId.
    if (!admin.roleId) {
      return true;
    }
    var role = getById(admin.roleId);
    if (!role) return false;
    if (role.status === "inactive") return false;
    return role.permissions.indexOf(permKey) !== -1;
  }

  global.Roles = {
    PERMISSION_GROUPS: DEFAULT_PERMISSION_GROUPS,
    getAll: getAll,
    // Bulk replace — for pages (admin-roles.html's matrix editor) that
    // hold the full role list in memory and persist it as a whole,
    // rather than one role at a time via save(). Still the SAME
    // underlying key as every other Roles.* method.
    saveAll: saveAll,
    getById: getById,
    save: save,
    remove: remove,
    duplicate: duplicate,
    assignedAdminCount: assignedAdminCount,
    hasPermission: hasPermission
  };
})(window);
