// P2：自媒体 / 开发 / 咨询 的渲染与操作
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const logic = await load('logic.js');
const mediaPage = await load('pages/media.js');
const devPage = await load('pages/dev.js');
const consultPage = await load('pages/consult.js');

const TODAY = schema.todayStr();

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
    navigate() {},
    mutate(fn, opts = {}) { if (opts.undo) ctx.undoCount += 1; fn(state); },
    refresh() {},
    toast(message) { ctx.toasts.push(message); },
    undo() {},
  };
  return ctx;
}

// ---------- 自媒体 ----------
test('自媒体渲染出五列看板与 KPI', () => {
  const state = makeState();
  state.media.ideas = [
    { id: 'i1', title: 'Raft 第 3 期', stage: 'edit', platform: 'douyin' },
    { id: 'i2', title: '船屋开场', stage: 'idea', platform: 'bilibili' },
  ];
  const html = mediaPage.render(makeCtx(state));
  ['选题', '脚本', '拍摄', '剪辑', '发布'].forEach((label) => assert.match(html, new RegExp(label)));
  assert.match(html, /本月发布/);
  assert.match(html, /Raft 第 3 期/);
});

test('新建选题落在选题列', () => {
  const state = makeState();
  mediaPage.handle('add-idea', { dataset: {} }, makeCtx(state), '新选题 A');
  assert.equal(state.media.ideas.length, 1);
  assert.equal(state.media.ideas[0].stage, 'idea');
});

test('阶段推进：选题 → 脚本 → 拍摄 → 剪辑 → 发布', () => {
  const state = makeState();
  state.media.ideas = [{ id: 'i1', title: 'A', stage: 'idea', platform: 'douyin' }];
  const ctx = makeCtx(state);
  ['script', 'shoot', 'edit'].forEach((expected) => {
    mediaPage.handle('advance-idea', { dataset: { id: 'i1' } }, ctx);
    assert.equal(state.media.ideas[0].stage, expected);
  });
  mediaPage.handle('advance-idea', { dataset: { id: 'i1' } }, ctx);
  assert.equal(state.media.ideas[0].stage, 'publish');
});

test('发布阶段生成发布记录且不重复', () => {
  const state = makeState();
  state.media.ideas = [{ id: 'i1', title: 'A', stage: 'publish', platform: 'douyin' }];
  const ctx = makeCtx(state);
  mediaPage.handle('make-post', { dataset: { id: 'i1' } }, ctx);
  assert.equal(state.media.posts.length, 1);
  mediaPage.handle('make-post', { dataset: { id: 'i1' } }, ctx);
  assert.equal(state.media.posts.length, 1, '同一条选题不能生成两条发布记录');
});

test('发布数据可录入', () => {
  const state = makeState();
  state.media.posts = [{ id: 'p1', title: 'A', platform: 'douyin', views: null }];
  mediaPage.handle('post-field', { dataset: { id: 'p1', field: 'views' }, value: '1280' }, makeCtx(state));
  assert.equal(state.media.posts[0].views, 1280);
});

test('粉丝快照能算出涨跌', () => {
  const followers = [
    { id: 'f1', date: '2026-11-10', platform: 'douyin', count: 3200 },
    { id: 'f2', date: '2026-11-15', platform: 'douyin', count: 3480 },
  ];
  const snap = logic.followerSnapshot(followers);
  assert.equal(snap.douyin.count, 3480);
  assert.equal(snap.douyin.delta, 280);
});

// ---------- 开发 ----------
test('开发页渲染项目与三清单 tab', () => {
  const state = makeState();
  state.dev.projects = [{ id: 'p1', name: '作品集网站', type: '网站', stage: 'dev', progress: 60, nextStep: '接数据' }];
  state.dev.bugs = [{ id: 'b1', title: '图片 404', projectId: 'p1', severity: 'high', status: 'fixing' }];
  const ctx = makeCtx(state);
  const html = devPage.render(ctx);
  assert.match(html, /作品集网站/);
  assert.match(html, /需求/);
  assert.match(html, /Bug/);
  devPage.handle('tab', { dataset: { tab: 'bugs' } }, ctx);
  assert.match(devPage.render(ctx), /图片 404/);
  assert.match(devPage.render(ctx), /高/);
});

test('项目进度按条目自动计算', () => {
  const lists = {
    needs: [{ id: 'n1', projectId: 'p', status: 'done' }, { id: 'n2', projectId: 'p', status: 'todo' }],
    todos: [{ id: 'd1', projectId: 'p', done: true }],
    bugs: [{ id: 'b1', projectId: 'p', status: 'fixing' }],
  };
  assert.equal(logic.autoProgress('p', lists), 50);
});

