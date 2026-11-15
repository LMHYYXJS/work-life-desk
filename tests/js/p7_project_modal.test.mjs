// P7：创建项目弹窗——遮罩/ESC/关闭按钮三种关法 + 未保存确认 + 必填校验
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const devPage = await load('pages/dev.js');
const ui = await load('ui.js');

// ---------- 最小可交互 DOM 垫片 ----------
class FakeEl {
  constructor() {
    this.listeners = {};
    this.children = [];
    this._html = '';
    this.textContent = '';
    this.hidden = true;
    this.value = '';
    this.removed = false;
    this.focused = false;
    this.q = new Map();
  }
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }
  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn);
  }
  dispatch(type, event = {}) {
    const payload = { target: this, preventDefault() { payload.defaultPrevented = true; }, ...event };
    (this.listeners[type] || []).forEach((fn) => fn(payload));
    return payload;
  }
  querySelector(selector) {
    if (!this.q.has(selector)) this.q.set(selector, new FakeEl());
    return this.q.get(selector);
  }
  appendChild(child) { this.children.push(child); return child; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  closest() { return null; }
}

const registry = new Map();
const documentListeners = {};
const fakeDocument = {
  getElementById(id) {
    if (!registry.has(id)) registry.set(id, new FakeEl());
    return registry.get(id);
  },
  createElement() { return new FakeEl(); },
  addEventListener(type, fn) {
    if (!documentListeners[type]) documentListeners[type] = [];
    documentListeners[type].push(fn);
  },
  removeEventListener(type, fn) {
    documentListeners[type] = (documentListeners[type] || []).filter((item) => item !== fn);
  },
  activeElement: null,
};
globalThis.document = fakeDocument;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function openModal(confirmFn) {
  const modal = ui.openFormModal({
    title: '新建项目',
    body: '<input data-autofocus="1">',
    confirm: confirmFn,
    onSubmit: async () => true,
  });
  return modal;
}

// ---------- 必填校验 ----------
test('项目名必填，空白名被拒绝，合法名字会去掉首尾空格', () => {
  assert.equal(devPage.normalizeProjectDraft({ name: '   ' }).ok, false);
  const result = devPage.normalizeProjectDraft({
    name: '  作品集网站  ', type: '网站', stage: 'dev', dueDate: '2026-12-01', nextStep: ' 接数据 ',
  });
  assert.equal(result.ok, true);
  assert.equal(result.project.name, '作品集网站');
  assert.equal(result.project.stage, 'dev');
  assert.equal(result.project.nextStep, '接数据');
  assert.equal(devPage.normalizeProjectDraft({ name: 'A', stage: '不存在的阶段' }).project.stage, 'plan');
});

test('开发页不再有内联项目输入，改为打开弹窗', () => {
  const state = schema.defaultDoc();
  const html = devPage.render({
    state,
    mutate(fn) { fn(state); },
    refresh() {},
    toast() {},
    undo() {},
    navigate() {},
  });
  assert.match(html, /data-action="open-project-modal"/);
  assert.doesNotMatch(html, /id="project-name"/, '旧的内联输入应移除');
  assert.match(devPage.projectFormBody(), /id="pm-name"/);
  assert.match(devPage.projectFormBody(), /required/);
});

// ---------- 三种关闭方式 ----------
test('未修改时，点遮罩可以关闭', async () => {
  const modal = openModal(async () => true);
  const root = fakeDocument.getElementById('modal-root');
  assert.equal(root.children.length >= 1, true, '弹窗应挂到 modal-root');
  modal.mask.dispatch('click', { target: modal.mask });
  await sleep(0);
  assert.equal(modal.mask.removed, true);
});

test('未修改时，ESC 可以关闭', async () => {
  const modal = openModal(async () => true);
  const handler = documentListeners.keydown[documentListeners.keydown.length - 1];
  const event = { key: 'Escape', preventDefault() { event.prevented = true; } };
  handler(event);
  await sleep(0);
  assert.equal(event.prevented, true);
  assert.equal(modal.mask.removed, true);
});

test('未修改时，右上角关闭按钮可以关闭', async () => {
  const modal = openModal(async () => true);
  const closeButton = { closest: (selector) => (selector === '[data-modal-close]' ? {} : null) };
  modal.mask.dispatch('click', { target: closeButton });
  await sleep(0);
  assert.equal(modal.mask.removed, true);
});

test('有未保存内容时会先确认：拒绝则留在弹窗，同意才关闭', async () => {
  let answer = false;
  let asks = 0;
  const modal = openModal(async () => { asks += 1; return answer; });
  modal.setDirty(true);
  await modal.close();
  assert.equal(asks, 1);
  assert.equal(modal.mask.removed, false, '用户拒绝后弹窗不能被关掉');

  answer = true;
  await modal.close();
  assert.equal(modal.mask.removed, true, '用户同意后才关闭');
});

test('提交表单会调用 onSubmit，返回 false 时错误可留在弹窗', async () => {
  let called = 0;
  const modal = ui.openFormModal({
    title: '测试',
    body: '<input>',
    onSubmit: async ({ setError }) => { called += 1; setError('项目名不能为空'); return false; },
  });
  const form = modal.mask.querySelector('[data-modal-form]');
  await form.dispatch('submit');
  await sleep(0);
  assert.equal(called, 1);
  assert.equal(modal.mask.removed, false);
  const errorBox = modal.mask.querySelector('[data-modal-error]');
  assert.equal(errorBox.textContent, '项目名不能为空');
});

test('在弹窗里提交后项目真正写进 dev.projects', async () => {
  const state = schema.defaultDoc();
  const ctx = {
    state,
    toasts: [],
    mutate(fn) { fn(state); },
    refresh() {},
    toast(message) { ctx.toasts.push(message); },
    undo() {},
    navigate() {},
  };
  devPage.handle('open-project-modal', { dataset: {} }, ctx);
  const root = fakeDocument.getElementById('modal-root');
  const mask = root.children[root.children.length - 1];

  fakeDocument.getElementById('pm-name').value = 'Minecraft 作品集网站';
  fakeDocument.getElementById('pm-type').value = '网站';
  fakeDocument.getElementById('pm-stage').value = 'dev';
  fakeDocument.getElementById('pm-due').value = '2026-12-31';
  fakeDocument.getElementById('pm-next').value = '接数据';

  await mask.querySelector('[data-modal-form]').dispatch('submit');
  await sleep(0);

  assert.equal(state.dev.projects.length, 1);
  assert.equal(state.dev.projects[0].name, 'Minecraft 作品集网站');
  assert.equal(state.dev.projects[0].stage, 'dev');
  assert.equal(state.dev.projects[0].dueDate, '2026-12-31');
  assert.equal(state.dev.projects[0].nextStep, '接数据');
  assert.equal(mask.removed, true, '保存成功后应关闭弹窗');
});
