// P3：健身 / 饮食 / 游戏 的渲染与操作
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const logic = await load('logic.js');
const fitnessPage = await load('pages/fitness.js');
const dietPage = await load('pages/diet.js');
const gamesPage = await load('pages/games.js');

const TODAY = schema.todayStr();

function makeState() { return schema.defaultDoc(); }

function makeCtx(state) {
  const ctx = {
    state,
    mutate(fn) { fn(state); },
    refresh() {},
    toast() {},
    undo() {},
    navigate() {},
  };
  return ctx;
}

// 让依赖输入框的 handler 在 Node 下可测
function stubInputs(values) {
  globalThis.document = {
    getElementById(id) {
      return { id, value: values[id] ?? '', focus() {}, addEventListener() {}, removeEventListener() {} };
    },
  };
  const api = {
    set(next) { Object.assign(values, next); },
    restore() { delete globalThis.document; },
  };
  return api;
}

// ---------- 健身 ----------
test('健身页渲染今日安排、周模板与打卡区', () => {
  const state = makeState();
  state.fitness.weekTemplate = logic.blankWeekTemplate();
  const todayIndex = logic.weekdayIndex(TODAY);
  state.fitness.weekTemplate.find((item) => item.day === todayIndex).part = '胸 + 三头';
  const html = fitnessPage.render(makeCtx(state));
  assert.match(html, /本周训练模板/);
  assert.match(html, /胸 \+ 三头/);
  assert.match(html, /训练打卡/);
  assert.match(html, /动作库/);
});

test('打卡会记入本周训练次数', () => {
  const state = makeState();
  const inputs = stubInputs({ 'session-date': TODAY, 'session-type': '背 + 二头', 'session-duration': '55', 'session-feel': '状态好' });
  fitnessPage.handle('add-session', { dataset: {} }, makeCtx(state));
  inputs.restore();
  assert.equal(state.fitness.sessions.length, 1);
  assert.equal(state.fitness.sessions[0].type, '背 + 二头');
  assert.equal(logic.weekSessions(state.fitness.sessions, TODAY).length, 1);
});

test('连续训练天数会累加', () => {
  const sessions = [
    { id: '1', date: TODAY }, { id: '2', date: schema.addDays(TODAY, -1) }, { id: '3', date: schema.addDays(TODAY, -2) },
    { id: '4', date: schema.addDays(TODAY, -5) },
  ];
  assert.equal(logic.streakDays(sessions, TODAY), 3);
  assert.equal(logic.streakDays([], TODAY), 0);
});

test('体重记录能算出与上次的差值', () => {
  const body = [{ date: '2026-11-01', weight: 72.5 }, { date: TODAY, weight: 71.8 }];
  const info = logic.latestBody(body);
  assert.equal(info.latest.weight, 71.8);
  assert.ok(Math.abs(info.delta.weight + 0.7) < 1e-9);
});

test('动作库可新增并被模板引用显示', () => {
  const state = makeState();
  const inputs = stubInputs({ 'exercise-name': '卧推', 'exercise-part': '胸' });
  fitnessPage.handle('add-exercise', { dataset: {} }, makeCtx(state));
  inputs.restore();
  assert.equal(state.fitness.exerciseLib.length, 1);
  const exercise = state.fitness.exerciseLib[0];
  assert.equal(exercise.part, '胸');
  state.fitness.weekTemplate = logic.blankWeekTemplate();
  state.fitness.weekTemplate[0].exerciseIds = [exercise.id];
  assert.match(fitnessPage.render(makeCtx(state)), /卧推/);
});

// ---------- 饮食 ----------
test('饮食页渲染今日摄入、饮水与外食', () => {
  const state = makeState();
  state.diet.meals = [
    { id: 'm1', date: TODAY, slot: 'breakfast', name: '鸡蛋', kcal: 150 },
    { id: 'm2', date: TODAY, slot: 'lunch', name: '牛肉饭', kcal: 700 },
  ];
  state.diet.daily = [{ date: TODAY, waterCups: 3, outsideCount: 1, outsideSpend: 25, note: '' }];
  const html = dietPage.render(makeCtx(state));
  assert.match(html, /今日饮食/);
  assert.match(html, /牛肉饭/);
  assert.match(html, /饮水/);
  assert.match(html, /一周|这周记录/);
});

test('记一笔饭会累加当日热量', () => {
  const state = makeState();
  const inputs = stubInputs({ 'diet-name': '牛肉饭', 'diet-kcal': '700', 'diet-slot': 'lunch' });
  dietPage.handle('add-meal', { dataset: {} }, makeCtx(state));
  inputs.restore();
  assert.equal(state.diet.meals.length, 1);
  assert.equal(logic.kcalOf(logic.mealsOf(state.diet.meals, TODAY)), 700);
  assert.equal(logic.mealsBySlot(state.diet.meals, TODAY).lunch.length, 1);
});

