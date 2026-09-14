/* ============================================================
   Receiptly — plan-access.js
   ------------------------------------------------------------
   Single, shared source of truth for Free / Normal / Pro feature
   gating. Does NOT introduce a second subscription system — it
   only reads the existing per-account subscription record via
   Scope.getSubscription() (see js/user-scope.js), which is the
   same record Settings > Billing writes to and admin approves.

   Plan resolution rules (must match everywhere in the app):
     - No subscription record                => Free
     - Subscription status !== "active"       => Free
       (covers "pending", "suspended",
        "cancelled", "rejected", or anything
        else other than a confirmed, paid,
        currently-active subscription)
     - Subscription status === "active"       => sub.plan
       (Scope.checkBillingStatus(), called on every page load by
       user-scope.js, already flips an expired "active" sub to
       "suspended" the moment its renewsAt date passes — so an
       expired/unpaid plan automatically falls back to Free here
       with no extra code needed.)

   Load this file on every page, AFTER user-scope.js and (if
   present) app.js:
     <script src="../js/user-scope.js"></script>
     <script src="../js/plan-access.js"></script>

   Public API (window.PlanAccess):
     PlanAccess.getPlan()                 -> "Free" | "Normal" | "Pro"
     PlanAccess.hasPlan(required)         -> bool (current plan >= required)
     PlanAccess.can(featureKey)           -> bool (current plan meets the
                                              plan required for this feature)
     PlanAccess.requiredPlanFor(feature)  -> "Free" | "Normal" | "Pro"
     PlanAccess.upgradeMessage(feature)   -> clear, user-facing string
     PlanAccess.showUpgradeToast(feature) -> shows the message via
                                              App.toast (falls back to alert)
     PlanAccess.guardPage(feature, opts)  -> blocks the whole page: if the
                                              current plan doesn't include
                                              this feature, redirects to
                                              opts.redirect (default
                                              "dashboard.html") with a
                                              query string the target page
                                              reads to show a clear
                                              "upgrade required" message.
                                              Also re-checks on an interval
                                              so a plan change (upgrade,
                                              downgrade, expiry) takes
                                              effect in an already-open
                                              tab, not just on refresh.
     PlanAccess.readUpgradeNotice()       -> reads ?upgrade=&need= from the
                                              current URL (if present) and
                                              returns {feature, plan} or
                                              null. Used by pages that are
                                              a guardPage() redirect target
                                              to surface the explanation.

   FEATURES registry: the ONE place that declares which plan a
   restricted feature needs. Add new restricted features here —
   never duplicate this mapping elsewhere.
   ============================================================ */

(function (global) {
  "use strict";

  var PLANS = ["Free", "Normal", "Pro"];
  var RANK = { Free: 0, Normal: 1, Pro: 2 };

  // Feature key -> minimum plan required.
  var FEATURES = {
    "template:pro": "Pro",     // Pro-styled receipt/invoice layout
    "page:analytics": "Pro",   // Analytics page
    "page:customers": "Normal",// Customers page (core customer tools)
    "page:expenses": "Normal"  // Expenses page (core business tools)
  };

  function safePlanName(name) {
    var found = null;
    PLANS.forEach(function (p) {
      if (p.toLowerCase() === String(name || "").trim().toLowerCase()) found = p;
    });
    return found;
  }

  /* ---------- plan resolution (single source of truth) ---------- */
  function getPlan() {
    try {
      if (typeof Scope === "undefined" || !Scope.getSubscription) return "Free";
      // Make sure an expired "active" subscription has already been
      // flipped to "suspended" before we read it, in case this runs
      // before user-scope.js's own load-time check does.
      if (Scope.checkBillingStatus) Scope.checkBillingStatus();
      var sub = Scope.getSubscription();
      if (!sub || sub.status !== "active") return "Free";
      return safePlanName(sub.plan) || "Free";
    } catch (e) {
      return "Free";
    }
  }

  function hasPlan(required) {
    var reqRank = RANK.hasOwnProperty(required) ? RANK[required] : 0;
    var curRank = RANK[getPlan()];
    return curRank >= reqRank;
  }

  function requiredPlanFor(featureKey) {
    return FEATURES.hasOwnProperty(featureKey) ? FEATURES[featureKey] : "Free";
  }

  function can(featureKey) {
    return hasPlan(requiredPlanFor(featureKey));
  }

  /* ---------- messaging ---------- */
  var FEATURE_LABELS = {
    "template:pro": "the Pro receipt template",
    "page:analytics": "the Analytics page",
    "page:customers": "the Customers tools",
    "page:expenses": "the Expenses tools"
  };

  function upgradeMessage(featureKey) {
    var needed = requiredPlanFor(featureKey);
    var label = FEATURE_LABELS[featureKey] || "this feature";
    var current = getPlan();
    return "Upgrade required: " + label + " needs the " + needed + " plan. " +
      "You're currently on the " + current + " plan. " +
      "Go to Settings > Billing to upgrade.";
  }

  function showUpgradeToast(featureKey) {
    var msg = upgradeMessage(featureKey);
    if (typeof App !== "undefined" && App.toast) {
      App.toast(msg, "error", 5000);
    } else if (typeof Popup !== "undefined") {
      Popup.alert({ title: "Upgrade required", message: msg, danger: true });
    }
  }

  /* ---------- whole-page gating ---------- */
  function guardPage(featureKey, opts) {
    opts = opts || {};
    var redirectTo = opts.redirect || "dashboard.html";
    var intervalMs = opts.recheckMs || 15000;

    function check() {
      if (!can(featureKey)) {
        var sep = redirectTo.indexOf("?") === -1 ? "?" : "&";
        window.location.href = redirectTo + sep +
          "upgrade=" + encodeURIComponent(featureKey) +
          "&need=" + encodeURIComponent(requiredPlanFor(featureKey));
        return false;
      }
      return true;
    }

    if (!check()) return false;

    // Re-check periodically so a downgrade/expiry/admin action takes
    // effect immediately in a tab that's already open on this page,
    // not just after the user refreshes or navigates.
    global.setInterval(check, intervalMs);
    return true;
  }

  /* ---------- reading the "why was I redirected" notice ---------- */
  function readUpgradeNotice() {
    try {
      var params = new URLSearchParams(window.location.search);
      var feature = params.get("upgrade");
      if (!feature) return null;
      return {
        feature: feature,
        plan: params.get("need") || requiredPlanFor(feature),
        message: upgradeMessage(feature)
      };
    } catch (e) {
      return null;
    }
  }

  global.PlanAccess = {
    PLANS: PLANS,
    RANK: RANK,
    FEATURES: FEATURES,
    getPlan: getPlan,
    hasPlan: hasPlan,
    requiredPlanFor: requiredPlanFor,
    can: can,
    upgradeMessage: upgradeMessage,
    showUpgradeToast: showUpgradeToast,
    guardPage: guardPage,
    readUpgradeNotice: readUpgradeNotice
  };
})(window);
