// 今日计划：日期切换、优先级分组、勾选、顺延处理、当日复盘

import { addDays, formatCn, isoNow, todayStr, uid } from '../schema.js';
import { MODULE_TAGS, PRIORITIES, groupTasks, taskStats } from '../logic.js';
import { card, dom, empty, esc, progress, tag } from '../ui.js';

export const meta = { id: 'tasks', title: '今日计划', icon: '📅' };

let viewDate = todayStr();
let editingId = null;
let showDone = false;

function moduleLabel(key) {
  return MODULE_TAGS.find((item) => item.key === (key || ''))?.label || '';
}

function taskRow(task, { carried = false } = {}) {
  const done = !!task.done;
  const editing = editingId === task.id;
  const moduleName = moduleLabel(task.moduleTag);
  return `
    <div class="row" data-item-id="${esc(task.id)}">
      <button class="check ${done ? 'on' : ''}" data-action="toggle" data-id="${esc(task.id)}" title="勾选完成">✓</button>
      ${editing
        ? `<input class="input mini grow" data-focus-key="edit-${esc(task.id)}" data-autofocus="1" data-change-action="commit-edit" data-enter="1" data-enter-action="commit-edit" data-id="${esc(task.id)}" value="${esc(task.title)}">`
        : `<span class="row-title ${done ? 'done' : ''}" data-action="edit" data-id="${esc(task.id)}">${esc(task.title)}</span>`}
      <span class="row-meta">
        ${carried ? tag('顺延自昨天', 'warn') : ''}
        ${moduleName ? tag(moduleName, '') : ''}
        ${task.estMinutes ? `<span class="num">${esc(task.estMinutes)}m</span>` : ''}
      </span>
      <div class="row-actions">
        ${carried
          ? `<button class="btn small" data-action="carry-accept" data-id="${esc(task.id)}">今天做</button>
             <button class="btn small" data-action="carry-drop" data-id="${esc(task.id)}">放弃</button>`
          : `<button class="btn small" data-action="cycle-priority" data-id="${esc(task.id)}" title="切换优先级">⇅</button>
             <button class="btn small" data-action="tomorrow" data-id="${esc(task.id)}" title="移到明天">→明</button>
             <button class="btn small danger" data-action="del" data-id="${esc(task.id)}" title="删除">✕</button>`}
      </div>
    </div>`;
}

