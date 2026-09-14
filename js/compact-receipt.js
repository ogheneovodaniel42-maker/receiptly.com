/* ============================================================
   Receiptly — compact-receipt.js (Thermal shopping style)
   ------------------------------------------------------------
   Renders a compact thermal receipt exactly like the image:
   - Store name, address, "SHOPPING CENTER"
   - Date and time
   - Items: name left, price right (qty × price)
   - TOTAL (bold), VAT included
   - Bank card number (masked), APPROVED status
   - Refund policy
   - Auto‑generated barcode/QR code placeholder

   window.CompactReceipt.render(data, opts) -> HTML string
     data: { companyName, addressLine1, addressLine2,
             date, time, items: [{name, price, qty}],
             total, vat, cardNumber, approvalStatus,
             refundPolicy, storeName }
     opts: { size: 'thumb' | 'full' }  (default 'full')
   ============================================================ */

(() => {
  const esc = (typeof App !== 'undefined' && App.escapeHTML)
    ? (s) => App.escapeHTML(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Format currency. Symbol comes from data.currency (resolved via
  // the shared Currency module at the call site) instead of being
  // hardcoded, so this follows the user's Settings currency.
  function fmt(amount, currency) {
    return currency + Number(amount).toFixed(2);
  }

  // Generate a simple barcode (CSS bars)
  function generateBarcode() {
    // Random pattern – 18 bars
    const widths = [4,1,3,1,5,1,2,3,1,4,1,2,3,1,5,1,2,4];
    return `<div class="cr-barcode">${widths.map(w => `<span class="cr-bar" style="width:${w}px;"></span>`).join('')}</div>`;
  }

  function render(data, opts) {
    data = data || {};
    const size = (opts && opts.size === 'thumb') ? 'thumb' : 'full';

    // Currency symbol: use whatever the caller passed in (already
    // resolved via window.Currency.getSymbol(profile.currency) at
    // the call site), falling back to the shared Currency module
    // directly, then to $ only as a last resort.
    const currency = data.currency ||
      (typeof Currency !== 'undefined' ? Currency.getSymbol(Currency.getUserCurrencyCode()) : '$');

    // ─── Data ──────────────────────────────────────────────
    const storeName = data.storeName || data.companyName || '123543 MAIN ST';
    const address1 = data.addressLine1 || 'PORT CITY';
    const address2 = data.addressLine2 || 'CALIFORNIA 19210';
    const shoppingCenter = data.shoppingCenter || 'SHOPPING CENTER';

    const date = data.date || '03/07/2017';
    const time = data.time || '10:45AM';

    const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
    const maxItems = size === 'thumb' ? 2 : 10;
    const shownItems = items.slice(0, maxItems);

    // Build item lines
    let itemLines = '';
    if (shownItems.length === 0) {
      itemLines = `<div class="cr-item"><span class="cr-item-name">No items</span><span class="cr-item-price"></span></div>`;
    } else {
      shownItems.forEach((it) => {
        const name = esc(it.name || 'Item');
        const qty = it.qty || 1;
        const price = typeof it.price === 'number' ? it.price : 0;
        const lineTotal = qty * price;
        // Format as "19-728  Battery 18V 3.0Ah x 2  $32.95"
        const displayName = name + (qty > 1 ? ` x ${qty}` : '');
        itemLines += `<div class="cr-item"><span class="cr-item-name">${displayName}</span><span class="cr-item-price">${fmt(lineTotal, currency)}</span></div>`;
      });
    }

    // Totals
    const total = typeof data.total === 'number' ? data.total : items.reduce((sum, it) => sum + (it.qty || 1) * (it.price || 0), 0);
    const vat = typeof data.vat === 'number' ? data.vat : total * 0.20; // default 20% VAT
    const cardNumber = data.cardNumber || '';
    const invoiceNum = data.invoiceNumber || '654238';
    const authNum = data.authNumber || '192107';
    const refundPolicy = data.refundPolicy || 'Receipts are required for all refunds\nRefunds must be made within 30 days';

    const amountPaid = typeof data.amountPaid === 'number' ? data.amountPaid : null;
    const balanceDue = typeof data.balanceDue === 'number' ? data.balanceDue : Math.max(0, total - (amountPaid || 0));
    const status = String(data.status || (balanceDue > 0 ? (amountPaid > 0 ? 'partial' : 'unpaid') : 'paid')).toLowerCase();
    const STATUS_LABEL = { paid: 'PAID', partial: 'PARTIAL PAYMENT', unpaid: 'UNPAID', refunded: 'REFUNDED' };
    const STATUS_COLOR = { paid: '#1a7a3a', partial: '#b45309', unpaid: '#b91c1c', refunded: '#555' };
    const approvalStatus = data.approvalStatus || (STATUS_LABEL[status] || status.toUpperCase());
    const approvalColor = STATUS_COLOR[status] || '#1a7a3a';

    // ─── Sizing ──────────────────────────────────────────────
    const sizeClass = size === 'thumb' ? 'cr-receipt--thumb' : '';

    // ─── CSS (embedded) ──────────────────────────────────────
    const css = `
      .cr-receipt {
        font-family: 'Courier New', Courier, monospace;
        max-width: 340px;
        margin: 0 auto;
        padding: 16px 14px;
        background: #fff;
        color: #000;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 12px;
        line-height: 1.5;
        text-align: left;
      }
      .cr-receipt--thumb {
        padding: 10px 8px;
        font-size: 10px;
        max-width: 100%;
      }
      .cr-receipt--thumb .cr-total { font-size: 14px; }
      .cr-receipt--thumb .cr-barcode .cr-bar { height: 16px; }
      .cr-receipt--thumb .cr-logo-wrap img { max-height: 24px; max-width: 64px; }

      .cr-logo-wrap {
        display: flex;
        justify-content: center;
        margin-bottom: 4px;
      }
      .cr-logo-wrap img {
        max-height: 44px;
        max-width: 120px;
        object-fit: contain;
      }
      .cr-store {
        text-align: center;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: 0.5px;
      }
      .cr-address {
        text-align: center;
        font-size: 12px;
        color: #333;
      }
      .cr-center-name {
        text-align: center;
        font-size: 14px;
        font-weight: 700;
        margin: 2px 0 4px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .cr-datetime {
        text-align: center;
        font-size: 12px;
        color: #333;
        margin-bottom: 6px;
      }

      .cr-divider {
        border: none;
        border-top: 1px dashed #888;
        margin: 4px 0;
      }
      .cr-divider--thick {
        border-top: 2px solid #000;
        margin: 4px 0;
      }

      .cr-items {
        margin: 4px 0;
      }
      .cr-item {
        display: flex;
        justify-content: space-between;
        padding: 1px 0;
        font-size: 12px;
      }
      .cr-item-name {
        font-weight: 400;
        max-width: 70%;
      }
      .cr-item-price {
        font-weight: 500;
        white-space: nowrap;
      }

      .cr-total {
        display: flex;
        justify-content: space-between;
        font-weight: 700;
        font-size: 16px;
        padding: 4px 0 2px;
        border-top: 1px solid #000;
        border-bottom: 1px solid #000;
        margin: 4px 0;
      }
      .cr-total .cr-total-label {
        text-transform: uppercase;
      }
      .cr-total .cr-total-value {
        font-size: 18px;
      }

      .cr-vat {
        text-align: right;
        font-size: 11px;
        color: #555;
        margin-top: -2px;
        margin-bottom: 4px;
      }

      .cr-card {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        padding: 2px 0;
      }
      .cr-card .cr-label {
        font-weight: 600;
      }
      .cr-approval {
        text-align: center;
        font-weight: 700;
        font-size: 14px;
        color: ${approvalColor};
        letter-spacing: 1px;
        margin: 2px 0;
      }
      .cr-balance {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 700;
        padding: 2px 0 4px;
        color: ${balanceDue > 0 ? '#b91c1c' : '#1a7a3a'};
      }
      .cr-auth {
        text-align: center;
        font-size: 11px;
        color: #555;
        margin-bottom: 4px;
      }
      .cr-refund {
        text-align: center;
        font-size: 10px;
        color: #333;
        white-space: pre-line;
        margin: 4px 0;
        border-top: 1px dashed #888;
        border-bottom: 1px dashed #888;
        padding: 4px 0;
        line-height: 1.4;
      }

      .cr-barcode-wrap {
        text-align: center;
        margin: 6px 0 2px;
      }
      .cr-barcode {
        display: inline-flex;
        gap: 2px;
        align-items: stretch;
        height: 24px;
      }
      .cr-bar {
        background: #000;
        height: 100%;
        flex-shrink: 0;
        border-radius: 1px;
      }

      .cr-footer {
        text-align: center;
        font-size: 9px;
        color: #aaa;
        margin-top: 4px;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
    `;

    // ─── Build HTML ──────────────────────────────────────────
    return `<div class="receipt-paper cr-receipt ${sizeClass}">
      <style>${css}</style>

      <!-- Store Info -->
      ${data.logoUrl ? `<div class="cr-logo-wrap"><img src="${esc(data.logoUrl)}" alt="Logo"></div>` : ''}
      <div class="cr-store">${esc(storeName)}</div>
      <div class="cr-address">${esc(address1)}</div>
      <div class="cr-address">${esc(address2)}</div>
      <div class="cr-center-name">${esc(shoppingCenter)}</div>
      <div class="cr-datetime">${esc(date)}  ${esc(time)}</div>

      <hr class="cr-divider">

      <!-- Items -->
      <div class="cr-items">
        ${itemLines}
      </div>

      <hr class="cr-divider--thick">

      <!-- Total -->
      <div class="cr-total">
        <span class="cr-total-label">TOTAL:</span>
        <span class="cr-total-value">${fmt(total, currency)}</span>
      </div>
      <div class="cr-vat">Incl. VAT (20%): ${fmt(vat, currency)}</div>
      ${amountPaid !== null ? `<div class="cr-balance"><span>BALANCE DUE:</span><span>${fmt(balanceDue, currency)}</span></div>` : ''}

      <hr class="cr-divider">

      <!-- Payment -->
      ${cardNumber ? `<div class="cr-card">
        <span class="cr-label">Bank Card#</span>
        <span>${esc(cardNumber)}</span>
      </div>` : ''}
      ${approvalStatus ? `<div class="cr-approval">${esc(approvalStatus)}</div>` : ''}
      <div class="cr-auth">INV. ${esc(invoiceNum)}  AUTH. ${esc(authNum)}</div>

      <!-- Refund -->
      <div class="cr-refund">${esc(refundPolicy)}</div>

      <!-- Barcode (auto‑generated) -->
      <div class="cr-barcode-wrap">
        ${generateBarcode()}
      </div>

      <!-- Footer -->
      <div class="cr-footer">shutterstock</div>
    </div>`;
  }

  window.CompactReceipt = { render };
})();