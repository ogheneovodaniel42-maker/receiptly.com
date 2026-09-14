const AuditLog = {
  record(action, module = 'system', details = '', targetId = null) {
    if (typeof DB === 'undefined' || !DB.addAuditLog) return null;
    return DB.addAuditLog({ action, module, details, targetId });
  },
  pageView(page) {
    // Avoid logging the audit-log page itself repeatedly on every render.
    return this.record('page_view', 'navigation', `Viewed ${page}`);
  },
  clear() {
    // Only this account's own entries — never every account's history.
    if (typeof DB !== 'undefined' && DB.clearAuditLogsForUser) DB.clearAuditLogsForUser();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Some pages (customers.html, expenses.html, verify-receipt.html) load
  // this script without js/app.js. Guard so those pages don't crash with
  // "App is not defined" — they simply skip the shared-shell init and
  // still log their own page view via AuditLog.pageView() below.
  if (typeof App !== 'undefined') {
    if (!App.initPage('audit-log.html', 'Audit Log')) return;
  }
  const rows = document.getElementById('auditRows');
  if (!rows) { AuditLog.pageView(document.title.replace(/\s+—.*$/, '')); return; }
  const search = document.getElementById('auditSearch');

  function render() {
    const q = (search?.value || '').toLowerCase().trim();
    // My activity only — actions taken on my account, whether by me or
    // by an admin (e.g. a suspension shows up here too).
    const logs = DB.getAuditLogsForUser().filter(l => !q || [l.action,l.module,l.userEmail,l.details].some(v => String(v || '').toLowerCase().includes(q)));
    rows.innerHTML = logs.length ? logs.map(l => `
      <tr>
        <td>${App.escapeHTML(App.formatDateTime(l.timestamp))}</td>
        <td class="audit-action">${App.escapeHTML(l.action.replaceAll('_',' '))}</td>
        <td>${App.escapeHTML(l.module)}</td>
        <td>${App.escapeHTML(l.userEmail || 'Current user')}</td>
        <td>${App.escapeHTML(l.details || '—')}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">No audit activity yet.</td></tr>';
  }
  search?.addEventListener('input', render);
  document.getElementById('clearAudit')?.addEventListener('click', async () => {
    const ok = (typeof Popup !== 'undefined')
      ? await Popup.confirm({ title: 'Clear activity history?', message: "This only affects your own account's log.", confirmText: 'Clear', danger: true })
      : confirm('Clear your activity history? This only affects your own account\'s log.');
    if (ok) { AuditLog.clear(); render(); App.toast('Audit log cleared.'); }
  });
  render();
  // Render again so the page-view event is immediately visible.
  render();
});
