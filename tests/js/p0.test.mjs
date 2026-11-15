// P0：数据结构、日期工具、基础逻辑、9 个页面可渲染
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const logic = await load('logic.js');
const pagesIndex = await load('pages/index.js');

const ctxStub = { state: schema.defaultDoc(), settings: schema.defaultDoc().settings, today: () => '2026-11-15' };

test('默认文档结构合法', () => {
  const doc = schema.defaultDoc();
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.rev, 1);
  assert.deepEqual(schema.validateDoc(doc), { ok: true, reason: '' });
});

test('缺分区的文档会被拒绝', () => {
  const doc = schema.defaultDoc();
  delete doc.dev;
  const result = schema.validateDoc(doc);
  assert.equal(result.ok, false);
  assert.match(result.reason, /dev/);
});

test('normalizeDoc 补齐缺失字段', () => {
  const doc = schema.normalizeDoc({ schemaVersion: 1 });
  assert.deepEqual(doc.dev.bugs, []);
  assert.equal(doc.settings.waterGoal, 8);
  assert.equal(doc.media.nextUpdateAt, null);
});

test('日期工具正确', () => {
  assert.equal(schema.todayStr(new Date(2026, 10, 15)), '2026-11-15');
  assert.equal(schema.addDays('2026-11-15', 1), '2026-11-16');
  assert.equal(schema.addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(schema.weekdayCn('2026-11-15'), '周日');
  assert.equal(schema.formatCn('2026-11-15'), '11月15日 周日');
});

test('任务分组与统计', () => {
  const tasks = [
    { id: 'a', title: 'A', priority: 'p0', done: true, createdAt: '1' },
    { id: 'b', title: 'B', priority: 'p1', done: false, createdAt: '2' },
    { id: 'c', title: 'C', priority: 'p2', done: false, createdAt: '3' },
  ];
  const groups = logic.groupTasks(tasks);
  assert.equal(groups.p0.length, 1);
  assert.equal(groups.p1.length, 1);
  const stats = logic.taskStats(tasks);
  assert.deepEqual(stats, { total: 3, done: 1, pct: 33 });
});

test('顺延幂等：重复调用不会重复生成', () => {
  const tasks = [{ id: 'x1', title: '没做完', date: '2026-11-14', priority: 'p1', done: false }];
  const first = logic.carryOver(tasks, '2026-11-15');
  assert.equal(first.added.length, 1);
  assert.equal(first.added[0].carriedFrom, '2026-11-14');
  const second = logic.carryOver(first.tasks, '2026-11-15');
  assert.equal(second.added.length, 0);
});

test('已完成的昨天任务不会被顺延', () => {
  const tasks = [
    { id: 'x1', title: '做完了', date: '2026-11-14', priority: 'p1', done: true },
    { id: 'x2', title: '放弃了', date: '2026-11-14', priority: 'p1', done: false, abandoned: true },
  ];
  assert.equal(logic.carryOver(tasks, '2026-11-15').added.length, 0);
});

test('备忘排序：置顶优先、时间倒序', () => {
  const memos = [
    { id: '1', text: '旧', pinned: false, createdAt: '2026-11-14T08:00:00+08:00' },
    { id: '2', text: '新', pinned: false, createdAt: '2026-11-15T08:00:00+08:00' },
    { id: '3', text: '钉', pinned: true, createdAt: '2026-11-13T08:00:00+08:00' },
  ];
  assert.deepEqual(logic.sortMemos(memos).map((m) => m.id), ['3', '2', '1']);
});

test('九页注册且每页可渲染出内容', () => {
  assert.equal(pagesIndex.pages.length, 9);
  const ids = pagesIndex.pages.map((page) => page.meta.id);
  assert.deepEqual(ids, ['home', 'tasks', 'media', 'dev', 'consult', 'fitness', 'diet', 'games', 'settings']);
  pagesIndex.pages.forEach((page) => {
    const html = page.render(ctxStub);
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 20, `${page.meta.id} 渲染内容过短`);
  });
});
