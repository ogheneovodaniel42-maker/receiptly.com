/* ============================================================
   Receiptly — pro-invoice.js (Godwin‑style)
   ------------------------------------------------------------
   Renders a classic Nigerian "SALES INVOICE" exactly like the
   Godwin Nigeria Enterprise image:
   - Company name, specialization, address, phone(s)
   - "SALES INVOICE" title
   - Name / Address / Date fields
   - Two‑row table header: No. Of Cartons | Description | No. Of Sq | Qty | Unit Price | Amount / K
   - Data rows with dotted borders
   - "Thanks For Your Patronage" (left) + TOTAL (right)
   - Amount in words
   - Disclaimer: "Recieve the above goods in good no refund..."
   - Signatures: Cashier, Supplier, "For COMPANY"
   ============================================================ */

(() => {
  const esc = (typeof App !== 'undefined' && App.escapeHTML)
    ? (s) => App.escapeHTML(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Format currency (comma separators). Symbol comes from whatever
  // the caller passes as data.currency (resolved via the shared
  // Currency module at the call site) so this follows the user's
  // Settings currency instead of being hardcoded to ₦.
  function fmtCurrency(amount, currency) {
    return currency + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Number to words, with the major/minor unit names varying by
  // currency (Naira/Kobo, Dollars/Cents, Pounds/Pence, etc.) instead
  // of always saying "Naira and Kobo" regardless of which currency
  // the receipt is actually in.
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  // Keep in sync with the CURRENCIES list in js/currency.js.
  const UNIT_NAMES = {
    NGN: { major: 'Naira', minor: 'Kobo' },
    USD: { major: 'Dollars', minor: 'Cents' },
    GBP: { major: 'Pounds', minor: 'Pence' },
    EUR: { major: 'Euros', minor: 'Cents' },
    GHS: { major: 'Cedis', minor: 'Pesewas' },
    KES: { major: 'Shillings', minor: 'Cents' },
    ZAR: { major: 'Rand', minor: 'Cents' }
  };

  function threeDigits(n) {
    let out = '';
    if (n >= 100) { out += ONES[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
    if (n >= 20) { out += TENS[Math.floor(n / 10)] + ' '; n %= 10; }
    if (n > 0) { out += ONES[n] + ' '; }
    return out;
  }

  function numberToWords(num) {
    num = Math.floor(Math.max(0, num || 0));
    if (num === 0) return 'Zero';
    const parts = [];
    const billions = Math.floor(num / 1e9); num %= 1e9;
    const millions = Math.floor(num / 1e6); num %= 1e6;
    const thousands = Math.floor(num / 1e3); num %= 1e3;
    if (billions) parts.push(threeDigits(billions) + 'Billion');
    if (millions) parts.push(threeDigits(millions) + 'Million');
    if (thousands) parts.push(threeDigits(thousands) + 'Thousand');
    if (num) parts.push(threeDigits(num));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  // `currencyCode` is the 3-letter code (e.g. "USD"), not the symbol —
  // callers should pass data.currencyCode alongside data.currency.
  // Falls back to Naira/Kobo (the historical default) for an unknown
  // or missing code so nothing breaks for callers that don't pass it.
  function amountToWords(total, currencyCode) {
    const units = UNIT_NAMES[String(currencyCode || '').toUpperCase()] || UNIT_NAMES.NGN;
    const major = Math.floor(total);
    const minor = Math.round((total - major) * 100);
    let words = numberToWords(major) + ' ' + units.major;
    if (minor > 0) words += ' and ' + numberToWords(minor) + ' ' + units.minor;
    return words + ' Only';
  }

  // Main render
  function render(data, opts) {
    data = data || {};
    const size = (opts && opts.size === 'thumb') ? 'thumb' : 'full';

    // Currency symbol: use whatever the caller passed in (already
    // resolved via window.Currency.getSymbol(profile.currency) at
    // the call site), falling back to the shared Currency module
    // directly, then to ₦ only as a last resort.
    const currency = data.currency ||
      (typeof Currency !== 'undefined' ? Currency.getSymbol(Currency.getUserCurrencyCode()) : '₦');

    // Currency CODE (e.g. "USD"), used only for picking the right
    // major/minor unit names in the "Amount in Words" line. Prefer
    // an explicit code if the caller has one; otherwise derive it
    // from the resolved symbol, then fall back to the user's saved
    // currency code, then Naira as the historical default.
    const currencyCode = data.currencyCode ||
      (typeof Currency !== 'undefined'
        ? (Currency.codeFromSymbol(currency) || Currency.getUserCurrencyCode())
        : 'NGN');

    // Company info
    const companyName = esc(data.companyName || 'GODWIN NIGERIA ENTERPRISE');
    const specialization = esc(data.specialization || 'Specialise in selling of all kinds of Building Materials Such as Floor Tiles, Wall Tiles, Marble Tiles, Terrazo, Interlocked Tiles, Shaped Floor Tiles, Broken Tiles');
    const addressLine = esc(data.addressLine1 || '605 After Crest Oil, Filling Station Opposite Nodomebe Junction Upper Sokponba Rd. B/C');
    const phone = esc(data.phone || '08074569099, 08097618447, 08135624203');

    // Customer / invoice meta
    const customerName = esc(data.customerName || '');
    const customerAddress = esc(data.customerAddress || '');
    const dateStr = esc(data.date || '');

    // Items
    const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
    const maxRows = size === 'thumb' ? 3 : 20;
    const shownItems = items.slice(0, maxRows);

    // Compute total
    let total = 0;
    const rows = shownItems.map((it) => {
      const cartons = it.qty || 1;
      const qty = it.qty || 1;
      const price = it.price || 0;
      const amount = qty * price;
      total += amount;
      return `<tr>
        <td class="pi-col-cartons">${esc(cartons)}</td>
        <td class="pi-col-desc">${esc(it.name || 'Item')}</td>
        <td class="pi-col-sq">${esc(it.sq || '')}</td>
        <td class="pi-col-qty">${esc(qty)}</td>
        <td class="pi-col-price">${fmtCurrency(price, currency)}</td>
        <td class="pi-col-amount">${fmtCurrency(amount, currency)}</td>
      </tr>`;
    }).join('');

    const emptyRow = (items.length === 0 && size === 'full')
      ? `<tr><td colspan="6" style="text-align:center;color:#999;padding:12px;">No items added</td></tr>`
      : '';

    const totalStr = fmtCurrency(total, currency);
    const wordsStr = amountToWords(total, currencyCode);

    const amountPaid = typeof data.amountPaid === 'number' ? data.amountPaid : null;
    const balanceDue = typeof data.balanceDue === 'number' ? data.balanceDue : Math.max(0, total - (amountPaid || 0));
    const status = String(data.status || (balanceDue > 0 ? (amountPaid > 0 ? 'partial' : 'unpaid') : 'paid')).toLowerCase();
    const STATUS_LABEL = { paid: 'PAID', partial: 'PARTIAL', unpaid: 'UNPAID', refunded: 'REFUNDED' };
    const STATUS_COLOR = { paid: '#059669', partial: '#d97706', unpaid: '#dc2626', refunded: '#64748b' };
    const statusLabel = STATUS_LABEL[status] || status.toUpperCase();
    const statusColor = STATUS_COLOR[status] || '#64748b';

    // Thumb class
    const sizeClass = size === 'thumb' ? 'pi-invoice--thumb' : '';

    // ===== CSS (embedded) =====
    const css = `
      .pi-invoice {
        font-family: 'Times New Roman', Times, serif;
        max-width: 720px;
        margin: 0 auto;
        padding: 24px 28px;
        background: #fff;
        color: #000;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }
      .pi-invoice--thumb {
        padding: 12px 16px;
        font-size: 11px;
        max-width: 100%;
      }
      .pi-invoice--thumb .pi-company { font-size: 18px; }
      .pi-invoice--thumb .pi-title { font-size: 18px; }
      .pi-invoice--thumb .pi-table { font-size: 10px; }
      .pi-invoice--thumb .pi-logo-wrap img { max-height: 32px; max-width: 90px; }

      .pi-company {
        text-align: center;
        font-size: 26px;
        font-weight: 700;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }
      .pi-specialization {
        text-align: center;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 2px;
        color: #1e293b;
      }
      .pi-address {
        text-align: center;
        font-size: 13px;
        color: #1e293b;
        margin-bottom: 2px;
      }
      .pi-phone {
        text-align: center;
        font-size: 13px;
        color: #1e293b;
        margin-bottom: 12px;
      }

      .pi-title {
        text-align: center;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: 3px;
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        padding: 4px 0;
        margin-bottom: 12px;
      }

      .pi-info {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        margin-bottom: 10px;
        padding: 6px 0;
        border-bottom: 1px dashed #aaa;
      }
      .pi-info-item {
        display: flex;
        gap: 4px;
      }
      .pi-info-item .pi-label {
        font-weight: 600;
        min-width: 50px;
      }
      .pi-info-item .pi-value {
        min-width: 80px;
        border-bottom: 1px solid #000;
        padding: 0 6px;
        min-height: 22px;
        display: inline-block;
      }

      .pi-table-wrap {
        overflow-x: auto;
        margin: 6px 0 8px;
        border: 1px solid #000;
      }
      .pi-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .pi-table th {
        background: #1e293b;
        color: #fff;
        font-weight: 700;
        text-align: center;
        border: 1px solid #000;
        padding: 6px 4px;
        font-size: 11px;
        text-transform: uppercase;
      }
      .pi-table td {
        border: 1px solid #000;
        padding: 4px 6px;
        text-align: center;
        vertical-align: middle;
      }
      .pi-table .pi-col-desc {
        text-align: left;
      }
      .pi-table .pi-col-price,
      .pi-table .pi-col-amount {
        text-align: right;
        font-weight: 500;
      }
      .pi-table .pi-col-cartons,
      .pi-table .pi-col-sq,
      .pi-table .pi-col-qty {
        text-align: center;
      }
      .pi-table tbody tr:nth-child(even) {
        background: #f8fafc;
      }

      .pi-footer {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-top: 10px;
        padding: 6px 0;
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        font-size: 16px;
        font-weight: 700;
      }
      .pi-thanks {
        font-size: 16px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .pi-total {
        display: flex;
        gap: 12px;
        align-items: baseline;
        font-size: 18px;
      }
      .pi-total-amount {
        font-size: 22px;
        color: #b91c1c;
        font-weight: 800;
      }

      .pi-words {
        margin: 8px 0 4px;
        font-size: 14px;
        display: flex;
        gap: 6px;
      }
      .pi-words .pi-label {
        font-weight: 600;
        min-width: 130px;
      }
      .pi-words .pi-value {
        border-bottom: 1px solid #000;
        flex: 1;
        padding: 0 6px;
        min-height: 24px;
      }

      .pi-disclaimer {
        font-size: 13px;
        text-align: center;
        margin: 6px 0 10px;
        padding: 4px 0;
        border-top: 1px dashed #aaa;
        border-bottom: 1px dashed #aaa;
        color: #1e293b;
      }

      .pi-signatures {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-top: 12px;
        font-size: 13px;
        font-weight: 500;
        text-align: center;
      }
      .pi-sig-block {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }
      .pi-sig-line {
        display: block;
        border-bottom: 1px solid #000;
        min-width: 100px;
        min-height: 24px;
        margin: 0 auto;
        width: 80%;
      }
      .pi-sig-label {
        font-size: 12px;
        font-weight: 400;
        color: #1e293b;
      }
      .pi-sig-company {
        font-weight: 700;
        font-size: 13px;
        text-transform: uppercase;
        border: 1px solid #000;
        padding: 2px 8px;
        display: inline-block;
        background: #f1f5f9;
      }

      .pi-status-badge {
        display: inline-block;
        font-weight: 800;
        font-size: 13px;
        letter-spacing: 1.5px;
        padding: 3px 14px;
        border: 2px solid ${statusColor};
        color: ${statusColor};
        border-radius: 4px;
      }
      .pi-balance-row .pi-value { color: ${balanceDue > 0 ? '#dc2626' : '#059669'}; }
    `;

    // ===== Build the HTML =====
    return `<div class="receipt-paper pi-invoice ${sizeClass}">
      <style>${css}
        .pi-logo-wrap { display:flex; justify-content:center; margin-bottom:6px; }
        .pi-logo-wrap img { max-height:56px; max-width:160px; object-fit:contain; }
      </style>

      ${data.logoUrl ? `<div class="pi-logo-wrap"><img src="${esc(data.logoUrl)}" alt="Logo"></div>` : ''}
      <div class="pi-company">${companyName}</div>
      ${specialization ? `<div class="pi-specialization">${specialization}</div>` : ''}
      <div class="pi-address">${addressLine}</div>
      <div class="pi-phone">${phone}</div>

      <div class="pi-title">SALES INVOICE</div>

      <div class="pi-info">
        <div class="pi-info-item"><span class="pi-label">Name:</span><span class="pi-value">${customerName}</span></div>
        <div class="pi-info-item"><span class="pi-label">Address:</span><span class="pi-value">${customerAddress}</span></div>
        <div class="pi-info-item"><span class="pi-label">Date:</span><span class="pi-value">${dateStr}</span></div>
        <div class="pi-info-item"><span class="pi-status-badge">${statusLabel}</span></div>
      </div>

      <div class="pi-table-wrap">
        <table class="pi-table">
          <thead>
            <tr>
              <th rowspan="2">No. Of<br>Cartons</th>
              <th rowspan="2">Description of Goods</th>
              <th rowspan="2">No. Of<br>Sq</th>
              <th rowspan="2">Qty</th>
              <th rowspan="2">Unit Price</th>
              <th colspan="1">Amount</th>
            </tr>
            <tr>
              <th>K</th>
            </tr>
          </thead>
          <tbody>
            ${rows || emptyRow}
          </tbody>
        </table>
      </div>

      <div class="pi-footer">
        <span class="pi-thanks">Thanks For Your Patronage</span>
        <span class="pi-total">TOTAL <span class="pi-total-amount">${totalStr}</span></span>
      </div>

      <div class="pi-words">
        <span class="pi-label">Amount in words:</span>
        <span class="pi-value">${wordsStr}</span>
      </div>

      ${amountPaid !== null ? `<div class="pi-words">
        <span class="pi-label">Amount Paid:</span>
        <span class="pi-value">${fmtCurrency(amountPaid, currency)}</span>
      </div>
      <div class="pi-words pi-balance-row">
        <span class="pi-label">Balance Due:</span>
        <span class="pi-value">${fmtCurrency(balanceDue, currency)}</span>
      </div>` : ''}

      <div class="pi-disclaimer">
        Recieve the above goods in good no refund of money after payment
      </div>

      <div class="pi-signatures">
        <div class="pi-sig-block">
          <span class="pi-sig-line"></span>
          <span class="pi-sig-label">Cashier's Signature</span>
        </div>
        <div class="pi-sig-block">
          <span class="pi-sig-line"></span>
          <span class="pi-sig-label">Supplier Signature</span>
        </div>
        <div class="pi-sig-block">
          <span class="pi-sig-company">For ${companyName}</span>
          <span class="pi-sig-label">(Authorized Signatory)</span>
        </div>
      </div>
    </div>`;
  }

  // Expose
  window.ProInvoice = { render, amountToWords, numberToWords };
})();