test('饮水 +1 会自动建当日记录', () => {
  const state = makeState();
  dietPage.handle('water-plus', { dataset: {} }, makeCtx(state));
  dietPage.handle('water-plus', { dataset: {} }, makeCtx(state));
  assert.equal(logic.waterOf(state.diet.daily, TODAY), 2);
  assert.equal(state.diet.daily.length, 1, '同一天只应有一条 daily');
  dietPage.handle('water-minus', { dataset: {} }, makeCtx(state));
  assert.equal(logic.waterOf(state.diet.daily, TODAY), 1);
});

test('外食记录可写并参与本周统计', () => {
  const state = makeState();
  dietPage.handle('daily-outside', { dataset: { field: 'outsideCount' }, value: '2' }, makeCtx(state));
  dietPage.handle('daily-outside', { dataset: { field: 'outsideSpend' }, value: '60' }, makeCtx(state));
  const outside = logic.outsideThisWeek(state.diet.daily, TODAY);
  assert.equal(outside.count, 2);
  assert.equal(outside.spend, 60);
});

test('食物库可新增，一键加入今日', () => {
  const state = makeState();
  const inputs = stubInputs({ 'food-name': '鸡蛋', 'food-kcal': '150', 'food-per': '2 个', 'diet-slot': 'breakfast' });
  dietPage.handle('add-food', { dataset: {} }, makeCtx(state));
  inputs.restore();
  const food = state.diet.foodLib[0];
  assert.equal(food.kcal, 150);
  dietPage.handle('add-from-lib', { dataset: { id: food.id } }, makeCtx(state));
  assert.equal(state.diet.meals.length, 1);
  assert.equal(state.diet.meals[0].kcal, 150);
});

// ---------- 游戏 ----------
test('游戏页渲染库、额度与想玩清单', () => {
  const state = makeState();
  state.games.library = [{ id: 'g1', name: 'Raft', platform: 'Steam', status: 'playing', rating: 4 }];
  state.games.plays = [{ id: 'p1', gameId: 'g1', date: TODAY, minutes: 90 }];
  const html = gamesPage.render(makeCtx(state));
  assert.match(html, /Raft/);
  assert.match(html, /本周额度/);
  assert.match(html, /想玩/);
  assert.match(html, /本周时长/);
});

test('记时长会同周累计', () => {
  const state = makeState();
  state.games.library = [{ id: 'g1', name: 'Raft', platform: 'Steam', status: 'playing' }];
  const inputs = stubInputs({ 'play-game': 'g1', 'play-date': TODAY, 'play-minutes': '45', 'play-note': '第 4 章' });
  gamesPage.handle('add-play', { dataset: {} }, makeCtx(state));
  gamesPage.handle('add-play', { dataset: {} }, makeCtx(state));
  inputs.restore();
  assert.equal(logic.weekMinutes(state.games.plays, TODAY), 90);
  assert.equal(logic.todayMinutes(state.games.plays, TODAY), 90);
  assert.equal(logic.minutesForGame(state.games.plays, 'g1'), 90);
});

test('快捷 +30 分钟落在今天', () => {
  const state = makeState();
  state.games.library = [{ id: 'g1', name: 'Raft', status: 'playing' }];
  gamesPage.handle('quick-play', { dataset: { id: 'g1' } }, makeCtx(state));
  assert.equal(state.games.plays[0].minutes, 30);
  assert.equal(state.games.plays[0].date, TODAY);
});

test('想玩清单可切状态、可转游戏库', () => {
  const state = makeState();
  const inputs = stubInputs({ 'wish-title': 'Raft' });
  gamesPage.handle('add-wish', { dataset: {} }, makeCtx(state));
  inputs.restore();
  const wish = state.games.watchlist[0];
  assert.equal(wish.status, 'todo');
  gamesPage.handle('wish-status', { dataset: { id: wish.id } }, makeCtx(state));
  assert.equal(state.games.watchlist[0].status, 'watching');
  gamesPage.handle('wish-to-lib', { dataset: { id: wish.id } }, makeCtx(state));
  assert.equal(state.games.library.length, 1);
  assert.equal(state.games.library[0].name, 'Raft');
  assert.equal(state.games.watchlist.length, 0);
});

test('超出每周额度会被识别', () => {
  const state = makeState();
  state.settings.entertainmentWeeklyLimit = 2;
  state.games.plays = [{ id: 'p1', gameId: 'g1', date: TODAY, minutes: 180 }];
  const html = gamesPage.render(makeCtx(state));
  assert.match(html, /超/);
});