test('Bug 一键转待办，Bug 保留', () => {
  const state = makeState();
  state.dev.bugs = [{ id: 'b1', title: '图片 404', projectId: 'p1', severity: 'mid', status: 'fixing' }];
  devPage.handle('bug-to-todo', { dataset: { id: 'b1' } }, makeCtx(state));
  assert.equal(state.dev.bugs.length, 1);
  assert.equal(state.dev.todos.length, 1);
  assert.match(state.dev.todos[0].title, /修复：图片 404/);
  assert.equal(state.dev.todos[0].fromBug, 'b1');
});

test('Bug 状态与严重度循环切换', () => {
  const state = makeState();
  state.dev.bugs = [{ id: 'b1', title: 'A', projectId: '', severity: 'mid', status: 'repro' }];
  const ctx = makeCtx(state);
  devPage.handle('bug-status', { dataset: { id: 'b1' } }, ctx);
  assert.equal(state.dev.bugs[0].status, 'locate');
  devPage.handle('bug-severity', { dataset: { id: 'b1' } }, ctx);
  assert.equal(state.dev.bugs[0].severity, 'low');
});

test('需求状态三态循环', () => {
  const state = makeState();
  state.dev.needs = [{ id: 'n1', title: 'A', projectId: '', status: 'todo' }];
  const ctx = makeCtx(state);
  devPage.handle('need-cycle', { dataset: { id: 'n1' } }, ctx);
  assert.equal(state.dev.needs[0].status, 'doing');
  devPage.handle('need-cycle', { dataset: { id: 'n1' } }, ctx);
  assert.equal(state.dev.needs[0].status, 'done');
  devPage.handle('need-cycle', { dataset: { id: 'n1' } }, ctx);
  assert.equal(state.dev.needs[0].status, 'todo');
});

// ---------- 咨询 ----------
test('咨询页渲染管道、待跟进与收入', () => {
  const state = makeState();
  state.consult.leads = [
    { id: 'L1', name: '王哥', need: '剪 3 条', stage: 'quoted', nextFollowUp: '2026-11-14' },
  ];
  state.consult.incomes = [{ id: 'in1', date: TODAY, item: '拍摄', amount: 800, paidStatus: 'paid' }];
  const html = consultPage.render(makeCtx(state));
  assert.match(html, /线索管道/);
  assert.match(html, /王哥/);
  assert.match(html, /待跟进/);
  assert.match(html, /收入台账/);
});

test('跟进日早于今天就判逾期（成交/结束除外）', () => {
  const base = { nextFollowUp: '2026-11-14' };
  assert.equal(logic.isOverdue({ ...base, stage: 'quoted' }, '2026-11-15'), true);
  assert.equal(logic.isOverdue({ ...base, stage: 'deal' }, '2026-11-15'), false);
  assert.equal(logic.isOverdue({ ...base, stage: 'closed' }, '2026-11-15'), false);
  assert.equal(logic.isOverdue({ nextFollowUp: '2026-11-16', stage: 'new' }, '2026-11-15'), false);
});

test('新线索默认 3 天后跟进', () => {
  const state = makeState();
  consultPage.handle('add-lead', { dataset: {} }, makeCtx(state), '王哥');
  const lead = state.consult.leads[0];
  assert.equal(lead.stage, 'new');
  assert.equal(lead.nextFollowUp, schema.addDays(TODAY, 3));
});

test('跟进记录会顺延跟进日', () => {
  const state = makeState();
  state.consult.leads = [{ id: 'L1', name: '王哥', stage: 'quoted', nextFollowUp: '2026-11-14' }];
  consultPage.handle('add-talk', { dataset: { id: 'L1' } }, makeCtx(state), '报 600，等回复');
  assert.equal(state.consult.talks.length, 1);
  assert.equal(state.consult.leads[0].nextFollowUp, schema.addDays(TODAY, 3));
});

test('顺延 3 天与标记成交', () => {
  const state = makeState();
  state.consult.leads = [{ id: 'L1', name: '李姐', stage: 'quoted', nextFollowUp: '2026-11-18' }];
  const ctx = makeCtx(state);
  consultPage.handle('snooze-lead', { dataset: { id: 'L1' } }, ctx);
  assert.equal(state.consult.leads[0].nextFollowUp, '2026-11-21');
  consultPage.handle('deal-lead', { dataset: { id: 'L1' } }, ctx);
  assert.equal(state.consult.leads[0].stage, 'deal');
});

test('本月收入与未收款统计', () => {
  const incomes = [
    { date: TODAY, amount: 800, paidStatus: 'paid' },
    { date: TODAY, amount: 300, paidStatus: 'unpaid' },
    { date: '2026-10-05', amount: 500, paidStatus: 'paid' },
  ];
  assert.equal(logic.monthIncome(incomes, TODAY), 1100);
  assert.equal(logic.unpaidIncome(incomes), 300);
});
