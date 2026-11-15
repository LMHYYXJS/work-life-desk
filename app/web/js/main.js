// 应用入口：加载数据、渲染当前页、全局事件与快捷键

import { api } from './api.js';
import { formatCn, getByPath, setByPath, todayStr } from './schema.js';
import { isUpdateDue, followUps } from './logic.js';
import { pageById, pages } from './pages/index.js';
import { navHtml, syncNav } from './nav.js';
import { router } from './router.js';
import { Store } from './store.js';
import { closeDrawer, confirmDialog, confirmTyped, esc, toast } from './ui.js';
import { guardNavigation, shouldBlockUnload } from './drafts.js';

const store = new Store();
const view = document.getElementById('view');

const ctx = {
  get state() { return store.doc; },
  get settings() { return store.doc?.settings || {}; },
  store,
  mutate: (fn, opts) => store.mutate(fn, opts),
  replaceDoc: (doc) => store.replaceDoc(doc),
  saveNow: () => store.saveNow(),
  undo: () => store.undo(),
  today: () => todayStr(),
  navigate: (id, opts) => guardedGo(id, opts),
  toast,
  confirm: confirmDialog,
  confirmTyped,
  refresh: () => render(),
  highlight: (id) => highlight(id),
  api,
};

let navigationPending = false;

async function guardedGo(id, opts = {}) {
  if (navigationPending) return false;
  navigationPending = true;
  try {
    return await guardNavigation({
      target: id,
      current: router.current,
      go: (target) => router.go(target, opts),
      mediaPage: pageById('media'),
      devPage: pageById('dev'),
      confirm: confirmDialog,
    });
  } finally {
    navigationPending = false;
  }
}

// ---------- 侧栏 ----------
function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = navHtml(pages, router.current);
}

function navBadges() {
  if (!store.doc) return {};
  const badges = {};
  const overdue = followUps(store.doc.consult.leads, todayStr()).filter((lead) => lead.overdue).length;
  if (overdue) badges.consult = overdue;
  if (isUpdateDue(store.doc.media.nextUpdateAt, todayStr())) badges.media = '!';
  return badges;
}

function updateNav() {
  syncNav(document, router.current, navBadges());
}

// ---------- 渲染 ----------
function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.dataset || !el.dataset.focusKey) return null;
  let start = null;
  let end = null;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch (error) {
    /* 数字输入无 selectionStart */
  }
  return { key: el.dataset.focusKey, start, end };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const el = document.querySelector(`[data-focus-key="${snapshot.key}"]`);
  if (!el) return;
  el.focus();
  if (snapshot.start != null && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(snapshot.start, snapshot.end); } catch (error) { /* ignore */ }
  }
}

function applyAppearance() {
  const settings = (store.doc && store.doc.settings) || {};
  const html = document.documentElement;
  html.classList.toggle('theme-light', settings.theme === 'light');
  html.classList.toggle('theme-dark', settings.theme !== 'light');
  html.classList.remove('fs-small', 'fs-normal', 'fs-large');
  html.classList.add(`fs-${settings.fontSize || 'normal'}`);
}

function updateChrome() {
  const page = pageById(router.current);
  document.getElementById('page-title').textContent = page.meta.title;
  document.getElementById('today-label').textContent = formatCn(todayStr());
  const undoBtn = document.getElementById('undo-btn');
  undoBtn.hidden = !store.canUndo();
  const saveStatus = document.getElementById('save-status');
  const dot = document.getElementById('save-dot');
  dot.className = 'save-dot';
  if (store.status === 'saving') {
    saveStatus.textContent = '保存中…';
    dot.classList.add('busy');
  } else if (store.status === 'conflict') {
    saveStatus.textContent = '保存冲突';
    dot.classList.add('err');
  } else if (store.status === 'error') {
    saveStatus.textContent = '保存失败';
    dot.classList.add('err');
  } else if (store.status === 'saved') {
    const time = store.lastSavedAt ? new Date(store.lastSavedAt) : null;
    const label = time && !Number.isNaN(time.getTime())
      ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
      : '—';
    saveStatus.textContent = `已保存 ${label}`;
    dot.classList.add('ok');
  } else {
    saveStatus.textContent = '加载中…';
  }
  updateNav();
  renderBanner();
}

