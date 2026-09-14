/* ============================================================
   Receiptly — app.js
   Shared shell (sidebar/topbar), toasts, modals, formatting
   helpers, and the auth guard used by every internal page.
   ============================================================ */

const App = {

  /* ---------- sanitization ---------- */
  escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /* ---------- formatting ---------- */
  currencySymbol() {
    var raw = DB.getProfile().currency;
    // Currency.getSymbol resolves a currency CODE (e.g. "NGN") to
    // its symbol; it passes through anything else unchanged, so
    // accounts that still have the old free-text symbol saved
    // keep working exactly as before.
    if (typeof Currency !== 'undefined' && Currency.getSymbol) {
      return Currency.getSymbol(raw);
    }
    return raw || '₦';
  },
  money(n) {
    const num = Number(n) || 0;
    return this.currencySymbol() + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
  },
  formatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  /* ---------- auth guard ---------- */
  requireAuth() {
    const session = DB.getSession();
    if (!session) {
      const depth = location.pathname.includes('/pages/') ? '../' : '';
      window.location.href = depth + 'login.html';
      return null;
    }
    // Defense in depth: user-scope.js already redirects a suspended
    // account immediately on load, but any page that calls App.initPage
    // gets this checked here too, in case it's ever loaded without
    // user-scope.js's own guard running first.
    if (typeof Scope !== 'undefined' && Scope.isSuspended && Scope.isSuspended()) {
      DB.clearSession();
      const depth = location.pathname.includes('/pages/') ? '../' : '';
      window.location.href = depth + 'login.html?suspended=1';
      return null;
    }
    return session;
  },

  logout() {
    DB.clearSession();
    const depth = location.pathname.includes('/pages/') ? '../' : '';
    window.location.href = depth + 'login.html';
  },

  /* ---------- toasts ---------- */
  toast(message, type = 'success', duration = 3200) {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span class="toast__icon">${icons[type] || icons.info}</span><span class="toast__msg"></span>`;
    el.querySelector('.toast__msg').textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 250);
    }, duration);
  },

  /* ---------- confirm modal ---------- */
  confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = true } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <h3 class="modal__title">${this.escapeHTML(title)}</h3>
          <p class="modal__msg">${this.escapeHTML(message)}</p>
          <div class="modal__actions">
            <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
            <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-action="ok">${this.escapeHTML(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('is-visible'));
      const close = (result) => {
        overlay.classList.remove('is-visible');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
        const action = e.target.closest('[data-action]');
        if (action) close(action.dataset.action === 'ok');
      });
    });
  },

  /* ---------- sidebar shell ---------- */
  navItems: [
    { href: 'dashboard.html', icon: 'grid', label: 'Dashboard' },
    { href: 'create-receipt.html', icon: 'plus-square', label: 'Create Receipt' },
    { href: 'receipts.html', icon: 'file-text', label: 'Receipts' },
    { href: 'verify-receipt.html', icon: 'shield-check', label: 'Verify Receipt' },
    { href: 'customers.html', icon: 'users', label: 'Customers' },
    { href: 'expenses.html', icon: 'wallet', label: 'Expenses' },
    { href: 'analytics.html', icon: 'bar-chart', label: 'Analytics' },
    { href: 'payments.html', icon: 'credit-card', label: 'Payments' },
    { href: 'reports.html', icon: 'file-chart', label: 'Reports' },
    { href: 'audit-log.html', icon: 'history', label: 'Audit Log' },
    { href: 'settings.html', icon: 'settings', label: 'Settings' }
  ],

  icon(name) {
    const icons = {
      grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
      'plus-square': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
      'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
      'shield-check': '<path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5z"/><path d="m9 12 2 2 4-4"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h3v-4z"/>',
      'bar-chart': '<path d="M12 20V10M18 20V4M6 20v-4"/>',
      'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
      'file-chart': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 17v-4M12 17v-7M16 17v-2"/>',
      layout: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' ,
      history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6M12 7v5l3 2"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
      menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
  },

  buildShell(activeHref, pageTitle) {
    // Guard: some pages already render their own static sidebar/topbar
    // markup, but still load a shared script (e.g. audit-log.js) that
    // calls App.initPage()/buildShell() independently. Without this check
    // that second call injects a duplicate, unstyled sidebar into the page.
    if (document.getElementById('sidebar')) return;

    const profile = DB.getProfile();
    const session = DB.getSession();
    const businessName = profile.businessName || 'Your Business';
    const initials = (businessName || 'R').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    sidebar.innerHTML = `
      <div class="sidebar__brand">
        <a href="../index.html" class="brand">
          <span class="brand__mark">R</span>
          <span class="brand__name">Receiptly</span>
        </a>
        <button class="sidebar__close" id="sidebarClose" aria-label="Close menu">${this.icon('menu')}</button>
      </div>
      <nav class="sidebar__nav">
        ${this.navItems.map(item => `
          <a href="${item.href}" class="sidebar__link ${item.href === activeHref ? 'is-active' : ''}">
            ${this.icon(item.icon)}
            <span>${item.label}</span>
          </a>`).join('')}
      </nav>
      <div class="sidebar__footer">
        <a href="settings.html" class="sidebar__profile">
          <span class="avatar">${this.escapeHTML(initials || 'R')}</span>
          <span class="sidebar__profile-info">
            <strong>${this.escapeHTML(businessName)}</strong>
            <small>${this.escapeHTML(session ? session.email : '')}</small>
          </span>
        </a>
        <button class="sidebar__logout" id="logoutBtn">${this.icon('logout')}<span>Log out</span></button>
      </div>`;

    const topbar = document.createElement('header');
    topbar.className = 'topbar';
    topbar.innerHTML = `
      <button class="topbar__menu" id="menuToggle" aria-label="Open menu">${this.icon('menu')}</button>
      <h1 class="topbar__title">${this.escapeHTML(pageTitle)}</h1>
      <div class="topbar__actions">
        <button class="icon-btn" id="themeToggle" aria-label="Toggle dark mode">${this.icon('moon')}</button>
        <a href="create-receipt.html" class="btn btn--primary btn--sm">${this.icon('plus-square')}<span>New Receipt</span></a>
      </div>`;

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.id = 'sidebarBackdrop';

    const layout = document.getElementById('appLayout');
    document.body.prepend(backdrop);
    document.body.prepend(sidebar);
    layout.prepend(topbar);

    document.getElementById('menuToggle').addEventListener('click', () => this.toggleSidebar(true));
    document.getElementById('sidebarClose').addEventListener('click', () => this.toggleSidebar(false));
    backdrop.addEventListener('click', () => this.toggleSidebar(false));
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      if (await this.confirm({ title: 'Log out?', message: 'You will need to sign in again to access Receiptly.', confirmText: 'Log out' })) {
        this.logout();
      }
    });
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
  },

  toggleSidebar(open) {
    document.getElementById('sidebar').classList.toggle('is-open', open);
    document.getElementById('sidebarBackdrop').classList.toggle('is-visible', open);
  },

  /* ---------- theme ---------- */
  initTheme() {
    const settings = DB.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'light');
  },
  toggleTheme() {
    const settings = DB.getSettings();
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    settings.theme = next;
    DB.saveSettings(settings);
    document.documentElement.setAttribute('data-theme', next);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = this.icon(next === 'dark' ? 'sun' : 'moon');
  },

  /* ---------- page init for internal pages ---------- */
  initPage(activeHref, pageTitle) {
    this.initTheme();
    const session = this.requireAuth();
    if (!session) return null;
    this.buildShell(activeHref, pageTitle);
    if (typeof AuditLog !== 'undefined') AuditLog.pageView(pageTitle);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = this.icon(DB.getSettings().theme === 'dark' ? 'sun' : 'moon');
    return session;
  }
};
