// 侧栏导航：生成 HTML 与同步当前页状态（纯逻辑 + 少量 DOM）

import { esc } from './ui.js';

/** 生成导航按钮。active 负责首屏状态，后续由 syncNav 接管。 */
export function navHtml(pages, current = 'home') {
  return pages.map((page, index) => {
    const active = page.meta.id === current;
    return `
      <button class="nav-item${active ? ' active' : ''}" data-page="${esc(page.meta.id)}" data-nav-key="${index + 1}"
        title="${esc(page.meta.title)}"${active ? ' aria-current="page"' : ''}>
        <span class="nav-icon">${page.meta.icon}</span>
        <span class="nav-label">${esc(page.meta.title)}</span>
        <span class="nav-key">${index + 1}</span>
      </button>`;
  }).join('');
}

/**
 * 只让当前页保留 active / aria-current。
 * 数字键或程序切页后，旧按钮可能仍有键盘焦点，必须主动 blur，
 * 否则它的 :focus-visible 蓝色描边会残留，看起来像还选中着。
 */
export function syncNav(root, current, badges = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const items = Array.from(root.querySelectorAll('.nav-item'));
  items.forEach((item) => {
    const id = item.dataset ? item.dataset.page : '';
    const active = id === current;
    item.classList.toggle('active', active);
    if (typeof item.setAttribute === 'function') {
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    if (!active && typeof document !== 'undefined' && document.activeElement === item && typeof item.blur === 'function') {
      item.blur();
    }
    const old = typeof item.querySelector === 'function' ? item.querySelector('.nav-badge') : null;
    if (old) old.remove();
    if (badges[id]) {
      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = badges[id];
      item.appendChild(badge);
    }
  });
  return items;
}
