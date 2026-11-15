// 饮食计划：今日三餐 + 食物库 + 饮水 + 外食记录

import { todayStr, uid, isoNow } from '../schema.js';
import { MEAL_SLOTS, kcalOf, mealsBySlot, outsideThisWeek, waterOf } from '../logic.js';
import {
  WEEKDAY_LABELS, dietDayStatus, monthGrid, monthOf, shiftMonth,
} from '../calendar.js';
import { card, dom, empty, esc, openFormModal, progress, tag } from '../ui.js';

export const meta = { id: 'diet', title: '饮食计划', icon: '🍱' };

let dietMonth = null;

export function setDietMonth(month) { dietMonth = month; }
export function resetDietMonth() { dietMonth = null; }

function suggestSlot() {
  const hour = new Date().getHours();
  if (hour < 9) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 20) return 'dinner';
  return 'night';
}

function todayMeals(state) {
  const today = todayStr();
  const bySlot = mealsBySlot(state.diet.meals, today);
  const filled = MEAL_SLOTS.filter((slot) => bySlot[slot.key].length);
  if (!filled.length) return empty('今天还没记吃的。吃了就记，别等晚上补');
  return MEAL_SLOTS.filter((slot) => bySlot[slot.key].length).map((slot) => `
    <div class="row" style="align-items:flex-start">
      <span class="row-meta" style="min-width:58px"><b>${slot.label}</b><span class="faint">${slot.time}</span></span>
      <div class="stack grow" style="gap:4px">
        ${bySlot[slot.key].map((meal) => `
          <div class="hstack">
            <span class="grow">${esc(meal.name)}${meal.amount ? ` <span class="faint">${esc(meal.amount)}</span>` : ''}</span>
            <span class="num">${meal.kcal || 0} kcal</span>
            <button class="btn small danger" data-action="del-meal" data-id="${esc(meal.id)}">✕</button>
          </div>`).join('')}
      </div>
      <span class="num faint">${bySlot[slot.key].reduce((sum, meal) => sum + (Number(meal.kcal) || 0), 0)}</span>
    </div>`).join('');
}

function dietCalendar(state, today) {
  const month = dietMonth || monthOf(today);
  const grid = monthGrid(month, today);
  const dailyByDate = new Map(state.diet.daily.map((item) => [item.date, item]));
  let recorded = 0;
  let noMeal = 0;
  let missing = 0;
  const cells = grid.cells.map((cell) => {
    if (cell.blank) return '<div class="cal-cell blank" aria-hidden="true"></div>';
    const meals = state.diet.meals.filter((meal) => meal.date === cell.date);
    const status = dietDayStatus(cell.date, meals, state.diet.daily, today);
    if (status === 'meals') recorded += 1;
    if (status === 'noMeal') noMeal += 1;
    if (status === 'missing') missing += 1;
    const bySlot = mealsBySlot(meals, cell.date);
    const text = MEAL_SLOTS.filter((slot) => bySlot[slot.key].length)
      .map((slot) => `${slot.label.replace('餐', '')} ${bySlot[slot.key].map((meal) => meal.name).join('、')}`)
      .join(' · ');
    const body = status === 'meals'
      ? `<span class="cal-meals">${esc(text)}</span>`
      : status === 'noMeal'
        ? '<span class="cal-status noMeal">没吃</span>'
        : status === 'missing'
          ? '<span class="cal-status missing">没记</span>'
          : '<span class="cal-status future">—</span>';
    return `
      <button class="cal-cell ${status} ${cell.isToday ? 'today' : ''}" data-action="open-diet-day" data-date="${esc(cell.date)}" title="${esc(cell.date)}${text ? ` · ${text}` : ''} 点击编辑">
        <span class="cal-daynum">${cell.day}</span>
        ${body}
      </button>`;
  }).join('');

  return `
    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">饮食月历</div>
        <span class="card-sub">每格显示餐次内容</span>
        <div class="card-actions">
          <button class="btn small" data-action="diet-month-prev">‹</button>
          <b class="mono">${esc(grid.label)}</b>
          <button class="btn small" data-action="diet-month-next">›</button>
          <button class="btn small ghost" data-action="diet-month-today">本月</button>
        </div>
      </div>
      <div class="card-body">
        <div class="hstack cal-summary">
          <span class="stat-inline">有记录 <b class="num">${recorded}</b> 天</span>
          <span class="stat-inline">没吃 <b class="num">${noMeal}</b> 天</span>
          <span class="stat-inline">没记 <b class="num">${missing}</b> 天</span>
          <span class="spacer"></span>
          <span class="cal-legend"><i class="meals"></i>有餐 <i class="noMeal"></i>没吃 <i class="missing"></i>没记</span>
        </div>
        <div class="calendar">
          <div class="cal-weekdays">${WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join('')}</div>
          <div class="cal-grid">${cells}</div>
        </div>
      </div>
    </section>`;
}

