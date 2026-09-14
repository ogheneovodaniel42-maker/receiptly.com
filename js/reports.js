document.addEventListener('DOMContentLoaded', () => {
  if (!App.initPage('reports.html', 'Reports')) return;
  const receipts = DB.getReceipts();
  const expenses = DB.getExpenses();
  const payments = DB.getPayments();
  const currency = () => App.money(0).replace(/[\d.,\s-]/g, '') || '₦';

  // Customer payments only — subscription/billing payments (paid by
  // this business to Receiptly itself) live in the same collection
  // but must never count as business revenue collected from customers.
  // Status is matched case-insensitively since the Payments page
  // stores it as "Paid" while other parts of the app use "completed".
  const COMPLETED_STATUSES = ['completed', 'paid'];
  const completedPayments = payments.filter(p =>
    p.type !== 'subscription' &&
    COMPLETED_STATUSES.includes(String(p.status || 'completed').toLowerCase())
  );
  const sales = receipts.reduce((sum, r) => sum + Number(r.total || r.amount || 0), 0);
  const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount || e.total || 0), 0);
  const collected = completedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const outstanding = Math.max(0, sales - collected);
  const profit = sales - expenseTotal;

  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('reportSales', App.money(sales));
  set('reportExpenses', App.money(expenseTotal));
  set('reportProfit', App.money(profit));
  set('reportCollected', App.money(collected));
  set('reportOutstanding', App.money(outstanding));
  set('reportReceipts', receipts.length);
  set('reportPayments', completedPayments.length);
  set('reportCustomers', DB.getCustomers().length);

  const tbody = document.getElementById('reportRows');
  if (tbody) {
    const rows = [
      ['Sales', sales, 'Income'],
      ['Payments collected', collected, 'Income'],
      ['Expenses', expenseTotal, 'Expense'],
      ['Net profit', profit, 'Result'],
      ['Outstanding', outstanding, 'Receivable']
    ];
    tbody.innerHTML = rows.map(([name, amount, type]) =>
      `<tr><td>${App.escapeHTML(name)}</td><td>${App.escapeHTML(type)}</td><td class="${amount < 0 ? 'negative' : ''}">${App.escapeHTML(App.money(amount))}</td></tr>`
    ).join('');
  }

});
