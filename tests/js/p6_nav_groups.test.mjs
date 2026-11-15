// P6：侧栏按「工作 / 日常生活」分组，全局入口留在分组外
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const { navHtml, navLayout } = await load('nav.js');
const { pages } = await load('pages/index.js');

const ids = (items) => items.map((item) => item.page.meta.id);

test('分组结构：全局入口在外，工作与日常生活各自成组', () => {
  const layout = navLayout(pages);
  assert.deepEqual(ids(layout.globalTop), ['home', 'tasks']);
  assert.deepEqual(layout.groups.map((group) => group.title), ['工作', '日常生活']);
  assert.deepEqual(ids(layout.groups[0].items), ['media', 'dev', 'consult']);
  assert.deepEqual(ids(layout.groups[1].items), ['fitness', 'diet', 'games']);
  assert.deepEqual(ids(layout.globalBottom), ['settings']);

  const all = [...layout.globalTop, ...layout.groups.flatMap((group) => group.items), ...layout.globalBottom];
  assert.equal(all.length, 9, '九个页面都要在导航里');
  assert.deepEqual(all.map((item) => item.number), [1, 2, 3, 4, 5, 6, 7, 8, 9], '数字键顺序不变');
});

test('HTML 顺序：首页/今日计划 → 工作组 → 日常生活组 → 数据与设置', () => {
  const html = navHtml(pages, 'home');
  const firstGroup = html.indexOf('<div class="nav-group"');
  const home = html.indexOf('data-page="home"');
  const tasks = html.indexOf('data-page="tasks"');
  const work = html.indexOf('工作');
  const media = html.indexOf('data-page="media"');
  const life = html.indexOf('日常生活');
  const fitness = html.indexOf('data-page="fitness"');
  const spacer = html.indexOf('nav-spacer');
  const settings = html.indexOf('data-page="settings"');

  assert.ok(home > 0 && tasks > home && firstGroup > tasks, '全局入口应在第一个分组之前');
  assert.ok(work > firstGroup && media > work, '工作标题下面应先是自媒体');
  assert.ok(life > media && fitness > life, '日常生活组应排在 working 组之后');
  assert.ok(spacer > fitness && settings > spacer, '数据与设置应在分组外、导航底部');
  assert.equal((html.match(/<button /g) || []).length, 9);
});

test('分组标题只出现在工作与日常生活组里', () => {
  const html = navHtml(pages, 'media');
  const groupTitles = [...html.matchAll(/<div class="nav-group-title">([^<]+)<\/div>/g)].map((match) => match[1]);
  assert.deepEqual(groupTitles, ['工作', '日常生活']);
  assert.match(html, /data-page="media"[^>]*aria-current="page"/s);
});
