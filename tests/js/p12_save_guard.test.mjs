// P12：图表/里程碑显式保存与离开拦截
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const mediaPage = await load('pages/media.js');
const devPage = await load('pages/dev.js');
const drafts = await load('drafts.js');

const TODAY = '2026-11-15';

function makeMediaState() {
  const doc = schema.defaultDoc();
  doc.media.posts = [{
    id: 'p1', title: 'Raft 第 3 期', platform: 'douyin', publishedAt: '2026-11-01',
    views: 120, likes: 8, comments: 2, saves: 3, snapshots: [],
  }];
  return doc;
}
function makeCtx(state) {
  return {
    state, today: () => TODAY,
    mutate(fn) { fn(state); },
    refresh() {}, toast() {}, undo() {}, navigate() {},
  };
}

test('图表数据未保存时标脏，保存后才清除', () => {
  mediaPage.resetChartDraft();
  const state = makeMediaState();
  const ctx = makeCtx(state);
  mediaPage.render(ctx); // 初始化录入草稿
  assert.equal(mediaPage.isChartDraftDirty(), false);

  mediaPage.handle('snap-draft', { dataset: { field: 'postId' }, value: 'p1' }, ctx);
  assert.equal(mediaPage.isChartDraftDirty(), false, '只选记录不算填了数据');

  mediaPage.handle('snap-draft', { dataset: { snapField: 'views' }, value: '188' }, ctx);
  assert.equal(mediaPage.isChartDraftDirty(), true);
  assert.equal(state.media.posts[0].snapshots.length, 0, '没点保存前不能写数据');
  const dirtyHtml = mediaPage.render(ctx);
  assert.match(dirtyHtml, /有未保存的数据/);
  assert.match(dirtyHtml, /data-snap-field="views" value="188"/);

  const values = {
    'snap-post': 'p1', 'snap-date': '2026-11-15', 'snap-views': '188',
    'snap-likes': '12', 'snap-comments': '3', 'snap-saves': '5',
  };
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => ({ id, value: values[id] ?? '' }) };
  mediaPage.handle('add-snapshot', { dataset: {} }, ctx);
  globalThis.document = previousDocument;

  assert.equal(state.media.posts[0].snapshots.length, 1);
  assert.equal(mediaPage.isChartDraftDirty(), false);
  assert.doesNotMatch(mediaPage.render(ctx), /有未保存的数据/);
});

test('草稿来源能同时收集图表与里程碑', () => {
  const calls = [];
  const fakeMedia = { isChartDraftDirty: () => true, resetChartDraft: () => calls.push('media') };
  const fakeDev = { isMilestoneDraftDirty: () => true, resetMilestoneDraft: () => calls.push('dev') };
  const sources = drafts.collectDraftSources(fakeMedia, fakeDev);
  assert.deepEqual(sources.map((source) => source.label), ['图表数据', '里程碑']);
  assert.match(drafts.unsavedMessage(sources), /图表数据 和 里程碑/);
  assert.equal(drafts.shouldBlockUnload(fakeMedia, fakeDev), true);

  const cleanMedia = { isChartDraftDirty: () => false };
  const cleanDev = { isMilestoneDraftDirty: () => false };
  assert.deepEqual(drafts.collectDraftSources(cleanMedia, cleanDev), []);
  assert.equal(drafts.shouldBlockUnload(cleanMedia, cleanDev), false);
});

test('切页守卫：取消就留在原页，确认才切并清掉草稿', async () => {
  const resets = [];
  const fakeMedia = { isChartDraftDirty: () => true, resetChartDraft: () => resets.push('media') };
  const events = [];
  let confirmOptions = null;

  const blocked = await drafts.guardNavigation({
    target: 'tasks', current: 'media',
    go: (target) => events.push(target),
    mediaPage: fakeMedia, devPage: {},
    confirm: async (options) => { confirmOptions = options; return false; },
  });
  assert.equal(blocked, false);
  assert.deepEqual(events, [], '取消后不能切页');
  assert.deepEqual(resets, [], '取消后不能丢掉草稿');
  assert.equal(confirmOptions.title, '还有没保存的内容');
  assert.match(confirmOptions.text, /图表数据/);
  assert.equal(confirmOptions.confirmLabel, '放弃并离开');

  const passed = await drafts.guardNavigation({
    target: 'tasks', current: 'media',
    go: (target) => events.push(target),
    mediaPage: fakeMedia, devPage: {},
    confirm: async () => true,
  });
  assert.equal(passed, true);
  assert.deepEqual(events, ['tasks']);
  assert.deepEqual(resets, ['media']);
});

test('没有草稿时切页不弹确认，直接走', async () => {
  let confirmCalled = false;
  const events = [];
  const result = await drafts.guardNavigation({
    target: 'home', current: 'tasks',
    go: (target) => events.push(target),
    mediaPage: { isChartDraftDirty: () => false },
    devPage: { isMilestoneDraftDirty: () => false },
    confirm: async () => { confirmCalled = true; return true; },
  });
  assert.equal(result, true);
  assert.deepEqual(events, ['home']);
  assert.equal(confirmCalled, false);
});

test('里程碑草稿有内容时能触发同样的离开拦截', () => {
  devPage.resetMilestoneDraft();
  const doc = schema.defaultDoc();
  doc.dev.projects = [{ id: 'p', name: 'APP', stage: 'plan', milestones: [] }];
  const ctx = makeCtx(doc);
  devPage.render(ctx);
  devPage.handle('add-milestone-row', { dataset: {} }, ctx);
  devPage.handle('ms-field', { dataset: { index: '0', field: 'title' }, value: '能打开首页' }, ctx);
  assert.equal(devPage.isMilestoneDraftDirty(), true);
  assert.equal(drafts.shouldBlockUnload({}, devPage), true);
  devPage.resetMilestoneDraft();
  assert.equal(drafts.shouldBlockUnload({}, devPage), false);
});
