// P8：自媒体四列看板——跨列/列内拖拽、落位顺序、刷新后保持
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

function makeState() { return schema.defaultDoc(); }
function makeCtx(state) {
  return {
    state,
    mutate(fn) { fn(state); },
    refresh() {},
    toast() {},
    undo() {},
    navigate() {},
  };
}
const order = (ideas, stage) => logic.ideasByStage(ideas)[stage].map((idea) => idea.id);
const uniqueOrders = (ideas, stage) => [...new Set(logic.ideasByStage(ideas)[stage].map((idea) => idea.order))].length
  === logic.ideasByStage(ideas)[stage].length;

test('四个阶段名称与旧数据映射正确', () => {
  assert.deepEqual(logic.IDEA_STAGES.map((stage) => stage.label), ['灵感', '待策划', '制作中', '待发布']);
  assert.equal(logic.normalizeIdeaStage('script'), 'plan');
  assert.equal(logic.normalizeIdeaStage('shoot'), 'producing');
  assert.equal(logic.normalizeIdeaStage('edit'), 'producing');
  assert.equal(logic.normalizeIdeaStage('publish'), 'ready');
  const map = logic.ideasByStage([
    { id: 'a', stage: 'script' }, { id: 'b', stage: 'shoot' }, { id: 'c', stage: 'publish' },
  ]);
  assert.equal(map.plan.length, 1);
  assert.equal(map.producing.length, 1);
  assert.equal(map.ready.length, 1);
});

test('跨列拖拽：插到目标卡片前面，两侧 order 都重排', () => {
  const ideas = [
    { id: 'a', title: 'A', stage: 'idea', order: 0 },
    { id: 'b', title: 'B', stage: 'plan', order: 0 },
    { id: 'c', title: 'C', stage: 'plan', order: 1 },
  ];
  const moved = logic.moveIdea(ideas, 'a', 'plan', 'c');
  assert.equal(moved.find((idea) => idea.id === 'a').stage, 'plan');
  assert.deepEqual(order(moved, 'plan'), ['b', 'a', 'c']);
  assert.equal(uniqueOrders(moved, 'plan'), true);
  assert.deepEqual(order(moved, 'idea'), []);
});

test('跨列拖到空白处：追加到目标列末尾', () => {
  const ideas = [
    { id: 'a', title: 'A', stage: 'idea', order: 0 },
    { id: 'b', title: 'B', stage: 'ready', order: 0 },
  ];
  const moved = logic.moveIdea(ideas, 'a', 'ready', null);
  assert.deepEqual(order(moved, 'ready'), ['b', 'a']);
  assert.deepEqual(logic.ideasByStage(moved).ready.map((idea) => idea.order), [0, 1]);
});

test('列内上下拖拽：重新排序且 order 不重复', () => {
  const ideas = [
    { id: 'a', title: 'A', stage: 'producing', order: 0 },
    { id: 'b', title: 'B', stage: 'producing', order: 1 },
    { id: 'c', title: 'C', stage: 'producing', order: 2 },
  ];
  const moved = logic.moveIdea(ideas, 'c', 'producing', 'a');
  assert.deepEqual(order(moved, 'producing'), ['c', 'a', 'b']);
  assert.deepEqual(moved.map((idea) => idea.order).sort((x, y) => x - y), [0, 1, 2]);
});

test('刷新后顺序保持：序列化再读回，仍按 order 排列', () => {
  const ideas = [
    { id: 'a', title: 'A', stage: 'plan', order: 0, createdAt: '1' },
    { id: 'b', title: 'B', stage: 'plan', order: 1, createdAt: '2' },
    { id: 'c', title: 'C', stage: 'plan', order: 2, createdAt: '3' },
  ];
  const moved = logic.moveIdea(ideas, 'a', 'plan', null);
  const reloaded = JSON.parse(JSON.stringify(moved));
  assert.deepEqual(logic.ideasByStage(reloaded).plan.map((idea) => idea.id), ['b', 'c', 'a']);
});

test('看板渲染四列，卡片可拖动并带阶段与顺序', () => {
  const state = makeState();
  state.media.ideas = [
    { id: 'i1', title: 'Raft 第 4 期', stage: 'idea', order: 0, platform: 'douyin' },
    { id: 'i2', title: '船屋开场', stage: 'ready', order: 0, platform: 'bilibili' },
  ];
  const html = mediaPage.render(makeCtx(state));
  for (const key of ['idea', 'plan', 'producing', 'ready']) {
    assert.match(html, new RegExp(`class="kcol" data-stage="${key}"`));
  }
  assert.match(html, /draggable="true"/);
  assert.match(html, /data-stage="ready"/);
  assert.match(html, /data-order="0"/);
  assert.equal((html.match(/class="kcol"/g) || []).length, 4, '只能有四列');
});

test('move-idea 通过页面 handler 真正写回数据', () => {
  const state = makeState();
  state.media.ideas = [
    { id: 'a', title: 'A', stage: 'idea', order: 0 },
    { id: 'b', title: 'B', stage: 'plan', order: 0 },
  ];
  mediaPage.handle('move-idea', { dataset: { id: 'a' } }, makeCtx(state), JSON.stringify({ stage: 'plan', beforeId: 'b' }));
  assert.equal(state.media.ideas.find((idea) => idea.id === 'a').stage, 'plan');
  assert.deepEqual(order(state.media.ideas, 'plan'), ['a', 'b']);
});