function openDietDay(date, ctx) {
  const state = ctx.state;
  const meals = state.diet.meals.filter((meal) => meal.date === date);
  const daily = state.diet.daily.find((item) => item.date === date) || {};
  const existing = meals.length
    ? meals.map((meal) => `<div class="hstack"><span>${esc(MEAL_SLOTS.find((slot) => slot.key === meal.slot)?.label || '一餐')} · ${esc(meal.name)}</span><span class="num faint">${meal.kcal || 0} kcal</span></div>`).join('')
    : '<div class="faint">这天还没有餐次记录</div>';
  openFormModal({
    title: `${date} · 饮食记录`,
    submitLabel: '保存这一天',
    body: `
      <div class="field"><label for="dd-mode">这天状态</label>
        <select class="input" id="dd-mode">
          <option value="record">记一餐 / 改饮水</option>
          <option value="noMeal" ${daily.noMeal ? 'selected' : ''}>没吃（明确标记）</option>
          <option value="none">清除这一天的记录</option>
        </select>
      </div>
      <div class="existing-meals">${existing}</div>
      <div class="grid cols-2">
        <div class="field"><label for="dd-slot">餐次</label>
          <select class="input" id="dd-slot">${MEAL_SLOTS.map((slot) => `<option value="${slot.key}">${slot.label}</option>`).join('')}</select></div>
        <div class="field"><label for="dd-kcal">热量 kcal</label>
          <input class="input" id="dd-kcal" type="number" min="0" placeholder="可空"></div>
      </div>
      <div class="grid cols-2">
        <div class="field"><label for="dd-name">这餐吃了什么</label>
          <input class="input" id="dd-name" placeholder="鸡蛋、牛奶"></div>
        <div class="field"><label for="dd-amount">份量</label>
          <input class="input" id="dd-amount" placeholder="2 个 / 300g"></div>
      </div>
      <div class="grid cols-2">
        <div class="field"><label for="dd-water">饮水杯数</label>
          <input class="input" id="dd-water" type="number" min="0" value="${Number(daily.waterCups) || 0}"></div>
        <div class="field"><label for="dd-outside">外食次数 / 花费</label>
          <div class="hstack">
            <input class="input mini" id="dd-outside" type="number" min="0" value="${Number(daily.outsideCount) || 0}" style="width:70px">
            <input class="input mini" id="dd-spend" type="number" min="0" value="${Number(daily.outsideSpend) || 0}" style="width:88px">
          </div>
        </div>
      </div>
      <div class="field"><label for="dd-note">当天感觉</label>
        <input class="input" id="dd-note" value="${esc(daily.note || '')}" placeholder="饿不饿、有没有乱吃"></div>
      <p class="faint">选「没吃」会删掉这天已有餐次，并留下明确标记；什么都不记才是「没记」。</p>`,
    onSubmit: ({ close, setError }) => {
      const mode = dom('dd-mode')?.value || 'record';
      if (mode === 'none') {
        ctx.mutate((doc) => {
          doc.diet.meals = doc.diet.meals.filter((meal) => meal.date !== date);
          doc.diet.daily = doc.diet.daily.filter((item) => item.date !== date);
        });
        close();
        ctx.toast('已清除这一天的饮食记录');
        return true;
      }
      if (mode === 'noMeal') {
        ctx.mutate((doc) => {
          doc.diet.meals = doc.diet.meals.filter((meal) => meal.date !== date);
          let record = doc.diet.daily.find((item) => item.date === date);
          if (!record) {
            record = { date, waterCups: 0, outsideCount: 0, outsideSpend: 0, note: '' };
            doc.diet.daily.push(record);
          }
          record.noMeal = true;
        });
        close();
        ctx.toast('已标记为没吃');
        return true;
      }

      const name = String(dom('dd-name')?.value || '').trim();
      const kcal = Number(dom('dd-kcal')?.value || 0);
      if (!name && !meals.length && !Number(dom('dd-water')?.value || 0)) {
        setError('至少写一餐，或者标记「没吃」');
        return false;
      }
      ctx.mutate((doc) => {
        let record = doc.diet.daily.find((item) => item.date === date);
        if (!record) {
          record = { date, waterCups: 0, outsideCount: 0, outsideSpend: 0, note: '' };
          doc.diet.daily.push(record);
        }
        record.waterCups = Math.max(0, Number(dom('dd-water')?.value || 0));
        record.outsideCount = Math.max(0, Number(dom('dd-outside')?.value || 0));
        record.outsideSpend = Math.max(0, Number(dom('dd-spend')?.value || 0));
        record.note = String(dom('dd-note')?.value || '');
        record.noMeal = false;
        if (name) {
          doc.diet.meals.push({
            id: uid('m'), date, slot: dom('dd-slot')?.value || 'lunch',
            name, amount: dom('dd-amount')?.value || '', kcal, createdAt: isoNow(),
          });
        }
      });
      close();
      ctx.toast('这一天已保存');
      return true;
    },
  });
}


