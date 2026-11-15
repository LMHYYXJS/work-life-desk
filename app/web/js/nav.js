// 侧栏导航：分组结构、HTML 生成与当前页状态同步

import { esc } from './ui.js';

export const GLOBAL_TOP = ['home', 'tasks'];
export const GLOBAL_BOTTOM = ['settings'];
export const NAV_GROUPS = [
  { key: 'work', title: '工作', ids: ['media', 'dev', 'consult'] },
  { key: 'life', title: '日常生活', ids: ['fitness', 'diet', 'games'] },
];

function navItem(page, index) {
  return { page, number: index + 1 };
}

/**
 * 把页面排成「全局入口 → 工作组 → 日常生活组 → 全局入口」。
 * 数字键仍按 pages 原始顺序编号，视觉分组不改变 1–9 的快捷键。
 */
export function navLayout(pages) {
  const indexed = new Map(pages.map((page, index) => [page.meta.id, navItem(page, index)]));
  const used = new Set();

  const take = (ids) => ids
    .map((id) => {
      const item = indexed.get(id);
      if (item) used.add(id);
      return item;
    })
    .filter(Boolean);

  const globalTop = take(GLOBAL_TOP);
  const groups = NAV_GROUPS
    .map((group) => ({ ...group, items: take(group.ids) }))
    .filter((group) => group.items.length);
  const globalBottom = take(GLOBAL_BOTTOM);

  // 以后新增页面若忘了归类，放进「其他」，不会从侧栏消失
  const rest = pages
    .filter((page) => !used.has(page.meta.id))
    .map((page) => navItem(page, pages.indexOf(page)));
  if (rest.length) groups.push({ key: 'other', title: '其他', items: rest });

  return { globalTop, groups, globalBottom };
}

function buttonHtml(item, current) {
  const { page, number } = item;
  const active = page.meta.id === current;
  return `
    <button class="nav-item${active ? ' active' : ''}" data-page="${esc(page.meta.id)}" data-nav-key="${number}"
      title="${esc(page.meta.title)}"${active ? ' aria-current="page"' : ''}>
      <span class="nav-icon">${page.meta.icon}</span>
      <span class="nav-label">${esc(page.meta.title)}</span>
      <span class="nav-key">${number}</span>
    </button>`;
}

/** 生成导航 HTML。active 负责首屏状态，后续由 syncNav 接管。 */
export function navHtml(pages, current = 'home') {
  const layout = navLayout(pages);
  return [
    layout.globalTop.map((item) => buttonHtml(item, current)).join(''),
    layout.groups.map((group) => `
      <div class="nav-group" data-nav-group="${esc(group.key)}">
        <div class="nav-group-title">${esc(group.title)}</div>
        ${group.items.map((item) => buttonHtml(item, current)).join('')}
      </div>`).join(''),
    '<div class="nav-spacer"></div>',
    layout.globalBottom.map((item) => buttonHtml(item, current)).join(''),
  ].filter(Boolean).join('');
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
