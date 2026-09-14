/* ============================================================
   Receiptly — classic-receipt.js (COMPLETE with CSS)
   ------------------------------------------------------------
   Renders a clean "INVOICE" matching the provided image.
   CSS is embedded for self‑contained styling.
   ============================================================ */

(() => {
  const esc = (typeof App !== 'undefined' && App.escapeHTML)
    ? (s) => App.escapeHTML(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Format currency
  const fmt = (n, cur) => `${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur || '€'}`;

  // Small diamond/logo placeholder
  const DIAMOND_SVG = `<svg viewBox="0 0 24 24" width="1.8em" height="1.8em" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l6 6-6 12L6 9z"/><path d="M6 9h12M9.5 3L7.5 9l4.5 12M14.5 3l2 6-4.5 12"/></svg>`;

  function render(data, opts) {
    data = data || {};
    const size = (opts && opts.size === 'thumb') ? 'thumb' : 'full';
    const cur = data.currency ||
      (typeof Currency !== 'undefined' ? Currency.getSymbol(Currency.getUserCurrencyCode()) : '€');
    const accent = data.accent || '#1e293b';

    // Limit items for thumb
    const maxRows = size === 'thumb' ? 3 : 10;
    const items = (Array.isArray(data.items) ? data.items.filter(Boolean) : []).slice(0, maxRows);
    const rows = items.length
      ? items.map((it) => `<tr>
          <td class="cr-desc">${esc(it.description || 'Service description')}</td>
          <td class="cr-price">${fmt(it.price, cur)}</td>
          <td class="cr-qty">${esc(it.qty ?? 1)}</td>
          <td class="cr-total">${fmt(it.total, cur)}</td>
        </tr>`).join('')
      : `<tr><td class="cr-empty" colspan="4">No items added</td></tr>`;

    const customerLines = (Array.isArray(data.customerAddressLines) ? data.customerAddressLines : []).filter(Boolean);

    const amountPaid = typeof data.amountPaid === 'number' ? data.amountPaid : null;
    const totalAmount = Number(data.totalAmount) || 0;
    const balanceDue = typeof data.balanceDue === 'number' ? data.balanceDue : Math.max(0, totalAmount - (amountPaid || 0));
    const status = String(data.status || (balanceDue > 0 ? (amountPaid > 0 ? 'partial' : 'unpaid') : 'paid')).toLowerCase();
    const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', refunded: 'Refunded' };
    const STATUS_COLOR = { paid: '#059669', partial: '#d97706', unpaid: '#dc2626', refunded: '#64748b' };
    const statusLabel = STATUS_LABEL[status] || status;
    const statusColor = STATUS_COLOR[status] || '#64748b';

    // --- Embedded CSS ---
    const css = `
      .cr-invoice {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        max-width: 680px;
        margin: 0 auto;
        padding: 28px 32px;
        background: #ffffff;
        color: #1e293b;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.04);
      }
      .cr-invoice--thumb {
        padding: 16px 20px;
        font-size: 13px;
        max-width: 100%;
      }
      .cr-invoice--thumb .cr-title { font-size: 20px; }
      .cr-invoice--thumb .cr-table { font-size: 12px; }
      .cr-invoice--thumb .cr-summary { font-size: 13px; }

      .cr-print-area {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* TOP: INVOICE + Company */
      .cr-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 14px;
        margin-bottom: 4px;
      }
      .cr-title {
        font-size: 30px;
        font-weight: 800;
        letter-spacing: 3px;
        color: ${accent};
        text-transform: uppercase;
      }
      .cr-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        text-align: right;
      }
      .cr-brandmark {
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${accent};
        border-radius: 50%;
        flex-shrink: 0;
      }
      .cr-brandmark img {
        width: 48px;
        height: 48px;
        object-fit: contain;
        border-radius: 50%;
      }
      .cr-brandmark svg {
        width: 28px;
        height: 28px;
        stroke: #fff;
      }
      .cr-brandname {
        font-size: 20px;
        font-weight: 700;
        color: ${accent};
        line-height: 1.2;
      }

      /* META: Bill to + Invoice # / Date */
      .cr-meta {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        padding: 6px 0 4px;
      }
      .cr-billto {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .cr-label {
        font-size: 12px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .cr-billname {
        font-size: 16px;
        font-weight: 600;
        color: #0f172a;
      }
      .cr-billaddr {
        font-size: 14px;
        color: #475569;
      }

      .cr-metaright {
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-align: right;
        padding-top: 2px;
      }
      .cr-metarow {
        display: flex;
        gap: 6px;
        font-size: 14px;
        color: #475569;
      }
      .cr-metarow .cr-label {
        font-size: 12px;
        color: #94a3b8;
        text-transform: uppercase;
      }
      .cr-metaval {
        font-weight: 600;
        color: #0f172a;
      }

      /* RULE */
      .cr-rule {
        border: none;
        border-top: 1px dashed #cbd5e1;
        margin: 4px 0 8px;
      }

      /* TABLE */
      .cr-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .cr-table thead th {
        text-align: left;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.5px;
        padding: 8px 6px 6px 6px;
        border-bottom: 1px solid #e2e8f0;
      }
      .cr-table tbody td {
        padding: 6px 6px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
      }
      .cr-table tbody tr:last-child td {
        border-bottom: none;
      }
      .cr-table .cr-desc { text-align: left; }
      .cr-table .cr-price, .cr-table .cr-qty { text-align: center; }
      .cr-table .cr-total { text-align: right; font-weight: 500; }
      .cr-table .cr-empty {
        text-align: center;
        color: #94a3b8;
        padding: 16px 0;
      }

      /* BOTTOM: Payment + Totals */
      .cr-bottom {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        padding: 6px 0 2px;
      }
      .cr-payment {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .cr-paydetail {
        font-size: 14px;
        color: #334155;
      }

      .cr-summary {
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-align: right;
        min-width: 160px;
      }
      .cr-sumrow {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        font-size: 14px;
        color: #475569;
        padding: 2px 0;
      }
      .cr-sumrow span:last-child {
        font-weight: 500;
        color: #0f172a;
      }
      .cr-sumrow.cr-total {
        font-size: 18px;
        font-weight: 700;
        border-top: 2px solid ${accent};
        padding-top: 6px;
        margin-top: 2px;
      }
      .cr-sumrow.cr-total span:last-child {
        color: ${accent};
        font-size: 20px;
      }

      /* TERMS */
      .cr-terms {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 0 2px;
        border-top: 1px solid #e2e8f0;
        margin-top: 4px;
      }
      .cr-terms .cr-label {
        font-size: 11px;
        color: #94a3b8;
        text-transform: uppercase;
      }
      .cr-terms span:last-child {
        font-size: 13px;
        color: #475569;
        line-height: 1.5;
      }

      /* FOOTER */
      .cr-footer {
        display: flex;
        justify-content: center;
        gap: 24px;
        padding: 14px 0 4px;
        border-top: 1px solid #e2e8f0;
        margin-top: 10px;
        font-size: 14px;
        color: #64748b;
        flex-wrap: wrap;
      }
      .cr-footer span {
        color: ${accent};
        font-weight: 500;
      }

      .cr-status-pill {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        padding: 3px 12px;
        border-radius: 100px;
        color: #fff;
        background: ${statusColor};
      }
      .cr-sumrow.cr-balance span:last-child { color: ${balanceDue > 0 ? '#dc2626' : '#059669'}; font-weight: 700; }
    `;

    // --- Build the HTML ---
    return `<div class="receipt-paper receipt-paper--classic cr-invoice cr-invoice--${size}">
      <style>${css}</style>
      <div class="cr-print-area">

        <!-- TOP: INVOICE + Company -->
        <div class="cr-top">
          <div class="cr-title">RECEIPT</div>
          <div class="cr-brand">
            <div class="cr-brandmark">${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="">` : DIAMOND_SVG}</div>
            <div class="cr-brandname">${esc(data.companyName || 'Marble BEAUTY & SPA')}</div>
          </div>
        </div>

        <!-- META: Bill to + Invoice # / Date -->
        <div class="cr-meta">
          <div class="cr-billto">
            <div class="cr-label">Bill to</div>
            <div class="cr-billname">${esc(data.customerName || 'Business Company 123')}</div>
            ${customerLines.map((l) => `<div class="cr-billaddr">${esc(l)}</div>`).join('')}
          </div>
          <div class="cr-metaright">
            <div class="cr-metarow"><span class="cr-label">Invoice</span><span class="cr-metaval">${esc(data.invoiceNumber || '#2345')}</span></div>
            <div class="cr-metarow"><span class="cr-label">Date</span><span class="cr-metaval">${esc(data.invoiceDate || '00/00/00')}</span></div>
            <div class="cr-metarow"><span class="cr-status-pill">${statusLabel}</span></div>
          </div>
        </div>

        <hr class="cr-rule">

        <!-- TABLE -->
        <table class="cr-table">
          <thead>
            <tr>
              <th class="cr-desc">Description</th>
              <th class="cr-price">Price</th>
              <th class="cr-qty">Qty</th>
              <th class="cr-total">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <hr class="cr-rule">

        <!-- BOTTOM: Payment + Totals -->
        <div class="cr-bottom">
          <div class="cr-payment">
            <div class="cr-label">Payment method</div>
            <div class="cr-paydetail">${esc(data.paymentMethod || 'By Internet Banking:')}</div>
            ${data.paymentDetail ? `<div class="cr-paydetail">${esc(data.paymentDetail)}</div>` : ''}
          </div>
          <div class="cr-summary">
            <div class="cr-sumrow"><span>Subtotal</span><span>${fmt(data.subtotal, cur)}</span></div>
            ${Number(data.taxAmount) > 0 ? `<div class="cr-sumrow"><span>Tax</span><span>${fmt(data.taxAmount, cur)}</span></div>` : ''}
            <div class="cr-sumrow cr-total"><span>Total</span><span>${fmt(data.totalAmount, cur)}</span></div>
            ${amountPaid !== null ? `<div class="cr-sumrow"><span>Amount Paid</span><span>${fmt(amountPaid, cur)}</span></div>
            <div class="cr-sumrow cr-balance"><span>Balance Due</span><span>${fmt(balanceDue, cur)}</span></div>` : ''}
          </div>
        </div>

        <!-- TERMS -->
        ${data.terms ? `<div class="cr-terms"><span class="cr-label">Terms &amp; conditions</span><span>${esc(data.terms)}</span></div>` : ''}

      </div>

      <!-- FOOTER -->
      <div class="cr-footer">
        ${data.contactWebsite ? `<span>${esc(data.contactWebsite)}</span>` : ''}
        ${data.contactEmail ? `<span>${esc(data.contactEmail)}</span>` : ''}
      </div>
    </div>`;
  }

  window.ClassicReceipt = { render };
})();