/* ============================================================
   Receiptly — template-picker.js
   ------------------------------------------------------------
   Lets the Create Receipt page choose a template as a set of
   buttons (Classic/Modern/Compact/Normal/Pro — whatever exists
   in the shared catalog) with a live preview that updates the
   instant a button is clicked, so what you see is what the
   generated/printed receipt will actually look like.

   Pro-styled templates stay locked behind an active Pro
   subscription, same rule as the Templates management page.

   Falls back to its own escaping/toast when app.js isn't loaded
   on the page (create-receipt.html uses its own shell, not
   App.buildShell), so this picker isn't silently disabled just
   because App is missing.
   ============================================================ */
(() => {
  const esc = (typeof App !== 'undefined' && App.escapeHTML)
    ? (s) => App.escapeHTML(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Resolves a profile's stored currency (a code like "USD", or a
  // legacy raw symbol) to its display symbol via the shared
  // Currency module, so previews always follow whatever the user
  // most recently picked on the Settings page.
  function currencySymbol(p, fallback) {
    var raw = p && p.currency;
    if (typeof Currency !== 'undefined') return Currency.getSymbol(raw) || fallback;
    return raw || fallback;
  }

  function toast(message, type) {
    if (typeof App !== 'undefined' && App.toast) { App.toast(message, type); return; }
    const container = document.getElementById('toastContainer');
    if (!container) { return; }
    const div = document.createElement('div');
    div.className = `toast toast--${type || 'info'}`;
    div.setAttribute('role', 'alert');
    div.innerHTML = `<div class="toast__content">${esc(message)}</div>`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  function isPremiumTemplate(t) { return !!(t && (t.premium || t.style === 'pro')); }

  function hasProPlan() {
    // Delegates to the shared plan-access module (single source of
    // truth — see js/plan-access.js) so this never drifts out of sync
    // with the plan rules enforced elsewhere in the app.
    try {
      if (typeof PlanAccess !== 'undefined') return PlanAccess.can('template:pro');
      // Fallback if plan-access.js isn't loaded on this page for some reason.
      if (typeof Scope === 'undefined' || !Scope.getSubscription) return false;
      const sub = Scope.getSubscription();
      return !!(sub && sub.status === 'active' && sub.plan === 'Pro');
    } catch (e) { return false; }
  }

  function profile() {
    try { return (typeof DB !== 'undefined' && DB.getProfile) ? DB.getProfile() : {}; }
    catch (e) { return {}; }
  }

  /* ---------- preview markup — one per layout style ----------
     Uses representative sample data (same figures the Templates
     page previews with) so switching templates here shows the
     real visual difference, not just a label change. */
  const previewDefault = (t) => `<div class="receipt-preview ${esc(t.style || 'classic')}" style="--accent:${esc(t.accent || '#111827')}">
    <div class="rp-head"><b>${esc(profile().businessName || 'YOUR BUSINESS')}</b><small>RECEIPT</small></div>
    <div class="rp-line"></div>
    <div class="rp-row"><span>Customer</span><span>John Customer</span></div>
    <div class="rp-row"><span>Item / Service</span><span>₦25,000.00</span></div>
    <div class="rp-row"><span>Item / Service</span><span>₦10,000.00</span></div>
    <div class="rp-line"></div>
    <div class="rp-total"><span>TOTAL</span><b>₦35,000.00</b></div>
    <small class="rp-thanks">Thank you for your business!</small>
  </div>`;

  const previewNormal = (t) => `<div class="receipt-preview normal" style="--accent:${esc(t.accent || '#111827')}">
    <div class="rpn-head">
      <div class="rpn-logo">⚌</div>
      <b>${esc((profile().businessName || 'YOUR BUSINESS').toUpperCase())}</b>
      <span>${esc(profile().address || '123 Business Ave')}</span>
      <span>Operator: ${esc(profile().businessName || 'Your Business')}</span>
    </div>
    <div class="rpn-rule">------------ RECEIPT DETAILS ------------</div>
    <div class="rpn-meta">
      <span>Date: ${new Date().toLocaleDateString()}</span>
      <span>Receipt #: RCT-1042</span>
    </div>
    <div class="rpn-rule">--------------------------------</div>
    <div class="rpn-item"><span>1&nbsp; Item / Service</span><span>₦25,000.00</span></div>
    <div class="rpn-item"><span>1&nbsp; Item / Service</span><span>₦10,000.00</span></div>
    <div class="rpn-total"><span>Total</span><b>₦35,000.00</b></div>
    <div class="rpn-rule">--------------------------------</div>
    <div class="rpn-foot">
      <span>Payment: Card •••• 3898</span>
      <span>Status: APPROVED</span>
    </div>
    <small class="rpn-thanks">Thank you for your business!</small>
  </div>`;

  const previewPro = (t) => `<div class="receipt-preview pro" style="--accent:${esc(t.accent || '#7c3aed')}">
    <div class="rpp-top">
      <div class="rpp-from"><small>FROM</small><b>${esc(profile().businessName || 'YOUR BUSINESS')}</b><span>${esc(profile().address || 'Your Address')}</span></div>
      <div class="rpp-right"><div class="rpp-logo">Logo</div><div class="rpp-title">RECEIPT</div></div>
    </div>
    <div class="rpp-meta"><div><small>TO</small><b>John Customer</b></div><div class="rpp-meta-right"><span>Receipt #: 0000001</span><span>${new Date().toLocaleDateString()}</span></div></div>
    <table class="rpp-table"><thead><tr><th>Qty</th><th>Description</th><th>Amount</th></tr></thead>
      <tbody><tr><td>1</td><td>Item / Service</td><td>₦25,000.00</td></tr><tr><td>1</td><td>Item / Service</td><td>₦10,000.00</td></tr></tbody></table>
    <div class="rpp-sums"><div><span>Subtotal</span><span>₦35,000.00</span></div><div><span>Tax</span><span>₦0.00</span></div><div class="rpp-grand"><span>Total</span><span>₦35,000.00</span></div></div>
    <div class="rpp-terms"><b>Terms &amp; Conditions</b><p>Payment is due within 14 days. Thank you for your business!</p></div>
  </div>`;

  const previewCompact = (t) => {
    const p = profile();
    const cur = currencySymbol(p, '$');
    return CompactReceipt.render({
      accent: t.accent || '#059669',
      currency: cur,
      companyName: p.businessName || 'YOUR BUSINESS',
      addressLine1: p.address || '123 Business Ave',
      phone: p.phone || '',
      tagline: p.email || '',
      logoUrl: p.logo || '',
      date: new Date().toLocaleDateString(),
      receiptNumber: '0001',
      customerName: 'John Customer',
      customerAddress: '',
      itemLines: [`Item / Service — ${cur}25,000.00`, `Item / Service — ${cur}10,000.00`],
      forText: 'Item / Service',
      totalAmount: '35,000.00',
      amountOfAccount: `${cur}35,000.00`,
      amountPaid: `${cur}35,000.00`,
      balanceDue: `${cur}0.00`,
      paymentMethod: 'cash'
    }, { size: 'thumb' });
  };

  const previewProInvoice = (t) => {
    const p = profile();
    return ProInvoice.render({
      accent: t.accent || '#1a2f7a',
      currency: currencySymbol(p, '₦'),
      currencyCode: p.currency || 'NGN',
      companyName: p.businessName || 'YOUR BUSINESS',
      addressLine1: p.address || '123 Business Ave',
      phone: p.phone || '',
      tagline: p.footerMessage || '',
      logoUrl: p.logo || '',
      customerName: 'John Customer',
      customerAddress: '',
      items: [{ name: 'Item / Service', qty: 1, price: 25000 }, { name: 'Item / Service', qty: 1, price: 10000 }],
      totalAmount: 35000
    }, { size: 'thumb' });
  };

  const previewNormalTicket = () => {
    const p = profile();
    const cur = currencySymbol(p, '₦');
    return NormalReceipt.render({
      currency: cur,
      companyName: (p.businessName || 'YOUR BUSINESS').toUpperCase(),
      addressLine1: p.address || '123 Business Ave',
      operator: p.businessName ? `Operator: ${p.businessName}` : '',
      details: [
        { label: 'Date:', value: new Date().toLocaleDateString() },
        { label: 'Receipt #:', value: 'RCT-1042' },
        { label: 'Customer:', value: 'John Customer' }
      ],
      items: [
        { qty: 1, name: 'Item / Service', amount: `${cur}25,000.00` },
        { qty: 1, name: 'Item / Service', amount: `${cur}10,000.00` }
      ],
      totalAmount: `${cur}35,000.00`,
      paymentRows: [
        { label: 'Payment:', value: 'Card •••• 3898' },
        { label: 'Status:', value: 'APPROVED', strong: true }
      ],
      footerLines: ['Thank you for your business!']
    }, { size: 'thumb' });
  };

  const previewModernReceipt = (t) => {
    const p = profile();
    return ModernReceipt.render({
      accent: t.accent || '#703a75',
      currency: currencySymbol(p, '$'),
      companyName: p.businessName || 'Your Company Inc.',
      companyAddressLines: [p.address].filter(Boolean),
      logoUrl: p.logo || '',
      receiptNumber: '0000457',
      receiptDate: new Date().toLocaleDateString('en-GB').split('/').join('-'),
      customerName: 'Customer Name',
      customerAddressLines: [],
      items: [
        { qty: 2, description: 'Custom product/service A', unitPrice: 45, amount: 90 },
        { qty: 1, description: 'Product/service B', unitPrice: 75, amount: 75 },
        { qty: 3, description: 'Product/service C', unitPrice: 20, amount: 60 }
      ],
      subtotal: 225,
      taxLabel: 'Sales Tax (5%)',
      taxAmount: 11.25,
      totalLabel: 'Total',
      totalAmount: 236.25,
      notes: p.footerMessage || 'Thank you for your purchase!',
      footerContact: p.email || p.phone || ''
    }, { size: 'thumb' });
  };

  const previewClassicInvoice = (t) => {
    const p = profile();
    return ClassicReceipt.render({
      accent: t.accent || '#16665c',
      currency: currencySymbol(p, '€'),
      companyName: p.businessName || 'Your Business',
      logoUrl: p.logo || '',
      customerName: 'Customer Name',
      customerAddressLines: ['Business Company 123', 'Grand Avenue, 29102'],
      invoiceNumber: '#12345',
      invoiceDate: new Date().toLocaleDateString(),
      items: [
        { description: 'Service description', price: 0, qty: 1, total: 0 },
        { description: 'Service description', price: 0, qty: 1, total: 0 }
      ],
      paymentMethod: 'By Bank London State Bank',
      paymentDetail: p.phone || '',
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      terms: 'Payment is due within 14 days. Thank you for your business!',
      contactEmail: p.email || '',
      contactWebsite: p.website || ''
    }, { size: 'thumb' });
  };

  function preview(t) {
    const style = t.style || 'classic';
    if (style === 'classic' && typeof ClassicReceipt !== 'undefined') return previewClassicInvoice(t);
    if (style === 'modern' && typeof ModernReceipt !== 'undefined') return previewModernReceipt(t);
    if (style === 'normal' && typeof NormalReceipt !== 'undefined') return previewNormalTicket(t);
    if (style === 'normal') return previewNormal(t);
    if (style === 'pro' && typeof ProInvoice !== 'undefined') return previewProInvoice(t);
    if (style === 'pro') return previewPro(t);
    if (style === 'compact' && typeof CompactReceipt !== 'undefined') return previewCompact(t);
    return previewDefault(t); // classic, modern share this shell — CSS class does the styling
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btnWrap = document.getElementById('receiptTemplateButtons');
    const hiddenSelect = document.getElementById('receiptTemplateSelect');
    const hint = document.getElementById('receiptTemplateHint');
    const previewWrap = document.getElementById('receiptTemplatePreviewWrap');
    if (!btnWrap || !hiddenSelect || typeof DB === 'undefined') return;

    function applySelection(t, list) {
      // Keep the hidden <select> in sync — this is what create-receipt.html
      // reads at save time (templateId / templateName), so the workflow
      // that saves the receipt doesn't need to change at all.
      hiddenSelect.innerHTML = list.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
      hiddenSelect.value = t.id;
      // Let the page's own receipt preview (which renders the actual
      // chosen layout, e.g. the Compact cash-receipt-pad style) know
      // the selection changed, so it re-renders immediately.
      hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));

      btnWrap.querySelectorAll('button[data-tid]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.tid === t.id);
      });

      if (hint) hint.textContent = t.description || 'Choose how your receipt should be formatted.';
      if (previewWrap) previewWrap.innerHTML = preview(t);
    }

    function render() {
      const list = DB.getTemplates();
      if (!list.length) {
        btnWrap.innerHTML = '<p style="color:var(--ink-soft);margin:0">No templates available yet. <a href="templates.html">Create one</a>.</p>';
        return;
      }
      const proOk = hasProPlan();
      const currentId = hiddenSelect.value;
      const current = list.find((x) => x.id === currentId) || list.find((x) => x.isDefault) || list[0];

      btnWrap.innerHTML = list.map((t) => {
        const locked = isPremiumTemplate(t) && !proOk;
        return `<button type="button" class="tpl-btn${current.id === t.id ? ' is-active' : ''}${locked ? ' is-locked' : ''}" data-tid="${esc(t.id)}">${esc(t.name)}${locked ? ' <span class="tpl-lock">🔒 Pro</span>' : ''}</button>`;
      }).join('');

      applySelection(current, list);

      btnWrap.querySelectorAll('button[data-tid]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = list.find((x) => x.id === btn.dataset.tid);
          if (!t) return;
          if (isPremiumTemplate(t) && !hasProPlan()) {
            toast('The Pro layout needs an active Pro plan. Upgrade in Settings > Billing.', 'error');
            return;
          }
          applySelection(t, list);
        });
      });
    }

    render();
    // Picks up template catalog changes (e.g. admin adds/edits a
    // template, or the user upgrades to Pro in another tab).
    window.addEventListener('storage', render);
  });
})();