export function render(ctx) {
  const state = ctx.state;
  const all = state.tasks.filter((task) => task.date === viewDate && !task.abandoned);
  const carried = all.filter((task) => task.carriedFrom && all.length && !task.done);
  const normal = all.filter((task) => !task.carriedFrom);
  const groups = groupTasks(normal);
  const stats = taskStats(all);
  const doneList = all.filter((task) => task.done);
  const review = state.reviews.find((item) => item.date === viewDate);
  const isToday = viewDate === todayStr();

  const groupHtml = PRIORITIES.map((priority) => {
    const list = groups[priority.key];
    if (!list.length) return '';
    return `
      <div class="task-group">
        <div class="task-group-title">${esc(priority.label)}<span class="faint">· ${list.length} 件</span></div>
        ${list.map((task) => taskRow(task)).join('')}
      </div>`;
  }).join('');

  return `
    <section class="task-head">
      <div class="hstack">
        <button class="btn" data-action="prev-day">‹</button>
        <span class="page-date">${esc(formatCn(viewDate))}${isToday ? tag('今天', 'accent') : ''}</span>
        <button class="btn" data-action="next-day">›</button>
        ${isToday ? '' : '<button class="btn ghost" data-action="today">回到今天</button>'}
      </div>
      <div class="spacer"></div>
      <span class="stat-inline"><b class="num">${stats.done}/${stats.total}</b> 完成</span>
      <div style="width:140px">${progress(stats.pct)}</div>
      ${stats.total ? '<button class="btn small danger" data-action="clear-day">清空这天</button>' : ''}
    </section>

    <section class="card task-addbar">
      <input class="input grow" id="task-title" placeholder="加一条任务，回车创建…" data-enter="1" data-enter-action="add" data-focus-key="add-title">
      <select class="input mini" id="task-priority">
        ${PRIORITIES.map((item) => `<option value="${item.key}" ${item.key === 'p2' ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}
      </select>
      <select class="input mini" id="task-module">
        ${MODULE_TAGS.map((item) => `<option value="${item.key}">${esc(item.label)}</option>`).join('')}
      </select>
      <input class="input mini" id="task-minutes" type="number" min="0" step="5" placeholder="分钟" style="width:78px">
      <button class="btn primary" data-action="add">＋ 添加</button>
    </section>

    ${carried.length ? `
      <section class="card">
        <div class="card-head"><div class="card-title">顺延自昨天 <span class="card-sub">（${carried.length} 件）</span></div></div>
        ${carried.map((task) => taskRow(task, { carried: true })).join('')}
      </section>` : ''}

    <section class="card">
      ${groupHtml || empty(isToday ? '今天还没排任务，先写三件最要紧的' : '这天没有任务', '照昨天再来一份', 'copy-yesterday')}
    </section>

    ${doneList.length ? `
      <section class="card done-block">
        <div class="card-head">
          <button class="btn small" data-action="toggle-done">${showDone ? '收起' : '展开'} 已完成 ${doneList.length} 件</button>
        </div>
        ${showDone ? doneList.map((task) => taskRow(task)).join('') : ''}
      </section>` : ''}

    <section class="card section-gap">
      <div class="card-head"><div class="card-title">当日复盘</div><span class="card-sub">一句话就够</span></div>
      <textarea class="input" rows="2" data-change-action="save-review" data-date="${esc(viewDate)}"
        placeholder="今天最想说的一句…">${esc(review?.text || '')}</textarea>
      ${state.reviews.filter((item) => item.date !== viewDate).slice(-3).reverse().map((item) => `
        <div class="tl-item"><span class="tl-date">${esc(item.date.slice(5))}</span><span class="tl-text">${esc(item.text)}</span></div>
      `).join('')}
    </section>`;
}

function readAddForm(el) {
  const bar = (typeof document === 'undefined') ? null : (el.closest('.task-addbar') || document.querySelector('.task-addbar'));
  return {
    title: (dom('task-title')?.value || '').trim(),
    priority: dom('task-priority')?.value || 'p2',
    moduleTag: dom('task-module')?.value || '',
    estMinutes: Number(dom('task-minutes')?.value || 0) || null,
  };
}

export function handle(action, el, ctx, value) {
  const id = el?.dataset?.id;

  if (action === 'clear-day') {
    ctx.confirmTyped({
      title: `清空 ${viewDate} 的任务？`,
      text: '这一天的任务会全部删除。清空前会自动备份一份当前数据，后悔可以从备份恢复。',
      word: '确认删除',
      confirmLabel: '清空',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      const backup = await ctx.api.backup();
      if (!backup.ok) { ctx.toast('清空前备份失败，已中止'); return; }
      ctx.mutate((doc) => {
        doc.tasks = doc.tasks.filter((task) => task.date !== viewDate);
      }, { undo: true });
      ctx.toast('已清空，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    });
    return true;
  }

  if (action === 'new') {
    dom('task-title')?.focus();
    return true;
  }
  if (action === 'prev-day') { viewDate = addDays(viewDate, -1); editingId = null; ctx.refresh(); return true; }
  if (action === 'next-day') { viewDate = addDays(viewDate, 1); editingId = null; ctx.refresh(); return true; }
  if (action === 'today') { viewDate = todayStr(); editingId = null; ctx.refresh(); return true; }

  if (action === 'add') {
    const form = readAddForm(el);
    if (!form.title) {
      ctx.toast('先写任务标题');
      return true;
    }
    ctx.mutate((doc) => {
      doc.tasks.push({
        id: uid('t'), title: form.title, date: viewDate, priority: form.priority,
        done: false, doneAt: null, moduleTag: form.moduleTag, estMinutes: form.estMinutes,
        note: '', carriedFrom: null, createdAt: isoNow(),
      });
    });
    const titleInput = dom('task-title');
    if (titleInput) titleInput.value = '';
    editingId = null;
    return true;
  }

  if (action === 'toggle') {
    ctx.mutate((doc) => {
      const task = doc.tasks.find((item) => item.id === id);
      if (!task) return;
      task.done = !task.done;
      task.doneAt = task.done ? isoNow() : null;
    });
    return true;
  }

  if (action === 'edit') { editingId = id; ctx.refresh(); return true; }

  if (action === 'commit-edit') {
    const text = String(value || '').trim();
    editingId = null;
    if (text) {
      ctx.mutate((doc) => {
        const task = doc.tasks.find((item) => item.id === id);
        if (task) task.title = text;
      });
    } else {
      ctx.refresh();
    }
    return true;
  }

  if (action === 'cycle-priority') {
    ctx.mutate((doc) => {
      const task = doc.tasks.find((item) => item.id === id);
      if (!task) return;
      const keys = ['p2', 'p1', 'p0'];
      const index = keys.indexOf(task.priority);
      task.priority = keys[(index + 1) % keys.length];
    });
    return true;
  }

  if (action === 'tomorrow') {
    ctx.mutate((doc) => {
      const task = doc.tasks.find((item) => item.id === id);
      if (task) task.date = addDays(viewDate, 1);
    });
    ctx.toast('已移到明天');
    return true;
  }

  if (action === 'del') {
    ctx.mutate((doc) => {
      const index = doc.tasks.findIndex((item) => item.id === id);
      if (index >= 0) doc.tasks.splice(index, 1);
    }, { undo: true });
    ctx.toast('已删除，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    return true;
  }

  if (action === 'carry-accept' || action === 'carry-drop') {
    ctx.mutate((doc) => {
      const task = doc.tasks.find((item) => item.id === id);
      if (!task) return;
      if (action === 'carry-drop') task.abandoned = true;
      else task.carriedFrom = null;
    });
    return true;
  }

  if (action === 'toggle-done') { showDone = !showDone; ctx.refresh(); return true; }

  if (action === 'copy-yesterday') {
    const yesterday = addDays(viewDate, -1);
    const source = ctx.state.tasks.filter((task) => task.date === yesterday && !task.abandoned);
    if (!source.length) { ctx.toast('昨天没有任务可以复制'); return true; }
    ctx.mutate((doc) => {
      source.forEach((task) => {
        doc.tasks.push({ ...task, id: uid('t'), date: viewDate, done: false, doneAt: null, carriedFrom: null });
      });
    });
    ctx.toast(`已从昨天复制 ${source.length} 件`);
    return true;
  }

  if (action === 'save-review') {
    const text = String(value || '').trim();
    if (!text) return true;
    ctx.mutate((doc) => {
      const existing = doc.reviews.find((item) => item.date === el.dataset.date);
      if (existing) existing.text = text;
      else doc.reviews.push({ id: uid('r'), date: el.dataset.date, text, updatedAt: isoNow() });
    });
    return true;
  }

  return false;
}
