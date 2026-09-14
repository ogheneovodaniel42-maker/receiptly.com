/* ============================================================
   Receiptly — modern-receipt.js (corrected for image match)
   ------------------------------------------------------------
   Renders a receipt exactly like the uploaded image:
   - "RECEIPT" left, "Upload Logo" / logo right
   - "Billed To" with customer details
   - Receipt # and date
   - Table columns: QTY | Description | Unit Price | Amount
   - Subtotal, Sales Tax (X%), Total (USD)
   - Notes + contact info
   ============================================================ */

(() => {
  const esc = (typeof App !== 'undefined' && App.escapeHTML)
    ? (s) => App.escapeHTML(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function fmtCurrency(amount, currency = '$') {
    return currency + Number(amount).toFixed(2);
  }

  function render(data, opts) {
    data = data || {};
    const size = (opts && opts.size === 'thumb') ? 'thumb' : 'full';
    const currency = data.currency ||
      (typeof Currency !== 'undefined' ? Currency.getSymbol(Currency.getUserCurrencyCode()) : '$');

    // --- items ---
    const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
    // Compute subtotal from items (qty * unitPrice)
    let subtotal = 0;
    const itemRows = items.map(it => {
      const qty = Number(it.qty) || 0;
      const unitPrice = Number(it.unitPrice) || Number(it.price) || 0;
      const amount = qty * unitPrice;
      subtotal += amount;
      return {
        qty,
        description: it.description || it.name || 'Service',
        unitPrice,
        amount
      };
    });

    // --- tax & total ---
    const taxRate = Number(data.taxRate) || Number(data.tax) || 0; // e.g. 5 for 5%
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // --- optional paid / balance ---
    const amountPaid = typeof data.amountPaid === 'number' ? data.amountPaid : null;
    const balanceDue = typeof data.balanceDue === 'number' ? data.balanceDue : (amountPaid !== null ? Math.max(0, total - amountPaid) : null);

    // --- status pill (optional) ---
    let status = 'unpaid';
    if (amountPaid !== null && amountPaid >= total) status = 'paid';
    else if (amountPaid !== null && amountPaid > 0) status = 'partial';
    const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', refunded: 'Refunded' };
    const STATUS_COLOR = { paid: '#059669', partial: '#d97706', unpaid: '#dc2626', refunded: '#64748b' };
    const statusLabel = STATUS_LABEL[status] || status;
    const statusColor = STATUS_COLOR[status] || '#64748b';

    // --- build table rows (max rows for thumb) ---
    const maxRows = size === 'thumb' ? 3 : 20;
    const shownItems = itemRows.slice(0, maxRows);
    const rowsHtml = shownItems.map(row => `
      <tr>
        <td class="col-qty">${esc(row.qty)}</td>
        <td class="col-desc">${esc(row.description)}</td>
        <td class="col-price">${fmtCurrency(row.unitPrice, currency)}</td>
        <td class="col-amount">${fmtCurrency(row.amount, currency)}</td>
      </tr>
    `).join('');

    const emptyRow = (items.length === 0 && size === 'full')
      ? `<tr><td colspan="4" style="text-align:center;color:#999;padding:12px;">No items added</td></tr>`
      : '';

    // --- data fields (exactly as image) ---
    const companyName = esc(data.companyName || 'Your Company Inc.');
    const companyAddress = esc(data.companyAddress || '1234 Company St.\nCompany Town, ST 12345');
    const customerName = esc(data.customerName || 'Customer Name');
    const customerAddress = esc(data.customerAddress || '1234 Customer St,\nCustomer Town, ST 12345');
    const receiptNumber = esc(data.receiptNumber || data.invoiceNumber || '0000457');
    const receiptDate = esc(data.receiptDate || data.date || '11-04-2025');
    const notes = esc(data.notes || 'Thank you for your purchase! All sales are final after 30 days. Please retain this receipt for warranty or exchange purposes.');
    const contactLine = esc(data.contactLine || 'For questions or support, contact us at support@example.com or (555) 987-6543.');

    // --- CSS (clean, matches image) ---
    const css = `
      .mr-invoice {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        max-width: 700px;
        margin: 0 auto;
        padding: 28px 32px;
        background: #ffffff;
        color: #1e293b;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.04);
      }
      .mr-invoice--thumb {
        padding: 16px 20px;
        font-size: 13px;
        max-width: 100%;
      }
      .mr-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 12px;
        margin-bottom: 18px;
      }
      .mr-header-left {
        display: flex;
        flex-direction: column;
      }
      .mr-receipt-label {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 4px;
        color: #0f172a;
        text-transform: uppercase;
      }
      .mr-company-name {
        font-size: 20px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.3;
        margin-top: 2px;
      }
      .mr-company-address {
        font-size: 14px;
        color: #475569;
        white-space: pre-line;
        line-height: 1.4;
      }
      .mr-header-right {
        text-align: right;
        font-size: 14px;
        color: #64748b;
        min-width: 100px;
      }
      .mr-logo-placeholder {
        border: 1.5px dashed #cbd5e1;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        color: #94a3b8;
        background: #f8fafc;
        display: inline-block;
        user-select: none;
        cursor: default;
      }
      .mr-logo-img {
        max-height: 50px;
        max-width: 120px;
        object-fit: contain;
      }
      .mr-billto {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 14px 18px;
        margin-bottom: 16px;
      }
      .mr-billto-label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 2px;
      }
      .mr-customer-name {
        font-size: 16px;
        font-weight: 600;
        color: #0f172a;
      }
      .mr-customer-address {
        font-size: 14px;
        color: #475569;
        white-space: pre-line;
        line-height: 1.4;
      }
      .mr-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 32px;
        margin-bottom: 14px;
        font-size: 14px;
        color: #334155;
      }
      .mr-meta-item strong {
        font-weight: 600;
        color: #0f172a;
        margin-right: 4px;
      }
      .mr-table-wrap {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
        margin: 12px 0 14px;
      }
      .mr-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .mr-table th {
        background: #f1f5f9;
        font-weight: 600;
        color: #0f172a;
        padding: 10px 14px;
        text-align: left;
        border-bottom: 2px solid #d1d8e0;
      }
      .mr-table th:last-child, .mr-table td:last-child {
        text-align: right;
      }
      .mr-table td {
        padding: 9px 14px;
        border-bottom: 1px solid #f1f5f9;
      }
      .mr-table tr:last-child td {
        border-bottom: none;
      }
      .col-qty { text-align: center; width: 12%; }
      .col-desc { text-align: left; width: 40%; }
      .col-price { text-align: right; width: 20%; }
      .col-amount { text-align: right; width: 28%; }

      .mr-totals {
        margin: 10px 0 6px;
        padding-top: 10px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }
      .mr-totals-row {
        display: flex;
        justify-content: flex-end;
        width: 100%;
        padding: 2px 0;
        font-size: 14px;
      }
      .mr-totals-row .label {
        width: 160px;
        text-align: right;
        padding-right: 24px;
        color: #475569;
      }
      .mr-totals-row .value {
        width: 120px;
        text-align: right;
        font-weight: 500;
        color: #0f172a;
      }
      .mr-totals-row.grand {
        font-weight: 700;
        font-size: 16px;
        border-top: 2px solid #d1d8e0;
        margin-top: 4px;
        padding-top: 8px;
      }
      .mr-totals-row.grand .value {
        font-size: 18px;
        color: #0f172a;
      }
      .mr-notes {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid #e2e8f0;
        font-size: 14px;
        color: #475569;
        line-height: 1.5;
      }
      .mr-contact {
        margin-top: 6px;
        font-size: 14px;
        color: #475569;
      }
      .mr-status-pill {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        padding: 3px 12px;
        border-radius: 100px;
        color: #fff;
        background: ${statusColor};
        margin-top: 6px;
      }
      /* thumb adjustments */
      .mr-invoice--thumb .mr-receipt-label { font-size: 20px; }
      .mr-invoice--thumb .mr-company-name { font-size: 17px; }
      .mr-invoice--thumb .mr-table { font-size: 12px; }
      .mr-invoice--thumb .mr-table th, .mr-invoice--thumb .mr-table td { padding: 6px 10px; }
      .mr-invoice--thumb .mr-totals-row .label { width: 120px; padding-right: 16px; }
      .mr-invoice--thumb .mr-totals-row .value { width: 80px; }
      .mr-invoice--thumb .mr-notes, .mr-invoice--thumb .mr-contact { font-size: 12px; }
    `;

    const sizeClass = size === 'thumb' ? 'mr-invoice--thumb' : '';

    // Build logo area
    let logoHtml = '';
    if (data.logoUrl) {
      logoHtml = `<img src="${esc(data.logoUrl)}" alt="Logo" class="mr-logo-img">`;
    } else {
      logoHtml = `<div class="mr-logo-placeholder">Upload Logo</div>`;
    }

    // Status pill (optional)
    const statusHtml = (data.showStatus !== false) ? `<div class="mr-status-pill">${statusLabel}</div>` : '';

    // Build totals rows
    let totalsHtml = `
      <div class="mr-totals-row">
        <span class="label">Subtotal</span>
        <span class="value">${fmtCurrency(subtotal, currency)}</span>
      </div>
    `;
    if (taxRate > 0) {
      totalsHtml += `
        <div class="mr-totals-row">
          <span class="label">Sales Tax (${taxRate}%)</span>
          <span class="value">${fmtCurrency(taxAmount, currency)}</span>
        </div>
      `;
    }
    totalsHtml += `
      <div class="mr-totals-row grand">
        <span class="label">Total (${currency})</span>
        <span class="value">${fmtCurrency(total, currency)}</span>
      </div>
    `;
    if (amountPaid !== null) {
      totalsHtml += `
        <div class="mr-totals-row">
          <span class="label">Amount Paid</span>
          <span class="value">${fmtCurrency(amountPaid, currency)}</span>
        </div>
        <div class="mr-totals-row" style="font-weight:600;color:${balanceDue > 0 ? '#dc2626' : '#059669'}">
          <span class="label">Balance Due</span>
          <span class="value">${fmtCurrency(balanceDue, currency)}</span>
        </div>
      `;
    }

    return `<div class="receipt-paper mr-invoice ${sizeClass}">
      <style>${css}</style>

      <!-- header: RECEIPT left, logo right -->
      <div class="mr-header">
        <div class="mr-header-left">
          <div class="mr-receipt-label">RECEIPT</div>
          <div class="mr-company-name">${companyName}</div>
          <div class="mr-company-address">${companyAddress}</div>
        </div>
        <div class="mr-header-right">
          ${logoHtml}
          ${statusHtml}
        </div>
      </div>

      <!-- Billed To -->
      <div class="mr-billto">
        <div class="mr-billto-label">Billed To</div>
        <div class="mr-customer-name">${customerName}</div>
        <div class="mr-customer-address">${customerAddress}</div>
      </div>

      <!-- Receipt # and Date -->
      <div class="mr-meta">
        <div class="mr-meta-item"><strong>Receipt #</strong> ${receiptNumber}</div>
        <div class="mr-meta-item"><strong>Receipt date</strong> ${receiptDate}</div>
      </div>

      <!-- Table -->
      <div class="mr-table-wrap">
        <table class="mr-table">
          <thead>
            <tr>
              <th class="col-qty">QTY</th>
              <th class="col-desc">Description</th>
              <th class="col-price">Unit Price</th>
              <th class="col-amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || emptyRow}
          </tbody>
        </table>
      </div>

      <!-- Totals -->
      <div class="mr-totals">
        ${totalsHtml}
      </div>

      <!-- Notes & Contact -->
      <div class="mr-notes">${notes}</div>
      <div class="mr-contact">${contactLine}</div>
    </div>`;
  }

  // Expose the renderer
  window.ModernReceipt = { render };
})();