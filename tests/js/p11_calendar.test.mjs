// P11：健身 / 饮食月历——月网格、日状态、动作解析、餐次显示
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);

const schema = await load('schema.js');
const calendar = await load('calendar.js');
const fitnessPage = await load('pages/fitness.js');
const dietPage = await load('pages/diet.js');

const TODAY = '2026-11-15';

function makeState() { return schema.defaultDoc(); }
function makeCtx(state) {
  return {
    state, today: () => TODAY,
    mutate(fn) { fn(state); },
    refresh() {}, toast() {}, undo() {}, navigate() {},
  };
}

test('月网格从周一开始，前后补空格，2026 年 2 月是 28 天', () => {
  const grid = calendar.monthGrid('2026-02', TODAY);
  assert.equal(grid.label, '2026 年 2 月');
  assert.equal(grid.cells.length, 35, '6 个前导空格 + 28 天 + 1 个尾随空格');
  assert.equal(grid.cells.filter((cell) => cell.blank).length, 7);
  assert.equal(grid.cells.filter((cell) => !cell.blank).length, 28);
  assert.equal(grid.cells[6].date, '2026-02-01');
  assert.equal(grid.cells[6].day, 1);
});

test('月份切换能跨年，标签正确', () => {
  assert.equal(calendar.shiftMonth('2026-11', 1), '2026-12');
  assert.equal(calendar.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(calendar.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(calendar.monthLabel('2026-11'), '2026 年 11 月');
  assert.equal(calendar.monthOf('2026-11-15'), '2026-11');
});

test('健身日状态：练了 / 主动没练 / 没记 / 未来分开', () => {
  const sessions = [{ id: 's', date: '2026-11-10' }];
  const restDays = [{ id: 'r', date: '2026-11-11' }];
  assert.equal(calendar.fitnessDayStatus('2026-11-10', sessions, restDays, TODAY), 'train');
  assert.equal(calendar.fitnessDayStatus('2026-11-11', sessions, restDays, TODAY), 'rest');
  assert.equal(calendar.fitnessDayStatus('2026-11-12', sessions, restDays, TODAY), 'missing');
  assert.equal(calendar.fitnessDayStatus('2026-11-20', sessions, restDays, TODAY), 'future');
});

test('饮食日状态：有餐 / 明确没吃 / 没记 / 未来分开', () => {
  const meals = [{ id: 'm', date: '2026-11-10' }];
  const daily = [{ date: '2026-11-11', noMeal: true }];
  assert.equal(calendar.dietDayStatus('2026-11-10', meals, daily, TODAY), 'meals');
  assert.equal(calendar.dietDayStatus('2026-11-11', meals, daily, TODAY), 'noMeal');
  assert.equal(calendar.dietDayStatus('2026-11-12', meals, daily, TODAY), 'missing');
  assert.equal(calendar.dietDayStatus('2026-11-20', meals, daily, TODAY), 'future');
});

test('动作行解析：支持 × / x / 组次 / kg，格式错误要报行号', () => {
  const parsed = calendar.parseExerciseLines('卧推 4×10\n飞鸟 3x12 8kg\n深蹲 4组×8次');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.exercises.map((item) => [item.name, item.sets, item.reps, item.weight]), [
    ['卧推', 4, 10, 0], ['飞鸟', 3, 12, 8], ['深蹲', 4, 8, 0],
  ]);
  const bad = calendar.parseExerciseLines('卧推 4×10\n随便写');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /第 2 行/);
  assert.deepEqual(calendar.parseExerciseLines('').exercises, []);
});

test('动作摘要最多显示两条，多出的折叠', () => {
  const summary = calendar.exerciseSummary([
    { name: '卧推', sets: 4, reps: 10 },
    { name: '飞鸟', sets: 3, reps: 12 },
    { name: '臂屈伸', sets: 3, reps: 12 },
  ], 2);
  assert.equal(summary, '卧推 4×10 · 飞鸟 3×12 · 另 1 个');
});

test('健身月历格显示部位、动作、组数×次数，没练与没记分开', () => {
  fitnessPage.setFitnessMonth('2026-11');
  const state = makeState();
  state.fitness.sessions = [{
    id: 's1', date: '2026-11-10', type: '胸 + 三头',
    exercises: [{ name: '卧推', sets: 4, reps: 10 }, { name: '飞鸟', sets: 3, reps: 12 }],
  }];
  state.fitness.restDays = [{ id: 'r1', date: '2026-11-11' }];
  const html = fitnessPage.render(makeCtx(state));
  assert.match(html, /训练月历/);
  assert.match(html, /2026 年 11 月/);
  assert.match(html, /胸 \+ 三头/);
  assert.match(html, /卧推 4×10 · 飞鸟 3×12/);
  assert.match(html, /cal-status rest">没练/);
  assert.match(html, /cal-status missing">没记/);
  assert.match(html, /训练 <b class="num">1<\/b> 天/);
  assert.match(html, /没练 <b class="num">1<\/b> 天/);
  assert.match(html, /data-action="open-fit-day" data-date="2026-11-10"/);
});

test('饮食月历格显示餐次内容，没吃与没记分开', () => {
  dietPage.setDietMonth('2026-11');
  const state = makeState();
  state.diet.meals = [
    { id: 'm1', date: '2026-11-10', slot: 'breakfast', name: '鸡蛋', kcal: 80 },
    { id: 'm2', date: '2026-11-10', slot: 'breakfast', name: '牛奶', kcal: 120 },
    { id: 'm3', date: '2026-11-10', slot: 'lunch', name: '米饭', kcal: 300 },
  ];
  state.diet.daily = [{ date: '2026-11-11', noMeal: true, waterCups: 2 }];
  const html = dietPage.render(makeCtx(state));
  assert.match(html, /饮食月历/);
  assert.match(html, /早 鸡蛋、牛奶 · 午 米饭/);
  assert.match(html, /cal-status noMeal">没吃/);
  assert.match(html, /cal-status missing">没记/);
  assert.match(html, /有记录 <b class="num">1<\/b> 天/);
  assert.match(html, /没吃 <b class="num">1<\/b> 天/);
  assert.match(html, /data-action="open-diet-day" data-date="2026-11-10"/);
});

test('月份按钮切到下个月，数据页跟着换月', () => {
  fitnessPage.setFitnessMonth('2026-10');
  const state = makeState();
  const ctx = makeCtx(state);
  fitnessPage.handle('fit-month-next', { dataset: {} }, ctx);
  const html = fitnessPage.render(ctx);
  assert.match(html, /2026 年 11 月/);

  dietPage.setDietMonth('2026-10');
  dietPage.handle('diet-month-next', { dataset: {} }, ctx);
  assert.match(dietPage.render(ctx), /2026 年 11 月/);
});

test('旧健身数据没有 restDays 时，规范化会补空数组', () => {
  const doc = schema.defaultDoc();
  doc.fitness = { weekTemplate: [], sessions: [], body: [], exerciseLib: [] };
  const normalized = schema.normalizeDoc(doc);
  assert.deepEqual(normalized.fitness.restDays, []);
});