function foodLibBlock(state) {
  if (!state.diet.foodLib.length) return empty('食物库空着。把常吃的、常查热量的记下来');
  return state.diet.foodLib.map((food) => `
    <div class="row">
      <span class="row-title">${esc(food.name)}</span>
      <span class="row-meta num">${food.kcal} kcal${food.per ? ` / ${esc(food.per)}` : ''}</span>
      <div class="row-actions">
        <button class="btn small" data-action="add-from-lib" data-id="${esc(food.id)}">＋ 今日</button>
        <button class="btn small danger" data-action="del-food" data-id="${esc(food.id)}">✕</button>
      </div>
    </div>`).join('');
}

function weekTable(state) {
  const daily = [...state.diet.daily].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 7);
  if (!daily.length) return empty('每天记一次，这周就有对照');
  return `
    <table class="table">
      <thead><tr><th>日期</th><th class="num">饮水</th><th class="num">外食</th><th class="num">外食花费</th><th>备注</th></tr></thead>
      <tbody>
        ${daily.map((record) => {
          const kcal = kcalOf(state.diet.meals.filter((meal) => meal.date === record.date));
          return `<tr>
            <td class="num">${esc(String(record.date).slice(5))}</td>
            <td class="num">${record.waterCups || 0} 杯${kcal ? ` · ${kcal} kcal` : ''}</td>
            <td class="num">${record.outsideCount || 0}</td>
            <td class="num">${record.outsideSpend || 0}</td>
            <td class="cut">${esc(record.note || '')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

export function render(ctx) {
  const state = ctx.state;
  const today = typeof ctx.today === 'function' ? ctx.today() : todayStr();
  const kcal = kcalOf(state.diet.meals.filter((meal) => meal.date === today));
  const goal = Number(state.settings.calorieGoal) || 2200;
  const cups = waterOf(state.diet.daily, today);
  const waterGoal = Number(state.settings.waterGoal) || 8;
  const outside = outsideThisWeek(state.diet.daily, today);
  const slot = suggestSlot();

  return `
    <div class="kpi-row">
      <div class="stat"><span class="stat-value num">${kcal}</span><span class="stat-label">今日摄入 / ${goal} kcal</span></div>
      <div class="stat"><span class="stat-value num">${cups}</span><span class="stat-label">喝水 / ${waterGoal} 杯</span></div>
      <div class="stat"><span class="stat-value num">${outside.count}</span><span class="stat-label">本周外食次数</span></div>
      <div class="stat"><span class="stat-value num">${outside.spend}</span><span class="stat-label">本周外食花费</span></div>
    </div>

    ${dietCalendar(state, today)}

    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">今日饮食</div>
        <div class="card-actions">
          <select class="input mini" id="diet-slot">
            ${MEAL_SLOTS.map((item) => `<option value="${item.key}" ${item.key === slot ? 'selected' : ''}>${item.label}</option>`).join('')}
          </select>
          <input class="input mini" id="diet-name" placeholder="吃了什么" style="width:170px" data-enter="1" data-enter-action="add-meal">
          <input class="input mini" id="diet-kcal" type="number" min="0" placeholder="kcal" style="width:80px" data-enter="1" data-enter-action="add-meal">
          <button class="btn small primary" data-action="add-meal">＋ 记一笔</button>
        </div>
      </div>
      <div class="stack">${todayMeals(state)}</div>
      <div class="sep"></div>
      <div class="hstack">
        <span class="faint">今日进度</span>
        ${progress(Math.min(100, Math.round((kcal / goal) * 100)))}
        <b class="num">${Math.max(0, goal - kcal)}</b><span class="faint">kcal 余量</span>
      </div>
    </section>

    <div class="grid cols-2 section-gap">
      ${card({
        title: '饮水',
        sub: `目标 ${waterGoal} 杯，一杯按 250ml`,
        body: `
          <div class="hstack" style="flex-wrap:wrap; gap:6px; margin-bottom:10px">
            ${Array.from({ length: waterGoal }, (_, index) => `<span class="water-dot ${index < cups ? 'on' : ''}"></span>`).join('')}
            <b class="num">${cups}/${waterGoal}</b>
          </div>
          <div class="hstack">
            <button class="btn small primary" data-action="water-plus">＋ 一杯</button>
            <button class="btn small" data-action="water-minus">− 一杯</button>
          </div>
          <div class="sep"></div>
          <div class="stack">
            <div class="field"><label>今天的外食</label>
              <div class="inline-form">
                <input class="input mini" id="outside-count" type="number" min="0" value="${Number(state.diet.daily.find((item) => item.date === today)?.outsideCount) || 0}" style="width:80px" data-change-action="daily-outside" data-field="outsideCount">
                <span class="faint">次</span>
                <input class="input mini" id="outside-spend" type="number" min="0" value="${Number(state.diet.daily.find((item) => item.date === today)?.outsideSpend) || 0}" style="width:96px" data-change-action="daily-outside" data-field="outsideSpend">
                <span class="faint">元</span>
              </div>
            </div>
            <div class="field"><label>今天的感觉</label>
              <input class="input" id="diet-note" value="${esc(state.diet.daily.find((item) => item.date === today)?.note || '')}" placeholder="饿不饿、有没有乱吃" data-change-action="daily-note">
            </div>
          </div>`,
      })}
      ${card({
        title: '食物库',
        sub: '常吃的先记热量，记一顿就快',
        body: `
          <div class="inline-form" style="margin-bottom:10px">
            <input class="input grow" id="food-name" placeholder="食物名，比如「鸡蛋」">
            <input class="input mini" id="food-kcal" type="number" min="0" placeholder="kcal" style="width:80px">
            <input class="input mini" id="food-per" placeholder="每 100g / 1 个" style="width:110px">
            <button class="btn small primary" data-action="add-food">＋</button>
          </div>
          <div class="stack">${foodLibBlock(state)}</div>`,
      })}
    </section>

    <section class="section-gap">
      ${card({ title: '这周记录', sub: '只给自己看，不做营养分析', body: weekTable(state) })}
    </section>`;
}

export function handle(action, el, ctx, value) {
  const state = ctx.state;
  const id = el?.dataset?.id;

  if (action === 'new') { dom('diet-name')?.focus(); return true; }

  if (action === 'diet-month-prev' || action === 'diet-month-next') {
    dietMonth = shiftMonth(dietMonth || monthOf(todayStr()), action === 'diet-month-prev' ? -1 : 1);
    ctx.refresh();
    return true;
  }

  if (action === 'diet-month-today') {
    dietMonth = null;
    ctx.refresh();
    return true;
  }

  if (action === 'open-diet-day') {
    const date = el?.dataset?.date;
    if (date) openDietDay(date, ctx);
    return true;
  }

  if (action === 'add-meal') {
    const nameInput = dom('diet-name');
    const name = String(value || nameInput?.value || '').trim();
    const kcal = Number(dom('diet-kcal')?.value || 0);
    if (!name) { ctx.toast('先写吃了什么'); return true; }
    ctx.mutate((doc) => {
      doc.diet.meals.push({
        id: uid('m'), date: todayStr(), slot: dom('diet-slot')?.value || 'lunch',
        name, amount: '', kcal, createdAt: isoNow(),
      });
    });
    if (nameInput) nameInput.value = '';
    const kcalInput = dom('diet-kcal');
    if (kcalInput) kcalInput.value = '';
    return true;
  }

  if (action === 'add-from-lib') {
    const food = state.diet.foodLib.find((item) => item.id === id);
    if (!food) return true;
    ctx.mutate((doc) => {
      doc.diet.meals.push({
        id: uid('m'), date: todayStr(), slot: dom('diet-slot')?.value || suggestSlot(),
        name: food.name, amount: food.per || '', kcal: Number(food.kcal) || 0, createdAt: isoNow(),
      });
    });
    ctx.toast(`已加入今日：${food.name}`);
    return true;
  }

  if (action === 'del-meal') {
    ctx.mutate((doc) => {
      const index = doc.diet.meals.findIndex((item) => item.id === id);
      if (index >= 0) doc.diet.meals.splice(index, 1);
    });
    return true;
  }

  if (action === 'add-food') {
    const name = String(dom('food-name')?.value || '').trim();
    const kcal = Number(dom('food-kcal')?.value || 0);
    if (!name || !kcal) { ctx.toast('食物名和热量都要填'); return true; }
    ctx.mutate((doc) => {
      doc.diet.foodLib.push({ id: uid('f'), name, kcal, per: dom('food-per')?.value || '' });
    });
    const nameInput = dom('food-name');
    if (nameInput) nameInput.value = '';
    const kcalInput = dom('food-kcal');
    if (kcalInput) kcalInput.value = '';
    return true;
  }

  if (action === 'del-food') {
    ctx.mutate((doc) => {
      const index = doc.diet.foodLib.findIndex((item) => item.id === id);
      if (index >= 0) doc.diet.foodLib.splice(index, 1);
    });
    return true;
  }

  if (action === 'water-plus' || action === 'water-minus') {
    ctx.mutate((doc) => {
      let record = doc.diet.daily.find((item) => item.date === todayStr());
      if (!record) {
        record = { date: todayStr(), waterCups: 0, outsideCount: 0, outsideSpend: 0, note: '' };
        doc.diet.daily.push(record);
      }
      record.waterCups = Math.max(0, (Number(record.waterCups) || 0) + (action === 'water-plus' ? 1 : -1));
    });
    return true;
  }

  if (action === 'daily-outside' || action === 'daily-note') {
    const field = action === 'daily-note' ? 'note' : el.dataset.field;
    ctx.mutate((doc) => {
      let record = doc.diet.daily.find((item) => item.date === todayStr());
      if (!record) {
        record = { date: todayStr(), waterCups: 0, outsideCount: 0, outsideSpend: 0, note: '' };
        doc.diet.daily.push(record);
      }
      record[field] = field === 'note' ? String(el.value || '') : Number(el.value) || 0;
    });
    return true;
  }

  return false;
}
