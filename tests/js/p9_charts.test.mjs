// P9：发布后数据图表——单条走势、多条对比、汇总、时间范围、分平台
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const charts = await load('charts.js');
const mediaPage = await load('pages/media.js');

const TODAY = '2026-11-15';

const posts = [
  {
    id: 'p1', title: 'Raft 第 3 期', platform: 'douyin', publishedAt: '2026-11-01', views: 150,
    snapshots: [{ id: 's1', date: '2026-11-10', views: 100, likes: 8, comments: 2, saves: 3 },
      { id: 's2', date: '2026-11-14', views: 150, likes: 12, comments: 4, saves: 6 }],
  },
  {
    id: 'p2', title: '船屋开场', platform: 'bilibili', publishedAt: '2026-11-15', views: 50,
    likes: 5, comments: 1, saves: 2, snapshots: [],
  },
  {
    id: 'p3', title: '九月旧片', platform: 'douyin', publishedAt: '2026-10-01', views: 999, snapshots: [],
  },
];

function makeState() {
  const doc = schema.defaultDoc();
  doc.media.posts = JSON.parse(JSON.stringify(posts));
  return doc;
}
function makeCtx(state) {
  return {
    state, toasts: [],
    mutate(fn) { fn(state); },
    refresh() {},
    toast(message) { this.toasts.push(message); },
    undo() {}, navigate() {},
  };
}

test('单条序列按日期排序、同一天去重，无快照时退回发布日当前值', () => {
  const series = charts.postSeries(posts[0], { from: '2026-11-01', to: TODAY });
  assert.deepEqual(series.map((point) => point.value), [100, 150]);
  assert.deepEqual(series.map((point) => point.date), ['2026-11-10', '2026-11-14']);
  const fallback = charts.postSeries(posts[1], {});
  assert.deepEqual(fallback, [{ date: '2026-11-15', value: 50 }]);
});

test('汇总按平台与时间范围过滤，取范围内最后一次快照', () => {
  const all = charts.chartSummary(posts, { platform: 'all', from: '2026-11-09', to: TODAY });
  assert.equal(all.posts, 2);
  assert.equal(all.views, 200);
  assert.equal(all.likes, 17);
  assert.equal(all.comments, 5);
  assert.equal(all.saves, 8);

  const douyin = charts.chartSummary(posts, { platform: 'douyin', from: '2026-11-09', to: TODAY });
  assert.equal(douyin.posts, 1);
  assert.equal(douyin.views, 150);

  const longRange = charts.chartSummary(posts, { platform: 'all', from: null, to: null });
  assert.equal(longRange.views, 1199, '全部范围应包含旧片');
});

test('多条对比可以按平台筛，也可以只选指定记录', () => {
  const auto = charts.comparisonSeries(posts, { platform: 'all', from: '2026-11-09', to: TODAY });
  assert.equal(auto.length, 2);
  assert.ok(auto.every((item) => item.color));
  assert.deepEqual(auto.map((item) => item.id).sort(), ['p1', 'p2']);

  const selected = charts.comparisonSeries(posts, {
    platform: 'all', from: '2026-11-09', to: TODAY, selectedIds: ['p3'],
  });
  assert.equal(selected.length, 0, 'p3 不在范围内，不应出现');

  const douyin = charts.comparisonSeries(posts, {
    platform: 'douyin', from: '2026-11-09', to: TODAY, selectedIds: ['p1'],
  });
  assert.equal(douyin.length, 1);
  assert.equal(douyin[0].id, 'p1');
});

test('SVG 折线图：空数据友好提示，单条有折线，多条有图例', () => {
  assert.match(charts.lineChart([]), /还没有数据点/);
  const single = charts.lineChart([{ label: 'Raft', color: '#4DD8FF', points: [{ date: '2026-11-10', value: 100 }, { date: '2026-11-14', value: 150 }] }], { from: '2026-11-09', to: TODAY });
  assert.match(single, /<svg/);
  assert.match(single, /<polyline/);
  assert.equal((single.match(/<circle/g) || []).length, 2);
  assert.doesNotMatch(single, /NaN|undefined/);

  const multi = charts.lineChart([
    { label: 'A', color: '#4DD8FF', points: [{ date: '2026-11-10', value: 10 }] },
    { label: 'B', color: '#FFB648', points: [{ date: '2026-11-11', value: 20 }] },
  ], { from: '2026-11-09', to: TODAY });
  assert.equal((multi.match(/<polyline/g) || []).length, 2);
  assert.match(multi, /chart-legend/);
  assert.match(multi, /A/);
  assert.match(multi, /B/);
});

test('自媒体页面渲染图表区、筛选器与手动录入表单', () => {
  const html = mediaPage.render(makeCtx(makeState()));
  assert.match(html, /发布数据可视化/);
  assert.match(html, /手动录入，不自动抓取/);
  assert.match(html, /单条走势/);
  assert.match(html, /多条对比/);
  assert.match(html, /总播放/);
  assert.match(html, /近 7 天/);
  assert.match(html, /近 30 天/);
  assert.match(html, /全部平台/);
  assert.match(html, /保存数据点/);
  assert.match(html, /data-action="add-snapshot"/);
});

test('补数据点会写入快照、覆盖同一天、并同步当前累计值', () => {
  const state = makeState();
  const ctx = makeCtx(state);
  const values = {
    'snap-post': 'p1', 'snap-date': '2026-11-15', 'snap-views': '260',
    'snap-likes': '20', 'snap-comments': '6', 'snap-saves': '9',
  };
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => ({ id, value: values[id] ?? '' }) };
  mediaPage.handle('add-snapshot', { dataset: {} }, ctx);
  assert.equal(state.media.posts[0].snapshots.length, 3);
  assert.equal(state.media.posts[0].snapshots[2].views, 260);
  assert.equal(state.media.posts[0].views, 260);

  values['snap-views'] = '300';
  mediaPage.handle('add-snapshot', { dataset: {} }, ctx);
  assert.equal(state.media.posts[0].snapshots.length, 3, '同一天只能保留一个数据点');
  assert.equal(state.media.posts[0].snapshots[2].views, 300);
  globalThis.document = previousDocument;
});

test('旧数据没有 snapshots 字段时，规范化会补成空数组', () => {
  const doc = schema.defaultDoc();
  doc.media.posts = [{ id: 'p', title: 'A', platform: 'douyin', publishedAt: TODAY, views: 10 }];
  const normalized = schema.normalizeDoc(doc);
  assert.deepEqual(normalized.media.posts[0].snapshots, []);
});
