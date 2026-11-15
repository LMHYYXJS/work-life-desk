// 真实启动流程冒烟：用最小 DOM 垫片加载 main.js，验证启动、渲染、切页、保存管线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');

// ---------- 最小 DOM 垫片 ----------
class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...names) { names.forEach((n) => this.set.add(n)); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); }
  toggle(name, force) {
    const want = force === undefined ? !this.set.has(name) : !!force;
    if (want) this.set.add(name); else this.set.delete(name);
    return want;
  }
  contains(name) { return this.set.has(name); }
}

class FakeEl {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this._html = '';
    this.textContent = '';
    this.className = '';
    this.classList = new FakeClassList();
    this.hidden = false;
    this.dataset = {};
    this.style = {};
    this.value = '';
  }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  appendChild(child) { this.children.push(child); return child; }
  remove() {}
  focus() {}
  closest() { return null; }
  setSelectionRange() {}
}

const registry = new Map();
const fakeDocument = {
  getElementById(id) {
    if (!registry.has(id)) registry.set(id, new FakeEl(id));
    return registry.get(id);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement() { return new FakeEl(); },
  documentElement: new FakeEl('html'),
  activeElement: null,
};
globalThis.document = fakeDocument;
globalThis.window = { addEventListener() {}, WLD: null };

// ---------- 假接口 ----------
const sampleDoc = schema.defaultDoc();
sampleDoc.tasks = [
  { id: 't1', title: '剪《Raft》第 3 期', date: schema.todayStr(), priority: 'p0', done: false, createdAt: '1' },
  { id: 't2', title: '写开发日志', date: schema.todayStr(), priority: 'p2', done: true, createdAt: '2' },
];
sampleDoc.memos = [{ id: 'm1', text: '给妈买胃药', pinned: true, createdAt: '2026-11-15T08:00:00+08:00' }];
sampleDoc.media.nextUpdateAt = '2026-11-17';
sampleDoc.settings.autoBackup = true;

let serverRev = 1;
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method || 'GET', body: options.body });
  const json = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload });
  if (url === '/api/data' && (options.method || 'GET') === 'GET') {
    return json({ doc: JSON.parse(JSON.stringify(sampleDoc)), rev: serverRev, meta: { path: 'E:/demo/data/data.json', size: 100 }, warning: null });
  }
  if (url === '/api/data' && options.method === 'POST') {
    serverRev += 1;
    return json({ rev: serverRev, lastSavedAt: schema.isoNow(), backupWritten: false });
  }
  return json({ error: 'not found' }, 404);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await import(pathToFileURL(path.join(SRC, 'main.js')).href);
await sleep(120);

test('启动后加载数据并渲染首页', () => {
  const view = fakeDocument.getElementById('view');
  assert.match(view.innerHTML, /今日计划/);
  assert.match(view.innerHTML, /快速备忘/);
  assert.match(view.innerHTML, /剪《Raft》第 3 期/);
  assert.equal(fakeDocument.getElementById('save-status').textContent.includes('已保存'), true);
});

test('九个页面都能切入并渲染出内容', async () => {
  const ids = ['home', 'tasks', 'media', 'dev', 'consult', 'fitness', 'diet', 'games', 'settings'];
  for (const id of ids) {
    globalThis.window.WLD.router.go(id);
    await sleep(20);
    const html = fakeDocument.getElementById('view').innerHTML;
    assert.ok(html.length > 30, `${id} 页面渲染为空`);
  }
});

test('改数据会走保存管线并刷新版本号', async () => {
  const store = globalThis.window.WLD.store;
  globalThis.window.WLD.router.go('tasks');
  await sleep(20);
  const before = serverRev;
  store.mutate((doc) => { doc.tasks[0].done = true; });
  await sleep(900);
  const posts = calls.filter((call) => call.method === 'POST');
  assert.ok(posts.length >= 1, '应发出保存请求');
  assert.equal(serverRev, before + 1);
  assert.equal(store.rev, serverRev);
});

test('渲染时会转义 HTML，避免注入', async () => {
  globalThis.window.WLD.store.mutate((doc) => {
    doc.tasks.push({ id: 'x', title: '<img src=x onerror=alert(1)>', date: schema.todayStr(), priority: 'p2', done: false });
  });
  globalThis.window.WLD.router.go('home');
  await sleep(60);
  const html = fakeDocument.getElementById('view').innerHTML;
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('500 条任务 / 300 条餐食规模下切页仍在 1 秒内', async () => {
  const store = globalThis.window.WLD.store;
  const today = schema.todayStr();
  store.doc.tasks = Array.from({ length: 500 }, (_, index) => ({
    id: `bulk-t${index}`, title: `批量任务 ${index}`, date: today,
    priority: index % 2 ? 'p1' : 'p2', done: index % 3 === 0, createdAt: '1',
  }));
  store.doc.diet.meals = Array.from({ length: 300 }, (_, index) => ({
    id: `bulk-m${index}`, date: today, slot: 'lunch', name: `批量餐 ${index}`, kcal: 300,
  }));

  const start = performance.now();
  globalThis.window.WLD.router.go('tasks');
  const afterTasks = performance.now();
  globalThis.window.WLD.router.go('diet');
  const afterDiet = performance.now();
  assert.ok(afterTasks - start < 1000, `任务页渲染 ${(afterTasks - start).toFixed(0)}ms`);
  assert.ok(afterDiet - afterTasks < 1000, `饮食页渲染 ${(afterDiet - afterTasks).toFixed(0)}ms`);
});
