// P1：首页与今日计划的渲染与操作
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const tasksPage = await load('pages/tasks.js');
const homePage = await load('pages/home.js');

const TODAY = schema.todayStr();
const YESTERDAY = schema.addDays(TODAY, -1);

function makeState(overrides = {}) {
  const doc = schema.defaultDoc();
  Object.assign(doc, overrides);
  return doc;
}

function makeCtx(state) {
  const ctx = {
    state,
    toasts: [],
    undoCount: 0,
    navigated: null,
    mutate(fn, opts = {}) {
      if (opts.undo) ctx.undoCount += 1;
      fn(state);
    },
    refresh() {},
    toast(message) { ctx.toasts.push(message); },
    undo() {},
    navigate(id) { ctx.navigated = id; },
    today: () => TODAY,
    highlight() {},
  };
  return ctx;
}

test('今日计划渲染出优先级分组与统计', () => {
  const state = makeState({
    tasks: [
      { id: 'a', title: '剪片子', date: TODAY, priority: 'p0', done: false, createdAt: '1' },
      { id: 'b', title: '写代码', date: TODAY, priority: 'p1', done: true, createdAt: '2' },
      { id: 'c', title: '写复盘', date: TODAY, priority: 'p2', done: false, createdAt: '3' },
    ],
  });
  const html = tasksPage.render(makeCtx(state));
  assert.match(html, /P0 要紧/);
  assert.match(html, /P1 该做/);
  assert.match(html, /1\/3/);          // 完成统计
  assert.match(html, /剪片子/);
  assert.match(html, /已完成 1 件/);
});

test('顺延任务单独成组并可处理', () => {
  const state = makeState({
    tasks: [
      { id: 'carry', title: '上传素材', date: TODAY, priority: 'p1', done: false, carriedFrom: YESTERDAY, createdAt: '1' },
    ],
  });
  const ctx = makeCtx(state);
  const html = tasksPage.render(ctx);
  assert.match(html, /顺延自昨天/);
  assert.match(html, /今天做/);
  tasksPage.handle('carry-accept', { dataset: { id: 'carry' } }, ctx);
  assert.equal(state.tasks[0].carriedFrom, null);
});

test('放弃顺延任务后再渲染就不显示了', () => {
  const state = makeState({
    tasks: [{ id: 'c2', title: '旧事', date: TODAY, priority: 'p1', done: false, carriedFrom: YESTERDAY }],
  });
  const ctx = makeCtx(state);
  tasksPage.handle('carry-drop', { dataset: { id: 'c2' } }, ctx);
  assert.equal(state.tasks[0].abandoned, true);
  assert.doesNotMatch(tasksPage.render(ctx), /旧事/);
});

test('勾选任务会翻转完成状态并记录时间', () => {
  const state = makeState({
    tasks: [{ id: 't1', title: '训练', date: TODAY, priority: 'p2', done: false }],
  });
  tasksPage.handle('toggle', { dataset: { id: 't1' } }, makeCtx(state));
  assert.equal(state.tasks[0].done, true);
  assert.ok(state.tasks[0].doneAt);
});

test('优先级循环：p2 → p1 → p0 → p2', () => {
  const state = makeState({ tasks: [{ id: 't1', title: 'A', date: TODAY, priority: 'p2', done: false }] });
  const ctx = makeCtx(state);
  tasksPage.handle('cycle-priority', { dataset: { id: 't1' } }, ctx);
  assert.equal(state.tasks[0].priority, 'p1');
  tasksPage.handle('cycle-priority', { dataset: { id: 't1' } }, ctx);
  assert.equal(state.tasks[0].priority, 'p0');
  tasksPage.handle('cycle-priority', { dataset: { id: 't1' } }, ctx);
  assert.equal(state.tasks[0].priority, 'p2');
});

test('删除任务走撤销栈', () => {
  const state = makeState({ tasks: [{ id: 't1', title: 'A', date: TODAY, priority: 'p2', done: false }] });
  const ctx = makeCtx(state);
  tasksPage.handle('del', { dataset: { id: 't1' } }, ctx);
  assert.equal(state.tasks.length, 0);
  assert.equal(ctx.undoCount, 1, '删除必须压撤销快照');
});

test('当日复盘写入 reviews', () => {
  const state = makeState();
  tasksPage.handle('save-review', { dataset: { date: TODAY } }, makeCtx(state), '今天就剪了一条');
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].text, '今天就剪了一条');
  assert.equal(state.reviews[0].date, TODAY);
});

test('首页渲染出问候、今日计划与快捷备忘', () => {
  const state = makeState({
    tasks: [{ id: 't1', title: '剪第 3 期', date: TODAY, priority: 'p0', done: false }],
  });
  const html = homePage.render(makeCtx(state));
  assert.match(html, /今天/);
  assert.match(html, /今日计划/);
  assert.match(html, /快速备忘/);
  assert.match(html, /剪第 3 期/);
});

test('首页只显示设置里勾选的摘要卡', () => {
  const state = makeState();
  state.settings.homeSummary = ['media', 'dev'];
  const html = homePage.render(makeCtx(state));
  assert.match(html, /自媒体/);
  assert.match(html, /开发工作/);
  assert.doesNotMatch(html, /游戏娱乐/);
});

test('首页勾任务直接改同一份数据', () => {
  const state = makeState({ tasks: [{ id: 'h1', title: '回消息', date: TODAY, priority: 'p1', done: false }] });
  homePage.handle('home-toggle', { dataset: { id: 'h1' } }, makeCtx(state));
  assert.equal(state.tasks[0].done, true);
});

test('首页备忘可新增、可置顶', () => {
  const state = makeState();
  homePage.handle('add-memo', { dataset: {} }, makeCtx(state), '买灯带');
  assert.equal(state.memos.length, 1);
  homePage.handle('pin-memo', { dataset: { id: state.memos[0].id } }, makeCtx(state));
  assert.equal(state.memos[0].pinned, true);
});
