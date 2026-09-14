/* ============================================================
   Receiptly — normal-receipt.js (Retail thermal style)
   ------------------------------------------------------------
   Renders a clean thermal‑printer receipt exactly like the image:
   - "RECEIPT" title (centered)
   - Receipt No, Cashier, Date, Payment Method, Time, Customer
   - Table: S/N, ITEM, QTY, UNIT PRICE, TOTAL
   - Subtotal, Discount, Tax, Total
   - "Thank you for shopping with us!"
   - Amount Paid, Change
   - Receipt number at the bottom

   window.NormalReceipt.render(data, opts) -> HTML string
     data: { companyName, receiptNumber, cashier, date, paymentMethod,
             time, customer, items: [{name, qty, unitPrice, total}],
             subtotal, discount, tax, totalAmount,
             amountPaid, change, footerMessage }
     opts: { size: 'thumb' | 'full' }  (default 'full')
   ============================================================ */

(() => {
  const esc = (typeof App !== 'undefined' && App.escapeHTML)
    ? (s) => App.escapeHTML(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Generate a line of dashes (default 40)
  function dashLine(n) { return '-'.repeat(n || 40); }

  // Render the receipt
  function render(data, opts) {
    data = data || {};
    const size = (opts && opts.size === 'thumb') ? 'thumb' : 'full';

    // ─── Data ────────────────────────────────────────────────
    const companyName   = data.companyName   || 'Your Store';
    const receiptNumber = data.receiptNumber || 'RCP-2025-000123';
    const cashier       = data.cashier       || 'Daniel';
    const date          = data.date          || 'May 31, 2025';
    const paymentMethod = data.paymentMethod || 'Cash';
    const time          = data.time          || '10:45 AM';
    const customer      = data.customer      || 'Walk-in Customer';

    const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
    const maxItems = size === 'thumb' ? 3 : 20;
    const shownItems = items.slice(0, maxItems);

    // ─── Currency (must be defined before it's used below) ────
    // Currency symbol: use whatever the caller passed in (already
    // resolved via window.Currency.getSymbol(profile.currency) at
    // the call site), falling back to the shared Currency module
    // directly, then to ₦ only as a last resort so old callers that
    // never pass `currency` don't crash.
    const currencySymbol = data.currency ||
      (typeof Currency !== 'undefined' ? Currency.getSymbol(Currency.getUserCurrencyCode()) : '₦');

    function formatCurrency(amount) {
      return currencySymbol + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Build table rows
    let tableRows = '';
    if (shownItems.length === 0) {
      tableRows = `<tr><td colspan="5" style="text-align:center;padding:8px 0;color:#999;">No items added</td></tr>`;
    } else {
      shownItems.forEach((it, idx) => {
        const sn = idx + 1;
        const name = esc(it.name || 'Item');
        const qty = it.qty || 1;
        const unitPrice = typeof it.unitPrice === 'number' ? it.unitPrice : 0;
        const total = typeof it.total === 'number' ? it.total : qty * unitPrice;
        tableRows += `<tr>
          <td style="text-align:center;">${sn}</td>
          <td style="text-align:left;">${name}</td>
          <td style="text-align:center;">${qty}</td>
          <td style="text-align:right;">${formatCurrency(unitPrice)}</td>
          <td style="text-align:right;">${formatCurrency(total)}</td>
        </tr>`;
      });
    }

    // ─── Totals ──────────────────────────────────────────────
    const subtotal    = typeof data.subtotal    === 'number' ? data.subtotal    : 0;
    const discount    = typeof data.discount    === 'number' ? data.discount    : 0;
    const tax         = typeof data.tax         === 'number' ? data.tax         : 0;
    const totalAmount = typeof data.totalAmount === 'number' ? data.totalAmount : 0;
    const amountPaid  = typeof data.amountPaid  === 'number' ? data.amountPaid  : 0;
    const change      = typeof data.change      === 'number' ? data.change      : 0;
    const balanceDue  = typeof data.balanceDue  === 'number' ? data.balanceDue  : Math.max(0, totalAmount - amountPaid);
    const status      = String(data.status || (balanceDue > 0 ? (amountPaid > 0 ? 'partial' : 'unpaid') : 'paid')).toLowerCase();
    const STATUS_LABEL = { paid: 'PAID', partial: 'PARTIAL', unpaid: 'UNPAID', refunded: 'REFUNDED' };
    const STATUS_COLOR = { paid: '#059669', partial: '#d97706', unpaid: '#dc2626', refunded: '#64748b' };
    const statusLabel = STATUS_LABEL[status] || status.toUpperCase();
    const statusColor = STATUS_COLOR[status] || '#64748b';

    const footerMessage = data.footerMessage || 'Thank you for shopping with us!';

    // ─── Sizing ───────────────────────────────────────────────
    const sizeClass = size === 'thumb' ? 'nr-receipt--thumb' : '';

    // ─── CSS (embedded) ──────────────────────────────────────
    const css = `
      .nr-receipt {
        font-family: 'Courier New', Courier, monospace;
        max-width: 400px;
        margin: 0 auto;
        padding: 20px 18px;
        background: #fff;
        color: #000;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 13px;
        line-height: 1.5;
      }
      .nr-receipt--thumb {
        padding: 12px 10px;
        font-size: 11px;
        max-width: 100%;
      }
      .nr-receipt--thumb .nr-table { font-size: 10px; }
      .nr-receipt--thumb .nr-title { font-size: 16px; }
      .nr-receipt--thumb .nr-logo-wrap img { max-height: 26px; max-width: 70px; }
      .nr-receipt--thumb .nr-company { font-size: 12px; }

      .nr-title {
        text-align: center;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 2px;
        margin-bottom: 8px;
        text-transform: uppercase;
      }

      .nr-logo-wrap {
        display: flex;
        justify-content: center;
        margin-bottom: 4px;
      }
      .nr-logo-wrap img {
        max-height: 44px;
        max-width: 120px;
        object-fit: contain;
      }
      .nr-company {
        text-align: center;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }

      .nr-divider {
        border: none;
        border-top: 1px dashed #888;
        margin: 6px 0;
      }

      .nr-details {
        margin: 4px 0;
      }
      .nr-detail-row {
        display: flex;
        justify-content: space-between;
        padding: 1px 0;
        font-size: 13px;
      }
      .nr-detail-row .nr-label {
        font-weight: 600;
        min-width: 100px;
      }
      .nr-detail-row .nr-value {
        text-align: right;
        font-weight: 500;
      }

      .nr-table-wrap {
        overflow-x: auto;
        margin: 4px 0;
      }
      .nr-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .nr-table th {
        font-weight: 700;
        text-align: center;
        border-bottom: 1px solid #000;
        padding: 4px 2px;
        text-transform: uppercase;
        font-size: 11px;
      }
      .nr-table td {
        padding: 3px 2px;
        border-bottom: 1px dotted #ccc;
      }
      .nr-table tr:last-child td {
        border-bottom: none;
      }

      .nr-totals {
        margin: 4px 0;
        padding: 4px 0;
        border-top: 1px dashed #888;
      }
      .nr-total-row {
        display: flex;
        justify-content: space-between;
        padding: 1px 0;
        font-size: 13px;
      }
      .nr-total-row .nr-label {
        font-weight: 600;
      }
      .nr-total-row .nr-value {
        font-weight: 500;
      }
      .nr-total-row.nr-grand {
        font-size: 16px;
        font-weight: 800;
        border-top: 2px solid #000;
        padding-top: 4px;
        margin-top: 2px;
      }
      .nr-total-row.nr-grand .nr-value {
        font-size: 18px;
        color: #b91c1c;
      }

      .nr-thanks {
        text-align: center;
        font-weight: 700;
        font-size: 14px;
        margin: 6px 0;
        padding: 4px 0;
        border-top: 1px dashed #888;
        border-bottom: 1px dashed #888;
      }

      .nr-payment {
        margin: 4px 0;
      }
      .nr-payment .nr-detail-row {
        font-size: 13px;
      }

      .nr-footer {
        text-align: center;
        font-size: 13px;
        font-weight: 600;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px dashed #888;
        letter-spacing: 0.5px;
      }

      .nr-receipt--thumb .nr-detail-row { font-size: 11px; }
      .nr-receipt--thumb .nr-total-row { font-size: 11px; }
      .nr-receipt--thumb .nr-total-row.nr-grand { font-size: 14px; }
      .nr-receipt--thumb .nr-total-row.nr-grand .nr-value { font-size: 15px; }
      .nr-receipt--thumb .nr-thanks { font-size: 12px; }

      .nr-status-badge {
        display: block;
        text-align: center;
        font-weight: 800;
        font-size: 13px;
        letter-spacing: 2px;
        padding: 4px 0;
        margin-bottom: 6px;
        border: 2px solid ${statusColor};
        color: ${statusColor};
        border-radius: 4px;
      }
      .nr-total-row.nr-balance .nr-value { color: ${balanceDue > 0 ? '#dc2626' : '#059669'}; font-weight: 800; }
    `;

    // ─── Build HTML ──────────────────────────────────────────
    return `<div class="receipt-paper nr-receipt ${sizeClass}">
      <style>${css}</style>

      <!-- LOGO + COMPANY -->
      ${data.logoUrl ? `<div class="nr-logo-wrap"><img src="${esc(data.logoUrl)}" alt="Logo"></div>` : ''}
      <div class="nr-company">${esc(companyName)}</div>

      <!-- TITLE -->
      <div class="nr-title">RECEIPT</div>
      <div class="nr-status-badge">${statusLabel}</div>

      <hr class="nr-divider">

      <!-- DETAILS -->
      <div class="nr-details">
        <div class="nr-detail-row"><span class="nr-label">Receipt No:</span><span class="nr-value">${esc(receiptNumber)}</span></div>
        <div class="nr-detail-row"><span class="nr-label">Cashier:</span><span class="nr-value">${esc(cashier)}</span></div>
        <div class="nr-detail-row"><span class="nr-label">Date:</span><span class="nr-value">${esc(date)}</span></div>
        <div class="nr-detail-row"><span class="nr-label">Payment Method:</span><span class="nr-value">${esc(paymentMethod)}</span></div>
        <div class="nr-detail-row"><span class="nr-label">Time:</span><span class="nr-value">${esc(time)}</span></div>
        <div class="nr-detail-row"><span class="nr-label">Customer:</span><span class="nr-value">${esc(customer)}</span></div>
      </div>

      <hr class="nr-divider">

      <!-- TABLE -->
      <div class="nr-table-wrap">
        <table class="nr-table">
          <thead>
            <tr>
              <th style="width:12%;">S/N</th>
              <th style="width:38%;text-align:left;">ITEM</th>
              <th style="width:14%;">QTY</th>
              <th style="width:18%;">UNIT PRICE</th>
              <th style="width:18%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>

      <hr class="nr-divider">

      <!-- TOTALS -->
      <div class="nr-totals">
        <div class="nr-total-row"><span class="nr-label">Subtotal:</span><span class="nr-value">${formatCurrency(subtotal)}</span></div>
        <div class="nr-total-row"><span class="nr-label">Discount:</span><span class="nr-value">${formatCurrency(discount)}</span></div>
        <div class="nr-total-row"><span class="nr-label">Tax (7.5%):</span><span class="nr-value">${formatCurrency(tax)}</span></div>
        <div class="nr-total-row nr-grand"><span class="nr-label">Total:</span><span class="nr-value">${formatCurrency(totalAmount)}</span></div>
      </div>

      <!-- THANK YOU -->
      <div class="nr-thanks">${esc(footerMessage)}</div>

      <!-- PAYMENT / CHANGE -->
      <div class="nr-payment">
        <div class="nr-detail-row"><span class="nr-label">Amount Paid:</span><span class="nr-value">${formatCurrency(amountPaid)}</span></div>
        <div class="nr-detail-row"><span class="nr-label">Change:</span><span class="nr-value">${formatCurrency(change)}</span></div>
      </div>

      <div class="nr-totals" style="border-top:1px dashed #888;">
        <div class="nr-total-row nr-balance"><span class="nr-label">Balance Due:</span><span class="nr-value">${formatCurrency(balanceDue)}</span></div>
      </div>

      <!-- FOOTER -->
      <div class="nr-footer">${esc(receiptNumber)}</div>
    </div>`;
  }

  // Expose
  window.NormalReceipt = { render };
})();