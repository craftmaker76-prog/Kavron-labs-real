// Admin panel (CSP-safe: external file only, addEventListener wiring).
// The server is the real gate: every admin route checks the admin role.
// This page only decides what to SHOW.
let csrfToken = '';
let pollTimer = null;

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showMsg(text, isError) {
  const m = el('pageMsg');
  m.textContent = text;
  m.classList.toggle('error', !!isError);
  m.hidden = false;
}
function hideMsg() { el('pageMsg').hidden = true; }
async function api(path, opts) {
  const r = await fetch(path, { credentials: 'same-origin', ...(opts || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function csrfHeaders() {
  return { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
}

async function refreshAuth() {
  try {
    const me = await api('/api/auth/me');
    if (me.role !== 'admin') {
      el('loginGate').hidden = false;
      el('toolUI').hidden = true;
      el('whoamiLine').hidden = true;
      el('logoutBtn').hidden = true;
      el('loginMsg').textContent = 'This panel needs an admin account.';
      el('loginMsg').hidden = false;
      stopPolling();
      return false;
    }
    csrfToken = me.csrfToken || '';
    el('whoamiLine').textContent = 'Logged in as ' + me.email + ' (admin)';
    el('whoamiLine').hidden = false;
    el('logoutBtn').hidden = false;
    el('loginGate').hidden = true;
    el('toolUI').hidden = false;
    return true;
  } catch (e) {
    el('loginGate').hidden = false;
    el('toolUI').hidden = true;
    return false;
  }
}

function renderProviders(providers) {
  const box = el('providerCards');
  box.innerHTML = '';
  providers.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'pcard';
    card.id = 'provider-' + p.id;
    const limitLine = p.dailyLimit
      ? `<div class="meta">Today: ${p.today} / ${p.dailyLimit} (${p.limitPeriod})</div><div class="bar"><div class="w-${Math.min(100, Math.round((p.today / p.dailyLimit) * 10) * 10)}"></div></div>`
      : `<div class="meta">Today: ${p.today} questions${p.limitNote ? ' — ' + esc(p.limitNote) : ''}</div>`;
    const keyLine = p.keySource === 'panel'
      ? `Key: saved in panel (${esc(p.keyHint || '')})`
      : p.keySource === 'env' ? 'Key: from Vercel env' : 'Key: not set';
    const fieldsHtml = p.keyFields.map((f) => `<label>${esc(f.label)} <input type="text" data-field="${esc(f.name)}" placeholder="${esc(f.label)}"></label>`).join('');
    card.innerHTML =
      `<h3>${esc(p.name)}${p.wired ? '<span class="pill pill-wired">In race</span>' : '<span class="pill pill-soon">Coming to race</span>'}${p.enabled ? '' : '<span class="pill pill-off">OFF</span>'}</h3>` +
      `<div class="meta">${keyLine}</div>` +
      limitLine +
      `<div class="meta">This month: ${p.monthTokens} tokens</div>` +
      `<div class="row"><label><input type="checkbox" class="toggle" ${p.enabled ? 'checked' : ''}> Enabled</label></div>` +
      `<div class="keyform">${fieldsHtml}<div class="row"><button class="btn btn-primary save-key">Save key</button>${p.keySource === 'panel' ? '<button class="btn btn-danger delete-key">Delete key</button>' : ''}</div></div>`;
    card.querySelector('.toggle').addEventListener('change', async (ev) => {
      try {
        hideMsg();
        await api('/api/admin/providers/' + p.id + '/toggle', { method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ enabled: ev.target.checked }) });
        showMsg(p.name + (ev.target.checked ? ' is ON.' : ' is OFF. The chain will skip it.'));
        loadProviders();
      } catch (e) { showMsg(e.message, true); ev.target.checked = !ev.target.checked; }
    });
    card.querySelector('.save-key').addEventListener('click', async () => {
      try {
        hideMsg();
        const inputs = card.querySelectorAll('.keyform input[type="text"]');
        let body;
        if (p.keyFields.length > 1) {
          const fields = {};
          inputs.forEach((inp) => { fields[inp.dataset.field] = inp.value.trim(); });
          body = { fields };
        } else {
          body = { key: inputs[0].value.trim() };
        }
        await api('/api/admin/providers/' + p.id + '/key', { method: 'POST', headers: csrfHeaders(), body: JSON.stringify(body) });
        showMsg(p.name + ' key saved. It is live now.');
        inputs.forEach((inp) => { inp.value = ''; });
        loadProviders();
      } catch (e) { showMsg(e.message, true); }
    });
    const del = card.querySelector('.delete-key');
    if (del) del.addEventListener('click', async () => {
      try {
        hideMsg();
        await api('/api/admin/providers/' + p.id + '/key', { method: 'DELETE', headers: csrfHeaders() });
        showMsg(p.name + ' key deleted.');
        loadProviders();
      } catch (e) { showMsg(e.message, true); }
    });
    box.appendChild(card);
  });
}

async function loadProviders() {
  try {
    const data = await api('/api/admin/providers');
    renderProviders(data.providers || []);
  } catch (e) { showMsg(e.message, true); }
}

function renderNotifications(items, unread) {
  const badge = el('bellBadge');
  badge.textContent = unread;
  badge.hidden = !unread;
  el('notifUnread').textContent = unread ? unread + ' unread' : '';
  el('notifUnread').hidden = !unread;
  const box = el('notifList');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<p class="hint">No notifications. All quiet.</p>';
    return;
  }
  items.forEach((n) => {
    const div = document.createElement('div');
    div.className = 'notif' + (n.is_read ? '' : ' unread');
    div.innerHTML =
      `<strong>${esc(n.title)}</strong><div class="t">${esc(n.created_at)}${n.provider ? ' — ' + esc(n.provider) : ''}</div>` +
      `<div>${esc(n.message)}</div>` +
      `<div class="row">${n.action ? '<button class="btn goto-provider">View provider</button>' : ''}${n.is_read ? '' : '<button class="btn mark-read">Mark as read</button>'}</div>`;
    const goto = div.querySelector('.goto-provider');
    if (goto) goto.addEventListener('click', () => {
      showSection('providersSec');
      const card = document.getElementById('provider-' + n.action);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!n.is_read) markOneRead(n.id);
    });
    const mr = div.querySelector('.mark-read');
    if (mr) mr.addEventListener('click', async () => { await markOneRead(n.id); loadNotifications(); });
    box.appendChild(div);
  });
}