function renderBanner() {
  const wrap = document.getElementById('banner');
  const parts = [];
  if (store.warning) {
    parts.push(`<div class="banner warn"><span class="grow">⚠ ${esc(store.warning)}</span><button class="btn small" data-action="dismiss-warning">知道了</button></div>`);
  }
  if (store.status === 'conflict') {
    parts.push(`<div class="banner danger"><span class="grow">另一个标签页也改了数据，这次改动还没保存。</span>
      <button class="btn small" data-action="force-save">用我这边的覆盖</button>
      <button class="btn small" data-action="reload-server">取最新，放弃改动</button></div>`);
  }
  if (store.status === 'error') {
    parts.push(`<div class="banner danger"><span class="grow">保存失败：${esc(store.errorMessage || '未知原因')}</span><button class="btn small" data-action="retry-save">重试</button></div>`);
  }
  wrap.innerHTML = parts.join('');
}

function render() {
  if (!store.doc) {
    view.innerHTML = '<div class="view-inner"><div class="card"><div class="empty"><span>正在加载数据…</span></div></div></div>';
    return;
  }
  applyAppearance();
  const focus = captureFocus();
  const page = pageById(router.current);
  let html = '';
  try {
    html = page.render(ctx);
  } catch (error) {
    console.error(error);
    html = `<section class="card"><div class="empty"><span>这个页面出错了：${esc(error.message)}</span></div></section>`;
  }
  view.innerHTML = `<div class="view-inner">${html}</div>`;
  if (router.pendingDraftRestore) {
    router.applyDrafts(router.current);
    router.pendingDraftRestore = false;
  }
  restoreFocus(focus);
  if (!focus) {
    const auto = view.querySelector('[data-autofocus="1"]');
    if (auto) auto.focus();
  }
  updateChrome();
}

function highlight(id) {
  if (!id) return;
  const node = view.querySelector(`[data-item-id="${id}"]`);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  node.classList.add('hl');
  setTimeout(() => node.classList.remove('hl'), 1600);
}

// ---------- 事件 ----------
let draggingIdeaId = null;
let suppressClickUntil = 0;

function clearDragState() {
  draggingIdeaId = null;
  document.querySelectorAll('.kcol.drag-over').forEach((node) => node.classList.remove('drag-over'));
  document.querySelectorAll('.kcard.dragging').forEach((node) => node.classList.remove('dragging'));
}

function beforeCardId(card, clientY) {
  if (!card || !card.getBoundingClientRect) return null;
  const rect = card.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  if (!after) return card.dataset.itemId || null;
  const next = card.nextElementSibling;
  return next && next.classList && next.classList.contains('kcard') ? (next.dataset.itemId || null) : null;
}

document.addEventListener('dragstart', (event) => {
  const card = event.target.closest ? event.target.closest('.kcard[draggable="true"]') : null;
  if (!card) return;
  draggingIdeaId = card.dataset.itemId;
  card.classList.add('dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', draggingIdeaId); } catch (error) { /* 某些浏览器限制 */ }
  }
});

document.addEventListener('dragover', (event) => {
  if (!draggingIdeaId) return;
  const col = event.target.closest ? event.target.closest('.kcol') : null;
  if (!col) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.kcol.drag-over').forEach((node) => { if (node !== col) node.classList.remove('drag-over'); });
  col.classList.add('drag-over');
});

document.addEventListener('dragleave', (event) => {
  const col = event.target.closest ? event.target.closest('.kcol') : null;
  if (!col) return;
  if (event.relatedTarget && col.contains(event.relatedTarget)) return;
  col.classList.remove('drag-over');
});

document.addEventListener('drop', (event) => {
  if (!draggingIdeaId) return;
  const col = event.target.closest ? event.target.closest('.kcol') : null;
  if (!col) return;
  event.preventDefault();
  const stage = col.dataset.stage;
  const card = event.target.closest ? event.target.closest('.kcard[data-item-id]') : null;
  if (card && card.dataset.itemId === draggingIdeaId) { clearDragState(); return; }
  const beforeId = card ? beforeCardId(card, event.clientY) : null;
  pageById('media').handle('move-idea', { dataset: { id: draggingIdeaId } }, ctx, JSON.stringify({ stage, beforeId }));
  clearDragState();
  suppressClickUntil = Date.now() + 160;
});

document.addEventListener('dragend', () => {
  suppressClickUntil = Date.now() + 160;
  clearDragState();
});

function commitField(el) {
  const path = el.dataset.bind;
  if (!path) return;
  let value = el.value;
  if (el.dataset.type === 'number') {
    value = value === '' ? null : Number(value);
    if (value != null && Number.isNaN(value)) value = null;
  }
  if (el.dataset.type === 'bool') value = el.checked;
  const current = getByPath(store.doc, path);
  if (current === value) return;
  store.mutate((doc) => setByPath(doc, path, value));
}

