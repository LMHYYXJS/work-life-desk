// 通用组件：返回 HTML 字符串的纯函数 + 少量 DOM 交互（toast / 确认层 / 抽屉）

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 安全取 DOM（Node 测试环境没有 document） */
export function dom(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

export function tag(label, cls = '') {
  return `<span class="tag ${cls}">${esc(label)}</span>`;
}

export function card({ title = '', sub = '', actions = '', body = '', cls = '', id = '' }) {
  return `
    <section class="card ${cls}" ${id ? `id="${esc(id)}"` : ''}>
      ${title || actions ? `
      <header class="card-head">
        <div class="card-title">${title}</div>
        ${sub ? `<span class="card-sub">${esc(sub)}</span>` : ''}
        ${actions ? `<div class="card-actions">${actions}</div>` : ''}
      </header>` : ''}
      <div class="card-body">${body}</div>
    </section>`;
}

export function empty(text, actionLabel = '', actionKey = '', actionPayload = '') {
  return `
    <div class="empty">
      <span>${esc(text)}</span>
      ${actionLabel ? `<button class="btn small" data-action="${esc(actionKey)}" data-payload="${esc(actionPayload)}">${esc(actionLabel)}</button>` : ''}
    </div>`;
}

export function progress(pct, warm = false) {
  const value = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `<div class="bar ${warm ? 'warm' : ''}"><i style="width:${value}%"></i></div>`;
}

export function stat(value, label, suffix = '') {
  return `<div class="stat"><span class="stat-value">${esc(value)}${suffix ? `<small>${esc(suffix)}</small>` : ''}</span><span class="stat-label">${esc(label)}</span></div>`;
}

export function dots(count, total) {
  const items = [];
  for (let i = 0; i < total; i += 1) items.push(`<i class="${i < count ? 'on' : ''}"></i>`);
  return `<div class="dots">${items.join('')}</div>`;
}

export function spinnerRow(text = '加载中…') {
  return `<div class="empty"><span>${esc(text)}</span></div>`;
}

// ---------- DOM 部分 ----------
let toastTimer = null;

export function toast(message, { actionLabel = '', onAction = null, duration = 3000 } = {}) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.hidden = false;
  node.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button class="btn small" data-toast-action>${esc(actionLabel)}</button>` : ''}`;
  const handler = (event) => {
    if (event.target.closest('[data-toast-action]') && onAction) onAction();
    node.hidden = true;
    node.removeEventListener('click', handler);
  };
  node.addEventListener('click', handler);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, duration);
}

export function confirmDialog({ title, text, confirmLabel = '确认', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
        <div class="modal-actions">
          <button class="btn" data-modal-cancel>取消</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-modal-ok>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const close = (value) => {
      mask.remove();
      resolve(value);
    };
    mask.addEventListener('click', (event) => {
      if (event.target === mask) close(false);
      if (event.target.closest('[data-modal-cancel]')) close(false);
      if (event.target.closest('[data-modal-ok]')) close(true);
    });
    root.appendChild(mask);
    setTimeout(() => mask.querySelector('[data-modal-ok]')?.focus(), 30);
  });
}

/** 需要手动键入确认词的二次确认，用于清空类危险操作 */
export function confirmTyped({ title, text, word = '确认删除', confirmLabel = '确认', danger = true }) {
  return new Promise((resolve) => {
    const root = dom('modal-root');
    if (!root) { resolve(false); return; }
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
        <p class="faint">请输入「${esc(word)}」四个字确认</p>
        <input class="input" id="typed-confirm-input" placeholder="${esc(word)}" autocomplete="off">
        <div class="modal-actions">
          <button class="btn" data-modal-cancel>取消</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-modal-ok>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const close = (value) => {
      mask.remove();
      resolve(value);
    };
    const input = mask.querySelector('#typed-confirm-input');
    const okButton = mask.querySelector('[data-modal-ok]');
    okButton.disabled = true;
    input.addEventListener('input', () => {
      okButton.disabled = input.value.trim() !== word;
    });
    mask.addEventListener('click', (event) => {
      if (event.target === mask) close(false);
      if (event.target.closest('[data-modal-cancel]')) close(false);
      if (event.target.closest('[data-modal-ok]') && !okButton.disabled) close(true);
    });
    root.appendChild(mask);
    setTimeout(() => input.focus(), 30);
  });
}

let drawerNode = null;
export function openDrawer(html) {
  closeDrawer();
  const root = dom('modal-root');
  if (!root || typeof document === 'undefined' || !document.createElement) return null;
  const mask = document.createElement('div');
  mask.className = 'drawer-mask';
  mask.innerHTML = `<aside class="drawer"><div class="drawer-body">${html}</div></aside>`;
  mask.addEventListener('click', (event) => {
    if (event.target === mask) closeDrawer();
  });
  root.appendChild(mask);
  drawerNode = mask;
  return mask;
}

export function closeDrawer() {
  if (drawerNode) {
    drawerNode.remove();
    drawerNode = null;
  }
}
