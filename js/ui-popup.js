/* ============================================================
   Receiptly — js/ui-popup.js
   ------------------------------------------------------------
   ONE shared, self-contained popup system used everywhere in the
   app instead of the browser's native window.alert / window.confirm
   / window.prompt. Those native dialogs render with the OS's own
   unstyled buttons and cannot be skinned — this file replaces
   every one of them with a styled, on-brand popup so the whole
   app (user dashboard, admin dashboard, and every page in
   between) looks consistent.

   Injects its own <style> tag once (namespaced under .rcpt-popup-*)
   so it works the same on every page regardless of which other
   stylesheet that page loads, and has zero dependencies — safe to
   include on any page, in any order.

   Public API (window.Popup):
     Popup.alert({ title, message, okText, danger })
       -> Promise<void>                      (replaces window.alert)
     Popup.confirm({ title, message, confirmText, cancelText, danger })
       -> Promise<boolean>                    (replaces window.confirm)
     Popup.prompt({ title, message, fields:[{id,label,type,
                     placeholder,value,maxlength,inputmode,autocomplete}],
                     submitText, cancelText, validate })
       -> Promise<Object|null>                (replaces window.prompt,
                                                also used for on-brand
                                                forms like 2-step
                                                verification setup)
   ============================================================ */
(function (global) {
  "use strict";

  var STYLE_ID = "rcpt-popup-styles";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      ".rcpt-popup-overlay{position:fixed;inset:0;background:rgba(20,17,10,.55);",
      "display:flex;align-items:center;justify-content:center;padding:20px;",
      "z-index:99999;opacity:0;transition:opacity .18s ease;",
      "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
      ".rcpt-popup-overlay.is-visible{opacity:1;}",
      ".rcpt-popup{background:#FFFFFF;border-radius:16px;padding:26px;width:100%;",
      "max-width:400px;box-shadow:0 20px 48px rgba(33,29,24,.25);",
      "transform:scale(.95) translateY(6px);transition:transform .18s ease;color:#211D18;}",
      ".rcpt-popup-overlay.is-visible .rcpt-popup{transform:scale(1) translateY(0);}",
      ".rcpt-popup__icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;",
      "justify-content:center;font-size:20px;font-weight:700;margin-bottom:14px;background:#FBF1DD;color:#B8862E;}",
      ".rcpt-popup__icon.is-danger{background:#FBEAE8;color:#B23A2E;}",
      ".rcpt-popup__icon.is-success{background:#E4F1EA;color:#1F6F4F;}",
      ".rcpt-popup__title{font-size:18px;font-weight:700;margin:0 0 8px;line-height:1.3;}",
      ".rcpt-popup__msg{color:#4A443C;font-size:14px;line-height:1.55;margin:0 0 20px;white-space:pre-line;}",
      ".rcpt-popup__field{margin-bottom:14px;}",
      ".rcpt-popup__label{display:block;font-size:12.5px;font-weight:600;color:#4A443C;margin-bottom:6px;}",
      ".rcpt-popup__input{width:100%;padding:10px 12px;border:1.5px solid #E4DAC4;border-radius:9px;",
      "font-size:15px;font-family:inherit;color:#211D18;background:#FAF6EC;box-sizing:border-box;letter-spacing:.5px;}",
      ".rcpt-popup__input:focus{outline:none;border-color:#B8862E;background:#fff;}",
      ".rcpt-popup__error{color:#B23A2E;font-size:12.5px;margin:-6px 0 14px;min-height:15px;}",
      ".rcpt-popup__actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;}",
      ".rcpt-popup__btn{border:none;border-radius:9px;padding:10px 18px;font-size:14px;font-weight:600;",
      "cursor:pointer;font-family:inherit;transition:filter .15s ease,background .15s ease;}",
      ".rcpt-popup__btn--ghost{background:transparent;color:#4A443C;}",
      ".rcpt-popup__btn--ghost:hover{background:#F1EBDB;}",
      ".rcpt-popup__btn--primary{background:#B8862E;color:#fff;}",
      ".rcpt-popup__btn--primary:hover{filter:brightness(1.08);}",
      ".rcpt-popup__btn--danger{background:#B23A2E;color:#fff;}",
      ".rcpt-popup__btn--danger:hover{filter:brightness(1.08);}",
      "html[data-theme='dark'] .rcpt-popup{background:#201D16;color:#F3EEE2;}",
      "html[data-theme='dark'] .rcpt-popup__msg{color:#C9C1AE;}",
      "html[data-theme='dark'] .rcpt-popup__label{color:#C9C1AE;}",
      "html[data-theme='dark'] .rcpt-popup__input{background:#17150F;border-color:#35301F;color:#F3EEE2;}",
      "html[data-theme='dark'] .rcpt-popup__btn--ghost{color:#C9C1AE;}",
      "html[data-theme='dark'] .rcpt-popup__btn--ghost:hover{background:#100F0A;}"
    ].join("");
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildOverlay(innerHTML) {
    var overlay = document.createElement("div");
    overlay.className = "rcpt-popup-overlay";
    overlay.innerHTML = '<div class="rcpt-popup" role="dialog" aria-modal="true">' + innerHTML + "</div>";
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("is-visible"); });
    return overlay;
  }

  function closeOverlay(overlay, cb) {
    overlay.classList.remove("is-visible");
    setTimeout(function () {
      overlay.remove();
      if (cb) cb();
    }, 180);
  }

  /* ---------- alert ---------- */
  function alertFn(opts) {
    opts = opts || {};
    injectStyles();
    return new Promise(function (resolve) {
      var html =
        '<div class="rcpt-popup__icon' + (opts.danger ? " is-danger" : " is-success") + '">' +
          (opts.danger ? "!" : "\u2713") +
        "</div>" +
        '<h3 class="rcpt-popup__title">' + escapeHTML(opts.title || "Notice") + "</h3>" +
        '<p class="rcpt-popup__msg">' + escapeHTML(opts.message || "") + "</p>" +
        '<div class="rcpt-popup__actions">' +
          '<button type="button" class="rcpt-popup__btn rcpt-popup__btn--primary" data-action="ok">' +
            escapeHTML(opts.okText || "OK") +
          "</button>" +
        "</div>";
      var overlay = buildOverlay(html);
      function finish() { closeOverlay(overlay, function () { resolve(); }); }
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) return finish();
        if (e.target.closest("[data-action='ok']")) finish();
      });
      document.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape" || e.key === "Enter") {
          document.removeEventListener("keydown", escHandler);
          finish();
        }
      });
    });
  }

  /* ---------- confirm ---------- */
  function confirmFn(opts) {
    opts = opts || {};
    injectStyles();
    return new Promise(function (resolve) {
      var danger = opts.danger !== false;
      var html =
        '<div class="rcpt-popup__icon' + (danger ? " is-danger" : "") + '">' + (danger ? "!" : "?") + "</div>" +
        '<h3 class="rcpt-popup__title">' + escapeHTML(opts.title || "Are you sure?") + "</h3>" +
        '<p class="rcpt-popup__msg">' + escapeHTML(opts.message || "") + "</p>" +
        '<div class="rcpt-popup__actions">' +
          '<button type="button" class="rcpt-popup__btn rcpt-popup__btn--ghost" data-action="cancel">' +
            escapeHTML(opts.cancelText || "Cancel") +
          "</button>" +
          '<button type="button" class="rcpt-popup__btn ' + (danger ? "rcpt-popup__btn--danger" : "rcpt-popup__btn--primary") +
            '" data-action="ok">' + escapeHTML(opts.confirmText || "Confirm") +
          "</button>" +
        "</div>";
      var overlay = buildOverlay(html);
      function finish(result) { closeOverlay(overlay, function () { resolve(result); }); }
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) return finish(false);
        var action = e.target.closest("[data-action]");
        if (action) finish(action.dataset.action === "ok");
      });
      document.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", escHandler);
          finish(false);
        }
      });
    });
  }

  /* ---------- prompt (also used for 2FA code entry/setup forms) ---------- */
  function promptFn(opts) {
    opts = opts || {};
    injectStyles();
    var fields = opts.fields || [{ id: "value", label: "", type: "text" }];
    return new Promise(function (resolve) {
      var fieldsHTML = fields.map(function (f) {
        return '<div class="rcpt-popup__field">' +
          (f.label ? '<label class="rcpt-popup__label">' + escapeHTML(f.label) + "</label>" : "") +
          '<input class="rcpt-popup__input" type="' + (f.type || "text") + '" id="rcpt-popup-field-' + f.id + '" ' +
            (f.placeholder ? 'placeholder="' + escapeHTML(f.placeholder) + '" ' : "") +
            (f.maxlength ? 'maxlength="' + f.maxlength + '" ' : "") +
            (f.inputmode ? 'inputmode="' + f.inputmode + '" ' : "") +
            'autocomplete="' + (f.autocomplete || "off") + '" ' +
            'value="' + escapeHTML(f.value || "") + '" />' +
        "</div>";
      }).join("");
      var html =
        (opts.title ? '<h3 class="rcpt-popup__title">' + escapeHTML(opts.title) + "</h3>" : "") +
        (opts.message ? '<p class="rcpt-popup__msg">' + escapeHTML(opts.message) + "</p>" : "") +
        fieldsHTML +
        '<div class="rcpt-popup__error" data-error></div>' +
        '<div class="rcpt-popup__actions">' +
          '<button type="button" class="rcpt-popup__btn rcpt-popup__btn--ghost" data-action="cancel">' +
            escapeHTML(opts.cancelText || "Cancel") +
          "</button>" +
          '<button type="button" class="rcpt-popup__btn rcpt-popup__btn--primary" data-action="ok">' +
            escapeHTML(opts.submitText || "Submit") +
          "</button>" +
        "</div>";
      var overlay = buildOverlay(html);
      var firstInput = overlay.querySelector(".rcpt-popup__input");
      if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);

      function collect() {
        var result = {};
        fields.forEach(function (f) {
          var el = overlay.querySelector("#rcpt-popup-field-" + f.id);
          result[f.id] = el ? el.value : "";
        });
        return result;
      }
      function finish(result) { closeOverlay(overlay, function () { resolve(result); }); }
      function trySubmit() {
        var values = collect();
        if (typeof opts.validate === "function") {
          var err = opts.validate(values);
          if (err) {
            overlay.querySelector("[data-error]").textContent = err;
            return;
          }
        }
        finish(values);
      }
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) return finish(null);
        var action = e.target.closest("[data-action]");
        if (action) {
          if (action.dataset.action === "cancel") finish(null);
          else trySubmit();
        }
      });
      overlay.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); trySubmit(); }
        if (e.key === "Escape") finish(null);
      });
    });
  }

  global.Popup = {
    alert: alertFn,
    confirm: confirmFn,
    prompt: promptFn
  };
})(window);
