// 月历工具：月份计算、七列网格、健身/饮食的日状态与动作解析（纯函数）

import { todayStr } from './schema.js';

export function monthOf(date) {
  return String(date || '').slice(0, 7);
}

export function monthLabel(month) {
  const [year, value] = String(month).split('-');
  return `${year} 年 ${Number(value)} 月`;
}

export function shiftMonth(month, delta) {
  const [year, value] = String(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + Number(delta || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(month) {
  const [year, value] = String(month).split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

/** 生成周一到周日的月历格子；前后补空格，保证每行 7 格。 */
export function monthGrid(month, today = todayStr()) {
  const [year, value] = String(month).split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(year, value - 1, 1)).getUTCDay() + 6) % 7;
  const total = daysInMonth(month);
  const cells = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push({ blank: true });
  for (let day = 1; day <= total; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ blank: false, date, day, isToday: date === today, isFuture: date > today });
  }
  while (cells.length % 7 !== 0) cells.push({ blank: true });
  return { month, label: monthLabel(month), cells };
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function fitnessDayStatus(date, sessions = [], restDays = [], today = todayStr()) {
  if (date > today) return 'future';
  if ((sessions || []).some((session) => session.date === date)) return 'train';
  if ((restDays || []).some((item) => (typeof item === 'string' ? item === date : item.date === date))) return 'rest';
  return 'missing';
}

export function dietDayStatus(date, meals = [], daily = [], today = todayStr()) {
  if (date > today) return 'future';
  if ((meals || []).some((meal) => meal.date === date)) return 'meals';
  const record = (daily || []).find((item) => item.date === date);
  if (record?.noMeal) return 'noMeal';
  return 'missing';
}

/** 一行一个动作：卧推 4×10，可选 60kg；也接受 4组x10次 的写法。 */
export function parseExerciseLines(text = '') {
  const exercises = [];
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(.+?)\s+(\d+)\s*(?:组)?\s*[×xX*]\s*(\d+)\s*(?:次)?(?:\s*(?:·|,|，)?\s*(\d+(?:\.\d+)?)\s*kg)?$/);
    if (!match) return { ok: false, error: `第 ${index + 1} 行动作格式不对，写成「卧推 4×10」` };
    exercises.push({
      name: match[1].trim(),
      sets: Number(match[2]),
      reps: Number(match[3]),
      weight: match[4] ? Number(match[4]) : 0,
      doneSets: 0,
    });
  }
  return { ok: true, exercises };
}

export function exerciseSummary(exercises = [], limit = 2) {
  const list = (exercises || []).slice(0, limit).map((exercise) => `${exercise.name} ${exercise.sets || 0}×${exercise.reps || 0}`);
  const rest = (exercises || []).length - list.length;
  return `${list.join(' · ')}${rest > 0 ? ` · 另 ${rest} 个` : ''}`;
}
