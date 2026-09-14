/* Receiptly Templates — CRUD, preview, default selection */
(() => {
  const presets = [
    {name:'Classic',description:'Clean professional receipt with a traditional layout.',style:'classic',accent:'#16665c'},
    {name:'Modern',description:'Minimal modern receipt with strong totals and spacing.',style:'modern',accent:'#703a75'},
    {name:'Compact',description:'Space-efficient layout for everyday transactions.',style:'compact',accent:'#059669'},
    {name:'Normal',description:'Plain thermal ticket-style receipt — simple, printer-friendly, no frills.',style:'normal',accent:'#111827'},
    {name:'Pro',description:'Branded invoice-style receipt with logo, itemized table and terms. Requires the Pro plan.',style:'pro',accent:'#7c3aed',premium:true}
  ];
  const esc = s => App.escapeHTML(s ?? '');
  // Resolves a profile's stored currency (a code like "USD", or a
  // legacy raw symbol) to its display symbol via the shared
  // Currency module, so previews follow the user's Settings choice.
  const currencySymbol = (profile, fallback) => {
    const raw = profile && profile.currency;
    if (typeof Currency !== 'undefined') return Currency.getSymbol(raw) || fallback;
    return raw || fallback;
  };
  const seed = () => { if (!DB.getTemplates().length) presets.forEach((t,i)=>DB.addTemplate({...t,isDefault:i===0,builtIn:true})); };

  /* ---------- plan gating ----------
     'pro' styled templates (built-in Pro preset, or any custom template
     saved with the Pro layout) are locked behind an active Pro
     subscription. Normal/Classic/Modern/Compact stay free. */
  function isPremiumTemplate(t){ return t.premium || t.style === 'pro'; }
  function hasProPlan(){
    // Delegates to the shared plan-access module (single source of
    // truth — see js/plan-access.js) so this never drifts out of sync
    // with the plan rules enforced elsewhere in the app.
    try {
      if (typeof PlanAccess !== 'undefined') return PlanAccess.can('template:pro');
      // Fallback if plan-access.js isn't loaded on this page for some reason.
      if (typeof Scope === 'undefined') return false;
      const sub = Scope.getSubscription();
      return !!(sub && sub.status === 'active' && sub.plan === 'Pro');
    } catch (e) { return false; }
  }

  function preview(t){
    const style = t.style || 'classic';
    if (style === 'classic' && typeof ClassicReceipt !== 'undefined') return previewClassicInvoice(t);
    if (style === 'modern' && typeof ModernReceipt !== 'undefined') return previewModernReceipt(t);
    if (style === 'normal' && typeof NormalReceipt !== 'undefined') return previewNormalTicket(t);
    if (style === 'normal') return previewNormal(t);
    if (style === 'pro' && typeof ProInvoice !== 'undefined') return previewProInvoice(t);
    if (style === 'pro') return previewPro(t);
    if (style === 'compact' && typeof CompactReceipt !== 'undefined') return previewCompact(t);
    return previewDefault(t);
  }

  const previewClassicInvoice = t => {
    const profile = DB.getProfile();
    return ClassicReceipt.render({
      accent: t.accent || '#16665c',
      currency: currencySymbol(profile, '€'),
      companyName: profile.businessName || 'Your Business',
      logoUrl: profile.logo || '',
      customerName: 'Customer Name',
      customerAddressLines: [profile.address ? '' : 'Business Company 123', 'Grand Avenue, 29102'].filter(Boolean),
      invoiceNumber: '#12345',
      invoiceDate: new Date().toLocaleDateString(),
      items: [
        { description: 'Service description', price: 0, qty: 1, total: 0 },
        { description: 'Service description', price: 0, qty: 1, total: 0 }
      ],
      paymentMethod: 'By Bank London State Bank',
      paymentDetail: profile.phone || '',
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      terms: 'Payment is due within 14 days. Thank you for your business!',
      contactEmail: profile.email || '',
      contactWebsite: profile.website || ''
    }, { size: 'thumb' });
  };

  const previewModernReceipt = t => {
    const profile = DB.getProfile();
    return ModernReceipt.render({
      accent: t.accent || '#703a75',
      currency: currencySymbol(profile, '$'),
      companyName: profile.businessName || 'Your Company Inc.',
      companyAddressLines: [profile.address].filter(Boolean),
      logoUrl: profile.logo || '',
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
      notes: profile.footerMessage || 'Thank you for your purchase!',
      footerContact: profile.email || profile.phone || ''
    }, { size: 'thumb' });
  };

  const previewNormalTicket = () => {
    const profile = DB.getProfile();
    return NormalReceipt.render({
      currency: currencySymbol(profile, '₦'),
      companyName: (profile.businessName || 'YOUR BUSINESS').toUpperCase(),
      addressLine1: profile.address || '123 Business Ave',
      operator: profile.businessName ? `Operator: ${profile.businessName}` : '',
      details: [
        { label: 'Date:', value: new Date().toLocaleDateString() },
        { label: 'Receipt #:', value: 'RCT-1042' },
        { label: 'Customer:', value: 'John Customer' }
      ],
      items: [
        { qty: 1, name: 'Item / Service', amount: '₦25,000.00' },
        { qty: 1, name: 'Item / Service', amount: '₦10,000.00' }
      ],
      totalAmount: '₦35,000.00',
      paymentRows: [
        { label: 'Payment:', value: 'Card •••• 3898' },
        { label: 'Status:', value: 'APPROVED', strong: true }
      ],
      footerLines: ['Thank you for your business!']
    }, { size: 'thumb' });
  };

  const previewProInvoice = t => {
    const profile = DB.getProfile();
    return ProInvoice.render({
      accent: t.accent || '#1a2f7a',
      currency: currencySymbol(profile, '₦'),
      currencyCode: profile.currency || 'NGN',
      companyName: profile.businessName || 'YOUR BUSINESS',
      addressLine1: profile.address || '123 Business Ave',
      phone: profile.phone || '',
      tagline: profile.footerMessage || '',
      logoUrl: profile.logo || '',
      customerName: 'John Customer',
      customerAddress: '',
      items: [{ name: 'Item / Service', qty: 1, price: 25000 }, { name: 'Item / Service', qty: 1, price: 10000 }],
      totalAmount: 35000
    }, { size: 'thumb' });
  };

  const previewCompact = t => {
    const profile = DB.getProfile();
    return CompactReceipt.render({
      accent: t.accent || '#059669',
      companyName: profile.businessName || 'YOUR BUSINESS',
      addressLine1: profile.address || '123 Business Ave',
      phone: profile.phone || '',
      tagline: profile.email || '',
      logoUrl: profile.logo || '',
      date: new Date().toLocaleDateString(),
      receiptNumber: '0001',
      customerName: 'John Customer',
      customerAddress: '',
      itemLines: ['Item / Service — ₦25,000.00', 'Item / Service — ₦10,000.00'],
      forText: 'Item / Service',
      totalAmount: '35,000.00',
      amountOfAccount: '₦35,000.00',
      amountPaid: '₦35,000.00',
      balanceDue: '₦0.00',
      paymentMethod: 'cash'
    }, { size: 'thumb' });
  };

  const previewDefault = t => `<div class="receipt-preview ${esc(t.style||'classic')}" style="--accent:${esc(t.accent||'#111827')}">
    <div class="rp-head"><b>${esc(DB.getProfile().businessName||'YOUR BUSINESS')}</b><small>RECEIPT</small></div>
    <div class="rp-line"></div><div class="rp-row"><span>Customer</span><span>John Customer</span></div><div class="rp-row"><span>Item / Service</span><span>₦25,000.00</span></div><div class="rp-row"><span>Item / Service</span><span>₦10,000.00</span></div><div class="rp-line"></div><div class="rp-total"><span>TOTAL</span><b>₦35,000.00</b></div><small class="rp-thanks">Thank you for your business!</small></div>`;

  const previewNormal = t => `<div class="receipt-preview normal" style="--accent:${esc(t.accent||'#111827')}">
    <div class="rpn-head">
      <div class="rpn-logo">⚌</div>
      <b>${esc((DB.getProfile().businessName||'YOUR BUSINESS').toUpperCase())}</b>
      <span>${esc(DB.getProfile().address||'123 Business Ave')}</span>
      <span>Operator: ${esc(DB.getProfile().businessName||'Your Business')}</span>
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

  const previewPro = t => `<div class="receipt-preview pro" style="--accent:${esc(t.accent||'#7c3aed')}">
    <div class="rpp-top">
      <div class="rpp-from"><small>FROM</small><b>${esc(DB.getProfile().businessName||'YOUR BUSINESS')}</b><span>${esc(DB.getProfile().address||'Your Address')}</span></div>
      <div class="rpp-right"><div class="rpp-logo">Logo</div><div class="rpp-title">RECEIPT</div></div>
    </div>
    <div class="rpp-meta"><div><small>TO</small><b>John Customer</b></div><div class="rpp-meta-right"><span>Receipt #: 0000001</span><span>${new Date().toLocaleDateString()}</span></div></div>
    <table class="rpp-table"><thead><tr><th>Qty</th><th>Description</th><th>Amount</th></tr></thead>
      <tbody><tr><td>1</td><td>Item / Service</td><td>₦25,000.00</td></tr><tr><td>1</td><td>Item / Service</td><td>₦10,000.00</td></tr></tbody></table>
    <div class="rpp-sums"><div><span>Subtotal</span><span>₦35,000.00</span></div><div><span>Tax</span><span>₦0.00</span></div><div class="rpp-grand"><span>Total</span><span>₦35,000.00</span></div></div>
    <div class="rpp-terms"><b>Terms &amp; Conditions</b><p>Payment is due within 14 days. Thank you for your business!</p></div>
  </div>`;

  function render(){
    const grid=document.getElementById('templateGrid'), q=(document.getElementById('templateSearch').value||'').toLowerCase();
    const list=DB.getTemplates().filter(t=>`${t.name} ${t.description} ${t.style}`.toLowerCase().includes(q));
    const proOk = hasProPlan();
    grid.innerHTML=list.length?list.map(t=>{
      const locked = isPremiumTemplate(t) && !proOk;
      const defaultBtn = locked
        ? `<button data-upgrade="${t.id}" class="btn btn--primary">Upgrade to use</button>`
        : `<button data-default="${t.id}" class="btn btn--primary" ${t.isDefault?'disabled':''}>${t.isDefault?'Default':'Set default'}</button>`;
      return `<article class="template-card ${locked?'is-locked':''}"><div class="preview-wrap">${preview(t)}${t.isDefault?'<span class="default-badge">Default</span>':''}${isPremiumTemplate(t)?`<span class="pro-badge">${locked?'🔒 Pro':'Pro'}</span>`:''}${locked?'<div class="lock-overlay"></div>':''}</div><div class="template-info"><div><h3>${esc(t.name)}</h3><p>${esc(t.description||'Custom receipt template')}</p></div><div class="template-actions"><button data-view="${t.id}" class="btn btn--ghost">View</button><button data-edit="${t.id}" class="btn btn--ghost">Edit</button><button data-duplicate="${t.id}" class="btn btn--ghost">Duplicate</button>${defaultBtn}<button data-delete="${t.id}" class="icon-delete" title="Delete">Delete</button></div></div></article>`;
    }).join(''):`<div class="empty-state">No templates found.</div>`;
  }
  function openEditor(t=null){
    const modal=document.getElementById('templateModal'); modal.classList.add('is-open');
    document.getElementById('templateId').value=t?.id||''; document.getElementById('templateName').value=t?.name||''; document.getElementById('templateDescription').value=t?.description||''; document.getElementById('templateStyle').value=t?.style||'classic'; document.getElementById('templateAccent').value=t?.accent||'#111827'; document.getElementById('modalTitle').textContent=t?'Edit Template':'Add Template';
    updateEditorPreview();
  }
  function closeEditor(){document.getElementById('templateModal').classList.remove('is-open');}
  function updateEditorPreview(){
    const style=document.getElementById('templateStyle').value;
    const t={name:document.getElementById('templateName').value||'Your Business',style,accent:document.getElementById('templateAccent').value};
    document.getElementById('editorPreview').innerHTML=preview(t);
    const note=document.getElementById('editorProNote');
    if(note) note.style.display = (style==='pro' && !hasProPlan()) ? 'block' : 'none';
  }
  function view(t){ const modal=document.getElementById('viewModal'); document.getElementById('viewTitle').textContent=t.name; document.getElementById('viewDescription').textContent=t.description||''; document.getElementById('viewPreview').innerHTML=preview(t); modal.classList.add('is-open'); }
  function goToBilling(){ window.location.href = 'settings.html#billingCard'; }
  document.addEventListener('DOMContentLoaded',()=>{
    App.initPage('templates.html','Templates'); seed(); render();
    document.getElementById('templateSearch').addEventListener('input',render); document.getElementById('addTemplate').addEventListener('click',()=>openEditor());
    ['templateName','templateDescription','templateStyle','templateAccent'].forEach(id=>document.getElementById(id).addEventListener('input',updateEditorPreview));
    document.getElementById('templateForm').addEventListener('submit',e=>{
      e.preventDefault();
      const id=document.getElementById('templateId').value;
      const style=document.getElementById('templateStyle').value;
      if(style==='pro' && !hasProPlan()){ App.toast('The Pro layout needs an active Pro plan. Upgrade in Settings > Billing.','error'); goToBilling(); return; }
      const data={name:document.getElementById('templateName').value.trim(),description:document.getElementById('templateDescription').value.trim(),style,accent:document.getElementById('templateAccent').value};
      if(!data.name)return; if(id)DB.updateTemplate(id,data);else DB.addTemplate(data); closeEditor(); render(); App.toast(id?'Template updated':'Template added');
    });
    document.getElementById('templateGrid').addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b)return;
      const id=b.dataset.view||b.dataset.edit||b.dataset.duplicate||b.dataset.default||b.dataset.delete||b.dataset.upgrade; if(!id)return;
      const t=DB.getTemplates().find(x=>x.id===id); if(!t)return;
      if(b.dataset.upgrade){ App.toast('Upgrade to the Pro plan to use this template.','info'); goToBilling(); return; }
      if(b.dataset.view)view(t);
      else if(b.dataset.edit)openEditor(t);
      else if(b.dataset.duplicate){
        if(isPremiumTemplate(t) && !hasProPlan()){ App.toast('Upgrade to the Pro plan to duplicate this template.','error'); goToBilling(); return; }
        DB.addTemplate({...t,id:undefined,name:`${t.name} Copy`,isDefault:false,builtIn:false});render();App.toast('Template duplicated');
      }
      else if(b.dataset.default){
        if(isPremiumTemplate(t) && !hasProPlan()){ App.toast('Upgrade to the Pro plan to use this template.','error'); goToBilling(); return; }
        DB.setDefaultTemplate(id);render();App.toast('Default template updated');
      }
      else if(b.dataset.delete){if(t.isDefault){App.toast('Set another template as default before deleting this one.','error');return;}if(await App.confirm({title:'Delete template?',message:`Delete ${t.name}? This cannot be undone.`})){DB.deleteTemplate(id);render();App.toast('Template deleted');}}
    });
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).classList.remove('is-open')));
  });
})();
