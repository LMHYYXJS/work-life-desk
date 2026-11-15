// P5：导航状态同步——边框只跟当前页，旧焦点必须释放，Tab 仍可访问
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const { navHtml, syncNav } = await load('nav.js');
const { pages } = await load('pages/index.js');

class FakeClassList {
  constructor() { this.set = new Set(); }
  toggle(name, force) {
    const want = force === undefined ? !this.set.has(name) : !!force;
    if (want) this.set.add(name); else this.set.delete(name);
    return want;
  }
  contains(name) { return this.set.has(name); }
}

class FakeNavItem {
  constructor(id) {
    this.dataset = { page: id };
    this.classList = new FakeClassList();
    this.attrs = {};
    this.blurred = false;
    this.children = [];
  }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  querySelector() { return null; }
  appendChild(child) { this.children.push(child); return child; }
  blur() { this.blurred = true; }
}

function makeRoot(items) {
  return { querySelectorAll: () => items };
}

test('切页后只有当前项 active，旧焦点被释放', () => {
  const media = new FakeNavItem('media');
  const dev = new FakeNavItem('dev');
  const settings = new FakeNavItem('settings');
  const root = makeRoot([media, dev, settings]);
  const previousDocument = globalThis.document;
  globalThis.document = { activeElement: media };

  syncNav(root, 'dev', {});

  assert.equal(media.classList.contains('active'), false);
  assert.equal(media.blurred, true, '停在自媒体时按 4，旧按钮必须失焦');
  assert.equal(dev.classList.contains('active'), true);
  assert.equal(dev.attrs['aria-current'], 'page');
  assert.equal(settings.classList.contains('active'), false);
  assert.equal(settings.attrs['aria-current'], undefined);

  globalThis.document = previousDocument;
});

test('连续切页时焦点跟着当前页走，不会累积多个高亮', () => {
  const media = new FakeNavItem('media');
  const dev = new FakeNavItem('dev');
  const settings = new FakeNavItem('settings');
  const root = makeRoot([media, dev, settings]);
  const previousDocument = globalThis.document;

  globalThis.document = { activeElement: media };
  syncNav(root, 'dev', {});
  globalThis.document = { activeElement: dev };
  syncNav(root, 'settings', {});

  assert.equal(dev.blurred, true);
  assert.equal(dev.classList.contains('active'), false);
  assert.equal(settings.classList.contains('active'), true);
  assert.equal([media, dev, settings].filter((item) => item.classList.contains('active')).length, 1);

  globalThis.document = previousDocument;
});

test('九个导航按钮仍用原生 button，Tab 键可逐个访问', () => {
  const html = navHtml(pages, 'home');
  assert.equal((html.match(/<button /g) || []).length, 9);
  assert.match(html, /data-page="home"[^>]*aria-current="page"/);
  assert.match(html, /data-page="media"/);
  assert.match(html, /title="自媒体"/);
  assert.doesNotMatch(html, /tabindex="-1"/, '不要用负 tabindex 把其他导航项踢出 Tab 顺序');
});
