// P10：开发项目里程碑——节点字段、进度、逾期、草稿保存
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const logic = await load('logic.js');
const devPage = await load('pages/dev.js');

const TODAY = '2026-11-15';

const projects = [
  {
    id: 'p1', name: '作品集网站', stage: 'dev',
    milestones: [
      { id: 'm1', title: '首页可打开', dueDate: '2026-11-10', target: '点开能看到首屏', status: 'done' },
      { id: 'm2', title: '作品列表', dueDate: '2026-11-12', target: '至少 6 个作品可点', status: 'doing' },
      { id: 'm3', title: '上线', dueDate: '2026-12-01', target: '公网可访问', status: 'todo' },
    ],
  },
  {
    id: 'p2', name: '生活 APP', stage: 'plan',
    milestones: [
      { id: 'm4', title: '需求定稿', dueDate: '2026-11-20', target: 'PRD 确认', status: 'blocked' },
    ],
  },
];

function makeState() {
  const doc = schema.defaultDoc();
  doc.dev.projects = JSON.parse(JSON.stringify(projects));
  return doc;
}
function makeCtx(state) {
  return {
    state, refreshes: 0, toasts: [],
    mutate(fn) { fn(state); },
    refresh() { this.refreshes += 1; },
    toast(message) { this.toasts.push(message); },
    confirm: async () => true,
    undo() {}, navigate() {},
  };
}

test('里程碑状态标签齐全，未知状态回退未开始', () => {
  assert.deepEqual(logic.MILESTONE_STATUS.map((item) => item.label), ['未开始', '进行中', '已完成', '卡住']);
  assert.equal(logic.normalizeMilestoneStatus('done'), 'done');
  assert.equal(logic.normalizeMilestoneStatus('unknown'), 'todo');
});

test('单项目统计：已完成不算逾期，过期未完成才算', () => {
  const stats = logic.milestoneStats(projects[0].milestones, TODAY);
  assert.equal(stats.total, 3);
  assert.equal(stats.done, 1);
  assert.equal(stats.overdue, 1, 'm2 过期未完成，m1 已完成不算');
  assert.equal(stats.pct, 33);
});

test('跨项目总览带项目名，逾期按截止日排序', () => {
  const overview = logic.milestoneOverview(projects, TODAY);
  assert.equal(overview.total, 4);
  assert.equal(overview.done, 1);
  assert.equal(overview.overdue, 1, '只有 m2 过期未完成；m4 截止日还没到');
  assert.deepEqual(overview.overdueItems.map((item) => item.id), ['m2']);
  assert.equal(overview.overdueItems[0].projectName, '作品集网站');
});

test('页面顶部渲染进度与逾期提醒', () => {
  devPage.resetMilestoneDraft();
  const html = devPage.render(makeCtx(makeState()));
  assert.match(html, /里程碑进度/);
  assert.match(html, /1\/4/);
  assert.match(html, /逾期 1 个/);
  assert.match(html, /作品集网站 · 作品列表 · 2026-11-12/);
  assert.match(html, /里程碑 1\/3/);
});

test('里程碑编辑器渲染四个字段与显式保存按钮', () => {
  devPage.resetMilestoneDraft();
  const html = devPage.render(makeCtx(makeState()));
  assert.match(html, /项目里程碑/);
  assert.match(html, /data-change-action="ms-field" data-index="0" data-field="title"/);
  assert.match(html, /data-field="dueDate"/);
  assert.match(html, /data-field="target"/);
  assert.match(html, /data-field="status"/);
  assert.match(html, /data-action="save-milestones"/);
  assert.match(html, /保存里程碑/);
  assert.match(html, /改完点保存才写进数据文件/);
});

test('草稿校验：名称、截止日、达到程度缺一不可', () => {
  assert.equal(devPage.normalizeMilestoneDraft([{ title: 'A', dueDate: '2026-11-20', target: '可用', status: 'todo' }]).ok, true);
  assert.equal(devPage.normalizeMilestoneDraft([{ dueDate: '2026-11-20', target: '可用' }]).ok, false);
  assert.equal(devPage.normalizeMilestoneDraft([{ title: 'A', target: '可用' }]).ok, false);
  assert.equal(devPage.normalizeMilestoneDraft([{ title: 'A', dueDate: '2026-11-20' }]).ok, false);
  const valid = devPage.normalizeMilestoneDraft([{ title: ' A ', dueDate: '2026-11-20', target: ' 可用 ', status: 'x' }]);
  assert.equal(valid.ok, true);
  assert.equal(valid.milestones[0].title, 'A');
  assert.equal(valid.milestones[0].status, 'todo');
});

test('编辑草稿不会直接落盘，点保存后才写入项目', () => {
  devPage.resetMilestoneDraft();
  const state = makeState();
  const ctx = makeCtx(state);
  devPage.render(ctx); // 初始化草稿
  devPage.handle('add-milestone-row', { dataset: {} }, ctx);

  const fields = { title: '可发布测试版', dueDate: '2026-11-30', target: '安装包能打开', status: 'doing' };
  Object.entries(fields).forEach(([field, value]) => {
    devPage.handle('ms-field', { dataset: { index: '3', field }, value }, ctx);
  });
  assert.equal(state.dev.projects[0].milestones.length, 3, '没点保存前不能改数据');
  assert.equal(devPage.isMilestoneDraftDirty(), true);

  devPage.handle('save-milestones', { dataset: {} }, ctx);
  assert.equal(state.dev.projects[0].milestones.length, 4);
  assert.equal(state.dev.projects[0].milestones[3].title, '可发布测试版');
  assert.equal(state.dev.projects[0].milestones[3].dueDate, '2026-11-30');
  assert.equal(state.dev.projects[0].milestones[3].target, '安装包能打开');
  assert.equal(state.dev.projects[0].milestones[3].status, 'doing');
  assert.equal(devPage.isMilestoneDraftDirty(), false);
});

test('旧项目没有 milestones 字段时，规范化会补成空数组', () => {
  const doc = schema.defaultDoc();
  doc.dev.projects = [{ id: 'p', name: '旧项目', stage: 'plan' }];
  const normalized = schema.normalizeDoc(doc);
  assert.deepEqual(normalized.dev.projects[0].milestones, []);
});
