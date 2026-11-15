// P4：数据与设置、备份入口、首页摘要开关、模板生成训练、清空这天
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const logic = await load('logic.js');
const settingsPage = await load('pages/settings.js');
const fitnessPage = await load('pages/fitness.js');
const tasksPage = await load('pages/tasks.js');
const consultPage = await load('pages/consult.js');
const homePage = await load('pages/home.js');

const TODAY = schema.todayStr();

function makeCtx(state, extra = {}) {
  return {
    state,
    store: { doc: state, rev: 3, meta: { path: 'E:/demo/data/data.json', size: 2048, appVersion: '1.0.0', schemaVersion: 1, counts: { tasks: state.tasks.length } }, lastSavedAt: '2026-11-15T10:00:00+08:00', saveNow() {} },
    api: { backup: async () => ({ ok: true, data: { name: 'x.json' } }), backups: async () => ({ ok: true, data: { items: [] } }) },
    confirm: async () => true,
    confirmTyped: async () => true,
    mutate(fn) { fn(state); },
    replaceDoc(doc) { Object.assign(state, doc); },
    refresh() {},
    toast() {},
    undo() {},
    navigate() {},
    ...extra,
  };
}

function stubInputs(values) {
  globalThis.document = {
    getElementById(id) { return { id, value: values[id] ?? '', focus() {} }; },
  };
  return { restore() { delete globalThis.document; } };
}

// ---------- 设置与数据 ----------
test('设置页把数据路径、备份区和危险区都渲染出来', () => {
  const state = schema.defaultDoc();
  const html = settingsPage.render(makeCtx(state));
  assert.match(html, /数据文件/);
  assert.match(html, /data\.json/);
  assert.match(html, /备份与恢复/);
  assert.match(html, /立即备份/);
  assert.match(html, /导出备份文件/);
  assert.match(html, /危险区/);
  assert.match(html, /首页摘要卡/);
});

test('设置项按类型落库：数字转数字、勾选转布尔', () => {
  const state = schema.defaultDoc();
  const ctx = makeCtx(state);
  settingsPage.handle('setting', { dataset: { field: 'calorieGoal' }, type: 'number', value: '1800' }, ctx);
  assert.equal(state.settings.calorieGoal, 1800);
  settingsPage.handle('setting', { dataset: { field: 'autoBackup' }, type: 'checkbox', checked: false }, ctx);
  assert.equal(state.settings.autoBackup, false);
  settingsPage.handle('setting', { dataset: { field: 'carryOverYesterday' }, type: 'select', value: 'false' }, ctx);
  assert.equal(state.settings.carryOverYesterday, false);
});

test('可以关掉首页的某个摘要卡', () => {
  const state = schema.defaultDoc();
  const ctx = makeCtx(state);
  assert.ok(state.settings.homeSummary.includes('games'));
  settingsPage.handle('home-summary', { dataset: { key: 'games' }, checked: false }, ctx);
  assert.equal(state.settings.homeSummary.includes('games'), false);
  const html = homePage.render(ctx);
  assert.doesNotMatch(html, /游戏娱乐/);
  settingsPage.handle('home-summary', { dataset: { key: 'games' }, checked: true }, ctx);
  assert.match(homePage.render(makeCtx(state)), /游戏娱乐/);
});

test('每日回顾同一天只留一条并覆盖', () => {
  const state = schema.defaultDoc();
  const ctx = makeCtx(state);
  let inputs = stubInputs({ 'review-good': '练完了', 'review-block': '剪片卡住', 'review-next': '明早先剪' });
  settingsPage.handle('save-review', { dataset: {} }, ctx);
  inputs.restore();
  assert.equal(state.reviews.length, 1);
  inputs = stubInputs({ 'review-good': '改好了', 'review-block': '', 'review-next': '' });
  settingsPage.handle('save-review', { dataset: {} }, ctx);
  inputs.restore();
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].good, '改好了');
});

// ---------- 健身模板生成 ----------
test('按模板生成今日训练，并带上动作', () => {
  const state = schema.defaultDoc();
  state.fitness.weekTemplate = logic.blankWeekTemplate();
  const todayIndex = logic.weekdayIndex(TODAY);
  state.fitness.weekTemplate.find((item) => item.day === todayIndex).part = '胸 + 三头';
  state.fitness.weekTemplate.find((item) => item.day === todayIndex).exerciseNames = '卧推、飞鸟';
  const ctx = makeCtx(state);
  fitnessPage.handle('generate-today', { dataset: {} }, ctx);
  assert.equal(state.fitness.sessions.length, 1);
  assert.equal(state.fitness.sessions[0].exercises.length, 2);
  assert.equal(state.fitness.sessions[0].type, '胸 + 三头');
  assert.equal(logic.sessionDone(state.fitness.sessions[0]), false);
});

test('动作全部完成后顶部显示已打卡', () => {
  const state = schema.defaultDoc();
  state.fitness.weekTemplate = logic.blankWeekTemplate();
  state.fitness.weekTemplate[logic.weekdayIndex(TODAY) - 1].exerciseNames = '卧推';
  fitnessPage.handle('generate-today', { dataset: {} }, makeCtx(state));
  const session = state.fitness.sessions[0];
  session.exercises[0].doneSets = session.exercises[0].sets;
  assert.equal(logic.sessionDone(session), true);
  assert.match(fitnessPage.render(makeCtx(state)), /已打卡/);
});

test('同一天不会重复生成训练', () => {
  const state = schema.defaultDoc();
  const ctx = makeCtx(state);
  fitnessPage.handle('generate-today', { dataset: {} }, ctx);
  fitnessPage.handle('generate-today', { dataset: {} }, ctx);
  assert.equal(state.fitness.sessions.length, 1);
});

// ---------- 今日计划清空 ----------
test('清空这天会先备份，再删当天任务', async () => {
  const state = schema.defaultDoc();
  state.tasks = [
    { id: 't1', title: '今天的事', date: TODAY, done: false },
    { id: 't2', title: '别的天', date: '2026-11-10', done: false },
  ];
  let backedUp = 0;
  const ctx = makeCtx(state, { api: { backup: async () => { backedUp += 1; return { ok: true, data: { name: 'pre.json' } }; } } });
  tasksPage.handle('clear-day', { dataset: {} }, ctx);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(backedUp, 1);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].id, 't2');
});

test('备份失败时不清空任务', async () => {
  const state = schema.defaultDoc();
  state.tasks = [{ id: 't1', title: '今天', date: TODAY, done: false }];
  const ctx = makeCtx(state, { api: { backup: async () => ({ ok: false, data: { error: '磁盘满' } }) } });
  tasksPage.handle('clear-day', { dataset: {} }, ctx);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.tasks.length, 1);
});

// ---------- 咨询跟进 ----------
test('已跟进会顺延跟进日并写入时间线', () => {
  const state = schema.defaultDoc();
  state.consult.leads = [{ id: 'L1', name: '王哥', stage: 'quoted', nextFollowUp: '2026-11-14' }];
  consultPage.handle('quick-follow', { dataset: { id: 'L1' } }, makeCtx(state));
  assert.equal(state.consult.talks.length, 1);
  assert.equal(state.consult.talks[0].content, '已跟进');
  assert.equal(state.consult.leads[0].nextFollowUp, schema.addDays(TODAY, 3));
});