document.addEventListener('click', async (event) => {
  if (Date.now() < suppressClickUntil) return;
  const navItem = event.target.closest('[data-page]');
  if (navItem) {
    const focusId = navItem.dataset.focusId;
    await guardedGo(navItem.dataset.page);
    if (focusId) setTimeout(() => highlight(focusId), 80);
    return;
  }
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const payload = actionEl.dataset.payload || '';

  const globalActions = {
    'toggle-sidebar': () => {
      document.getElementById('app').classList.toggle('sidebar-collapsed');
    },
    undo: () => {
      if (store.undo()) toast('已撤销');
    },
    'retry-save': () => { store.dirty = true; store.saveNow(); },
    'force-save': () => store.forceSave(),
    'reload-server': () => store.reloadFromServer(),
    'dismiss-warning': () => { store.warning = null; renderBanner(); },
    new: () => {
      const page = pageById(router.current);
      if (!page.handle || !page.handle('new', actionEl, ctx)) {
        toast('这个页面还没有「新建」操作');
      }
    },
  };
  if (globalActions[action]) {
    globalActions[action]();
    return;
  }
  const page = pageById(router.current);
  if (page.handle && page.handle(action, actionEl, ctx, payload)) {
    return;
  }
  // 其他页面的 action（例如从首页摘要卡跳到别的页）
  for (const other of pages) {
    if (other !== page && other.handle && other.handle(action, actionEl, ctx, payload)) return;
  }
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-bind]');
  if (el) {
    commitField(el);
    render();
    return;
  }
  const changeEl = event.target.closest('[data-change-action]');
  if (changeEl) {
    const page = pageById(router.current);
    if (page.handle && page.handle(changeEl.dataset.changeAction, changeEl, ctx, changeEl.value)) {
      render();
    }
  }
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!target) return;
  if (router.current === 'media' && target.dataset?.snapField) {
    pageById('media').handle('snap-draft', target, ctx, target.value);
    return;
  }
  if (router.current === 'dev' && target.dataset?.changeAction === 'ms-field') {
    pageById('dev').handle('ms-field', target, ctx, target.value);
  }
});

document.addEventListener('keydown', (event) => {
  const tag = (event.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable;

  if (event.key === 'Escape') {
    closeDrawer();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    store.saveNow();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    document.getElementById('app').classList.toggle('sidebar-collapsed');
    return;
  }
  if (typing) {
    if (event.key === 'Enter' && event.target.dataset.enter === '1') {
      event.preventDefault();
      const action = event.target.dataset.enterAction;
      if (action) {
        const page = pageById(router.current);
        if (page.handle && page.handle(action, event.target, ctx, event.target.value)) {
          // 页面自己处理
        }
      }
    }
    return;
  }
  if (event.key >= '1' && event.key <= '9') {
    const page = pages[Number(event.key) - 1];
    if (page) guardedGo(page.meta.id);
    return;
  }
  if (event.key.toLowerCase() === 'n') {
    const page = pageById(router.current);
    if (!page.handle || !page.handle('new', null, ctx)) toast('这个页面还没有「新建」操作');
  }
});

// ---------- 启动 ----------
router.onPage(() => {
  render();
  router.restoreScroll();
});

async function boot() {
  buildNav();
  const ok = await store.load();
  if (!ok) {
    view.innerHTML = `<div class="view-inner"><div class="card"><div class="empty">
      <span>连不上本地服务：请双击「启动.bat」，再刷新本页</span>
      <button class="btn small" data-action="retry-save">重试连接</button>
    </div></div></div>`;
    return;
  }
  store.subscribe(() => render());

  if (store.doc.settings.carryOverYesterday) {
    const { added } = (await import('./logic.js')).carryOver(store.doc.tasks, todayStr());
    if (added.length) {
      store.mutate((doc) => { doc.tasks = doc.tasks.concat(added); });
      toast(`昨天 ${added.length} 件没做完，已带到今天`);
    }
  }

  router.current = 'home';
  render();
}

window.addEventListener('beforeunload', (event) => {
  if (store.dirty) store.saveNow();
  if (shouldBlockUnload(pageById('media'), pageById('dev'))) {
    event.preventDefault();
    event.returnValue = '';
  }
});

window.WLD = { store, router, ctx };

boot();
