// 健身计划：本周训练模板 + 打卡记录 + 体重围度 + 动作库

import { isoNow, todayStr, uid } from '../schema.js';
import {
  blankWeekTemplate, latestBody, sessionDone, streakDays, templateFor, weekSessions, weekdayIndex,
} from '../logic.js';
import { card, dom, empty, esc, openDrawer, progress, tag } from '../ui.js';

export const meta = { id: 'fitness', title: '健身计划', icon: '🏋️' };

const WEEK_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function ensureTemplate(state) {
  return state.fitness.weekTemplate.length ? state.fitness.weekTemplate : blankWeekTemplate();
}

function templateRows(state, today) {
  const template = ensureTemplate(state);
  const todayIndex = weekdayIndex(today);
  return `
    <div class="stack">
      ${template.map((item) => {
        const lib = (state.fitness.exerciseLib || []).filter((exercise) => (item.exerciseIds || []).includes(exercise.id));
        return `
          <div class="row ${Number(item.day) === todayIndex ? 'today' : ''}" style="flex-wrap:wrap">
            <span class="row-meta" style="min-width:46px"><b>${WEEK_NAMES[Number(item.day)] || ''}</b></span>
            <input class="input grow" data-change-action="template-part" data-day="${item.day}" value="${esc(item.part || '')}" placeholder="练什么，比如「胸 + 三头」或「休息」">
            <input class="input grow" data-change-action="template-names" data-day="${item.day}" value="${esc(item.exerciseNames || lib.map((exercise) => exercise.name).join('、'))}" placeholder="动作，用顿号分开">
            ${Number(item.day) === todayIndex ? '<span class="tag accent">今天</span>' : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function sessionRows(state) {
  const sessions = [...state.fitness.sessions].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!sessions.length) return empty('还没打过卡。今天练完记一笔');
  return sessions.slice(0, 10).map((session) => `
    <div class="row" data-item-id="${esc(session.id)}">
      <span class="row-meta num" style="min-width:64px">${esc(String(session.date).slice(5))}</span>
      <span class="row-title">${esc(session.type || '训练')}</span>
      <span class="row-meta faint">${session.durationMin ? `${session.durationMin} 分钟` : ''}${session.feel ? ` · ${esc(session.feel)}` : ''}</span>
      <div class="row-actions">
        <button class="btn small" data-action="open-session" data-id="${esc(session.id)}">明细</button>
        <button class="btn small danger" data-action="del-session" data-id="${esc(session.id)}">✕</button>
      </div>
    </div>`).join('');
}

function bodyRows(state) {
  const body = [...state.fitness.body].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const info = latestBody(state.fitness.body);
  if (!body.length) return empty('记一次体重，之后就能看变化');
  return `
    <div class="hstack" style="margin-bottom:8px">
      <span class="faint">最新</span><b class="num">${info.latest ? `${info.latest.weight} kg` : '—'}</b>
      ${info.delta.weight != null ? `<span class="${info.delta.weight < 0 ? 'up' : info.delta.weight > 0 ? 'down' : 'faint'}">较上次 ${info.delta.weight > 0 ? '+' : ''}${info.delta.weight.toFixed(1)} kg</span>` : ''}
    </div>
    ${body.slice(0, 6).map((record) => `
      <div class="row">
        <span class="row-meta num" style="min-width:64px">${esc(String(record.date).slice(5))}</span>
        <span class="row-title num">${record.weight} kg</span>
        <span class="row-meta faint">${record.bodyFat ? `体脂 ${record.bodyFat}%` : ''}${record.waist ? ` 腰 ${record.waist}` : ''}</span>
        <div class="row-actions"><button class="btn small danger" data-action="del-body" data-id="${esc(record.id)}">✕</button></div>
      </div>`).join('')}`;
}

function exerciseLib(state, filterText = '') {
  const list = state.fitness.exerciseLib.filter((exercise) => {
    if (!filterText) return true;
    return `${exercise.name}${exercise.part}`.includes(filterText);
  });
  if (!list.length) return empty('动作库空着。先把常练的几个记进去');
  return list.map((exercise) => `
    <div class="row" data-item-id="${esc(exercise.id)}">
      <span class="row-title">${esc(exercise.name)}</span>
      <span class="row-meta">${tag(exercise.part || '未分部位', '')}</span>
      <span class="row-meta faint cut">${esc(exercise.note || '')}</span>
      <div class="row-actions"><button class="btn small danger" data-action="del-exercise" data-id="${esc(exercise.id)}">✕</button></div>
    </div>`).join('');
}

export function render(ctx) {
  const state = ctx.state;
  const today = todayStr();
  const week = weekSessions(state.fitness.sessions, today);
  const streak = streakDays(state.fitness.sessions, today);
  const info = latestBody(state.fitness.body);
  const plan = templateFor(ensureTemplate(state), today);
  const planText = plan?.part || '休息';
  const todaySession = state.fitness.sessions.find((session) => session.date === today);
  const todayDone = todaySession ? sessionDone(todaySession) : false;

  return `
    <div class="kpi-row">
      <div class="stat"><span class="stat-value num">${week.length}</span><span class="stat-label">本周训练</span></div>
      <div class="stat"><span class="stat-value num">${streak}</span><span class="stat-label">连续天数</span></div>
      <div class="stat"><span class="stat-value num">${info.latest ? info.latest.weight : '—'}</span><span class="stat-label">体重 kg</span></div>
      <div class="stat"><span class="stat-value">${esc(planText)}</span><span class="stat-label">今日安排${todayDone ? ' · <span class="tag ok">已打卡</span>' : todaySession ? ' · 训练中' : ''}</span></div>
    </div>

    <div class="grid cols-2 section-gap">
      ${card({
        title: '本周训练模板',
        sub: '写一次，天天用',
        body: templateRows(state, today),
      })}
      ${card({
        title: '训练打卡',
        sub: '练完就记，别攒着',
        body: `
          <div class="hstack" style="margin-bottom:10px">
            ${todaySession
              ? `<span class="tag ${todayDone ? 'ok' : 'warn'}">${todayDone ? '已打卡' : '训练中，动作还没做完'}</span>`
              : '<button class="btn small primary" data-action="generate-today">按模板生成今日训练</button>'}
            <span class="faint">${todaySession ? '点开「明细」，逐组点完成' : '或者直接在下面快速打卡'}</span>
          </div>
          <div class="inline-form" style="margin-bottom:10px">
            <input class="input mini" type="date" id="session-date" value="${esc(today)}" style="width:130px">
            <input class="input grow" id="session-type" placeholder="${esc(planText === '休息' ? '练什么' : planText)}">
            <input class="input mini" id="session-duration" type="number" min="0" placeholder="分钟" style="width:78px">
            <select class="input mini" id="session-feel"><option value="状态好">状态好</option><option value="一般">一般</option><option value="很累">很累</option></select>
            <button class="btn small primary" data-action="add-session">打卡</button>
          </div>
          <div class="stack">${sessionRows(state)}</div>`,
      })}
    </div>

    <div class="grid cols-2 section-gap">
      ${card({
        title: '体重与围度',
        sub: '看趋势，不焦虑',
        body: `
          <div class="inline-form" style="margin-bottom:10px">
            <input class="input mini" type="date" id="body-date" value="${esc(today)}" style="width:130px">
            <input class="input mini" id="body-weight" type="number" step="0.1" placeholder="体重 kg" style="width:92px">
            <input class="input mini" id="body-fat" type="number" step="0.1" placeholder="体脂 %" style="width:80px">
            <input class="input mini" id="body-waist" type="number" step="0.1" placeholder="腰围" style="width:80px">
            <button class="btn small primary" data-action="add-body">记录</button>
          </div>
          <div class="stack">${bodyRows(state)}</div>`,
      })}
      ${card({
        title: '动作库',
        sub: '动作名字统一，模板才认得',
        body: `
          <div class="inline-form" style="margin-bottom:10px">
            <input class="input grow" id="exercise-name" placeholder="动作名，比如「卧推」">
            <select class="input mini" id="exercise-part"><option value="胸">胸</option><option value="背">背</option><option value="腿">腿</option><option value="肩">肩</option><option value="手臂">手臂</option><option value="核心">核心</option><option value="有氧">有氧</option></select>
            <button class="btn small primary" data-action="add-exercise">＋</button>
          </div>
          <div class="stack">${exerciseLib(state)}</div>`,
      })}
    </div>`;
}

function sessionDrawer(session, ctx) {
  const exercises = session.exercises || [];
  return openDrawer(`
    <div class="drawer-head"><div class="drawer-title">${esc(session.date)} · ${esc(session.type || '训练')}</div><div class="spacer"></div>
      <span class="tag">${session.durationMin || 0} 分钟</span></div>
    <div class="grid cols-2">
      <div class="field"><label>日期</label>
        <input class="input" type="date" data-change-action="session-field" data-id="${esc(session.id)}" data-field="date" value="${esc(session.date)}"></div>
      <div class="field"><label>训练部位 / 类型</label>
        <input class="input" data-change-action="session-field" data-id="${esc(session.id)}" data-field="type" value="${esc(session.type || '')}"></div>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>时长（分钟）</label>
        <input class="input" type="number" min="0" data-change-action="session-field" data-id="${esc(session.id)}" data-field="durationMin" value="${session.durationMin ?? ''}"></div>
      <div class="field"><label>感受</label>
        <input class="input" data-change-action="session-field" data-id="${esc(session.id)}" data-field="feel" value="${esc(session.feel || '')}"></div>
    </div>
    <div class="field"><label>备注</label>
      <input class="input" data-change-action="session-field" data-id="${esc(session.id)}" data-field="note" value="${esc(session.note || '')}"></div>
    <div class="sep"></div>
    <div class="card-title">动作</div>
    <div class="stack" style="margin-top:8px">
      ${exercises.length ? exercises.map((exercise, index) => `
        <div class="row">
          <span class="row-title">${esc(exercise.name)}</span>
          <span class="row-meta num">${exercise.sets || 0} 组 × ${exercise.reps || 0}${exercise.weight ? ` · ${exercise.weight}kg` : ''}</span>
          <span class="row-meta tag ${Number(exercise.doneSets) >= Number(exercise.sets) ? 'ok' : ''}">完成 ${exercise.doneSets || 0}/${exercise.sets || 0}</span>
          <div class="row-actions">
            <button class="btn small" data-action="exercise-plus" data-id="${esc(session.id)}" data-index="${index}">＋1 组</button>
          </div>
        </div>`).join('') : '<div class="faint">这次没记动作明细</div>'}
    </div>
    <div class="inline-form" style="margin-top:10px">
      <input class="input grow" id="se-name" placeholder="动作名">
      <input class="input mini" id="se-sets" type="number" min="1" placeholder="组" style="width:66px">
      <input class="input mini" id="se-reps" type="number" min="1" placeholder="次" style="width:66px">
      <input class="input mini" id="se-weight" type="number" min="0" placeholder="kg" style="width:74px">
      <button class="btn small primary" data-action="add-exercise-line" data-id="${esc(session.id)}">加动作</button>
    </div>`);
}

export function handle(action, el, ctx, value) {
  const state = ctx.state;
  const id = el?.dataset?.id;

  if (action === 'new') { dom('session-type')?.focus(); return true; }

  if (action === 'template-part') {
    const day = Number(el.dataset.day);
    ctx.mutate((doc) => {
      if (!doc.fitness.weekTemplate.length) doc.fitness.weekTemplate = blankWeekTemplate();
      const item = doc.fitness.weekTemplate.find((row) => Number(row.day) === day);
      if (item) item.part = el.value;
    });
    return true;
  }

  if (action === 'template-names') {
    const day = Number(el.dataset.day);
    ctx.mutate((doc) => {
      if (!doc.fitness.weekTemplate.length) doc.fitness.weekTemplate = blankWeekTemplate();
      const item = doc.fitness.weekTemplate.find((row) => Number(row.day) === day);
      if (item) item.exerciseNames = el.value;
    });
    return true;
  }

  if (action === 'generate-today') {
    const today = todayStr();
    if (state.fitness.sessions.some((session) => session.date === today)) {
      ctx.toast('今天已经有训练记录了');
      return true;
    }
    const plan = templateFor(ensureTemplate(state), today);
    const names = String(plan?.exerciseNames || '')
      .split(/[、,，\s]+/).map((name) => name.trim()).filter(Boolean);
    ctx.mutate((doc) => {
      doc.fitness.sessions.push({
        id: uid('s'), date: today, type: plan?.part || '训练', durationMin: 0, feel: '',
        exercises: names.map((name) => ({ name, sets: 3, reps: 10, weight: 0, doneSets: 0 })),
        note: '按本周模板生成', createdAt: isoNow(),
      });
    });
    ctx.toast(names.length ? `已生成 ${names.length} 个动作，逐组完成` : '已生成今天的训练');
    return true;
  }

  if (action === 'add-session') {
    const date = dom('session-date')?.value || todayStr();
    const plan = templateFor(ensureTemplate(state), date);
    const type = String(dom('session-type')?.value || plan?.part || '训练').trim();
    ctx.mutate((doc) => {
      doc.fitness.sessions.push({
        id: uid('s'), date, type,
        durationMin: Number(dom('session-duration')?.value || 0),
        feel: dom('session-feel')?.value || '',
        exercises: [], note: '', createdAt: isoNow(),
      });
    });
    ctx.toast('打卡成功');
    return true;
  }

  if (action === 'open-session') {
    const session = state.fitness.sessions.find((item) => item.id === id);
    if (session) sessionDrawer(session, ctx);
    return true;
  }

  if (action === 'session-field') {
    const field = el.dataset.field;
    ctx.mutate((doc) => {
      const session = doc.fitness.sessions.find((item) => item.id === id);
      if (!session) return;
      session[field] = ['durationMin'].includes(field) ? Number(el.value) || 0 : el.value;
    });
    return true;
  }

  if (action === 'del-session') {
    ctx.mutate((doc) => {
      const index = doc.fitness.sessions.findIndex((item) => item.id === id);
      if (index >= 0) doc.fitness.sessions.splice(index, 1);
    }, { undo: true });
    ctx.toast('已删除，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo() });
    return true;
  }

  if (action === 'add-exercise-line') {
    const name = String(dom('se-name')?.value || '').trim();
    if (!name) { ctx.toast('先写动作名'); return true; }
    ctx.mutate((doc) => {
      const session = doc.fitness.sessions.find((item) => item.id === id);
      if (!session) return;
      session.exercises = session.exercises || [];
      session.exercises.push({
        name, sets: Number(dom('se-sets')?.value || 3), reps: Number(dom('se-reps')?.value || 10),
        weight: Number(dom('se-weight')?.value || 0), doneSets: 0,
      });
    });
    const session = state.fitness.sessions.find((item) => item.id === id);
    if (session) sessionDrawer(session, ctx);
    return true;
  }

  if (action === 'exercise-plus') {
    const index = Number(el.dataset.index);
    ctx.mutate((doc) => {
      const session = doc.fitness.sessions.find((item) => item.id === id);
      if (!session || !session.exercises?.[index]) return;
      const exercise = session.exercises[index];
      exercise.doneSets = Math.min(Number(exercise.sets) || 0, Number(exercise.doneSets) + 1);
    });
    const session = state.fitness.sessions.find((item) => item.id === id);
    if (session) sessionDrawer(session, ctx);
    return true;
  }

  if (action === 'add-body') {
    const weight = Number(dom('body-weight')?.value || 0);
    if (!weight) { ctx.toast('先填体重'); return true; }
    ctx.mutate((doc) => {
      doc.fitness.body.push({
        id: uid('b'), date: dom('body-date')?.value || todayStr(), weight,
        bodyFat: Number(dom('body-fat')?.value || 0) || null,
        waist: Number(dom('body-waist')?.value || 0) || null,
      });
    });
    ctx.toast('记下了');
    return true;
  }

  if (action === 'del-body') {
    ctx.mutate((doc) => {
      const index = doc.fitness.body.findIndex((item) => item.id === id);
      if (index >= 0) doc.fitness.body.splice(index, 1);
    });
    return true;
  }

  if (action === 'add-exercise') {
    const name = String(dom('exercise-name')?.value || '').trim();
    if (!name) { ctx.toast('先写动作名'); return true; }
    ctx.mutate((doc) => {
      doc.fitness.exerciseLib.push({ id: uid('e'), name, part: dom('exercise-part')?.value || '胸', note: '' });
    });
    const input = dom('exercise-name');
    if (input) input.value = '';
    return true;
  }

  if (action === 'del-exercise') {
    ctx.mutate((doc) => {
      const index = doc.fitness.exerciseLib.findIndex((item) => item.id === id);
      if (index >= 0) doc.fitness.exerciseLib.splice(index, 1);
    });
    return true;
  }

  return false;
}