async function markOneRead(id) {
  try { await api('/api/admin/notifications/' + id + '/read', { method: 'POST', headers: csrfHeaders() }); } catch (e) { /* bell refreshes anyway */ }
}

async function loadNotifications() {
  try {
    const data = await api('/api/admin/notifications');
    renderNotifications(data.notifications || [], data.unread || 0);
  } catch (e) { /* keep old list on transient failure */ }
}

async function loadAudit() {
  try {
    const data = await api('/api/admin/audit');
    const box = el('auditList');
    box.innerHTML = '';
    (data.audit || []).forEach((a) => {
      const div = document.createElement('div');
      div.className = 'audit-row';
      div.textContent = a.created_at + ' — ' + a.action + (a.detail ? ' — ' + a.detail : '');
      box.appendChild(div);
    });
    if (!data.audit || !data.audit.length) box.innerHTML = '<p class="hint">No admin actions yet.</p>';
  } catch (e) { showMsg(e.message, true); }
}

function showSection(id) {
  document.querySelectorAll('.section').forEach((s) => { s.hidden = s.id !== id; });
  document.querySelectorAll('.nav-btn').forEach((b) => { b.classList.toggle('active', b.dataset.section === id); });
  if (id === 'notificationsSec') loadNotifications();
  if (id === 'auditSec') loadAudit();
  if (id === 'providersSec') loadProviders();
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(loadNotifications, 60000);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => showSection(b.dataset.section));
});
el('loginBtn').addEventListener('click', async () => {
  try {
    const email = el('loginEmail').value.trim();
    const password = el('loginPass').value;
    await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    el('loginPass').value = '';
    if (await refreshAuth()) {
      loadProviders();
      loadNotifications();
      startPolling();
    }
  } catch (e) {
    const m = el('loginMsg');
    m.textContent = e.message;
    m.hidden = false;
  }
});
el('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', headers: csrfHeaders() }); } catch (e) {}
  csrfToken = '';
  stopPolling();
  await refreshAuth();
});
el('markAllReadBtn').addEventListener('click', async () => {
  try {
    await api('/api/admin/notifications/read-all', { method: 'POST', headers: csrfHeaders() });
    loadNotifications();
  } catch (e) { showMsg(e.message, true); }
});

(async () => {
  if (await refreshAuth()) {
    loadProviders();
    loadNotifications();
    startPolling();
  }
})();
