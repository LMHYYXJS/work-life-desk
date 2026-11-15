// 开发工作：项目进度 + 需求/待办/Bug 三清单 + 开发日志 + 版本记录

import { isoNow, todayStr, uid } from '../schema.js';
import {
  BUG_SEVERITY, BUG_STATUS, PROJECT_STAGES, hasLogToday,
  isItemDone, openBugCount, projectProgress,
} from '../logic.js';
import { card, dom, empty, esc, openDrawer, openFormModal, progress, tag } from '../ui.js';

export const meta = { id: 'dev', title: '开发工作', icon: '💻' };

let activeTab = 'needs';

const TABS = [
  { key: 'needs', label: '需求' },
  { key: 'todos', label: '待办' },
  { key: 'bugs', label: 'Bug' },
];

/** 创建项目弹窗的表单 HTML；只保留真正需要的字段，项目名必填。 */
export function projectFormBody() {
  return `
    <div class="field">
      <label for="pm-name">项目名 <span class="required">*</span></label>
      <input class="input" id="pm-name" name="name" placeholder="比如「Minecraft 作品集网站」" autocomplete="off" data-autofocus="1">
    </div>
    <div class="grid cols-2">
      <div class="field"><label for="pm-type">类型</label>
        <select class="input" id="pm-type" name="type">
          ${['网站', '应用', '工具', '其他'].map((type) => `<option value="${type}">${type}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label for="pm-stage">阶段</label>
        <select class="input" id="pm-stage" name="stage">
          ${PROJECT_STAGES.map((stage) => `<option value="${stage.key}">${stage.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label for="pm-due">截止日（可空）</label>
      <input class="input" type="date" id="pm-due" name="dueDate">
    </div>
    <div class="field"><label for="pm-next">下一步（可空）</label>
      <input class="input" id="pm-next" name="nextStep" placeholder="下一件要做的事">
    </div>
    <p class="faint">创建后会出现在项目卡片里，可以再打开补充截止日和进度。</p>`;
}

/** 校验并规范化项目草稿；返回错误或可直接写库的项目对象。 */
export function normalizeProjectDraft(draft = {}) {
  const name = String(draft.name || '').trim();
  if (!name) return { ok: false, error: '项目名不能为空' };
  const stage = PROJECT_STAGES.some((item) => item.key === draft.stage) ? draft.stage : 'plan';
  return {
    ok: true,
    project: {
      name,
      type: String(draft.type || '网站'),
      stage,
      dueDate: draft.dueDate || null,
      nextStep: String(draft.nextStep || '').trim(),
      progress: 0,
    },
  };
}

function openProjectModal(ctx) {
  openFormModal({
    title: '新建项目',
    submitLabel: '创建项目',
    body: projectFormBody(),
    onSubmit: ({ close, setError }) => {
      const draft = {
        name: dom('pm-name')?.value || '',
        type: dom('pm-type')?.value || '网站',
        stage: dom('pm-stage')?.value || 'plan',
        dueDate: dom('pm-due')?.value || null,
        nextStep: dom('pm-next')?.value || '',
      };
      const result = normalizeProjectDraft(draft);
      if (!result.ok) {
        setError(result.error);
        dom('pm-name')?.focus();
        return false;
      }
      ctx.mutate((doc) => {
        doc.dev.projects.push({
          id: uid('p'),
          ...result.project,
          updatedAt: isoNow(),
        });
      });
      close();
      ctx.toast('项目已创建');
      return true;
    },
  });
}

function projectName(state, projectId) {
  return state.dev.projects.find((item) => item.id === projectId)?.name || '未归属项目';
}

function stageTag(stage) {
  const label = PROJECT_STAGES.find((item) => item.key === stage)?.label || stage;
  return tag(label, stage === 'online' ? 'ok' : stage === 'test' ? 'warn' : '');
}

function severityMeta(key) {
  return BUG_SEVERITY.find((item) => item.key === key) || BUG_SEVERITY[2];
}

function bugStatusLabel(key) {
  return BUG_STATUS.find((item) => item.key === key)?.label || key;
}

function projectCards(state) {
  const mode = state.settings.projectProgressMode;
  if (!state.dev.projects.length) {
    return empty('先建一个项目，哪怕是自己的网站', '新建项目，填个名字就行', 'open-project-modal');
  }
  const lists = { needs: state.dev.needs, todos: state.dev.todos, bugs: state.dev.bugs };
  return `
    <div class="grid cols-2">
      ${state.dev.projects.map((project) => {
        const pct = projectProgress(mode, project, lists);
        return `
          <div class="card project-card" data-item-id="${esc(project.id)}">
            <div class="card-head">
              <div class="card-title">${esc(project.name)}</div>
              <div class="card-actions">${stageTag(project.stage)}</div>
            </div>
            <div class="card-body">
              <div class="hstack"><span class="stat-inline">进度 <b class="num">${pct}%</b></span>${project.dueDate ? `<span class="faint">截止 ${esc(project.dueDate)}</span>` : ''}</div>
              ${progress(pct)}
              <div class="faint cut">下一步：${esc(project.nextStep || '还没写')}</div>
              <div class="hstack">
                <button class="btn small" data-action="open-project" data-id="${esc(project.id)}">打开</button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function needsRows(state) {
  if (!state.dev.needs.length) return empty('没有需求。下个版本想加什么？');
  return state.dev.needs.map((need) => `
    <div class="row" data-item-id="${esc(need.id)}">
      <button class="check ${need.status === 'done' ? 'on' : ''}" data-action="need-cycle" data-id="${esc(need.id)}" title="切换状态">✓</button>
      <span class="row-title ${need.status === 'done' ? 'done' : ''}">${esc(need.title)}</span>
      <span class="row-meta">
        <span class="faint">${esc(projectName(state, need.projectId))}</span>
        ${tag(need.status === 'doing' ? '在做' : need.status === 'done' ? '已完成' : '待做', need.status === 'doing' ? 'accent' : need.status === 'done' ? 'ok' : '')}
      </span>
      <div class="row-actions"><button class="btn small danger" data-action="del-item" data-kind="needs" data-id="${esc(need.id)}">✕</button></div>
    </div>`).join('');
}

function todosRows(state) {
  if (!state.dev.todos.length) return empty('没有待办。零碎活儿先扔这儿');
  return state.dev.todos.map((todo) => `
    <div class="row" data-item-id="${esc(todo.id)}">
      <button class="check ${todo.done ? 'on' : ''}" data-action="todo-toggle" data-id="${esc(todo.id)}">✓</button>
      <span class="row-title ${todo.done ? 'done' : ''}">${esc(todo.title)}</span>
      <span class="row-meta">
        <span class="faint">${esc(projectName(state, todo.projectId))}</span>
        ${tag(todo.type || '功能', '')}
      </span>
      <div class="row-actions"><button class="btn small danger" data-action="del-item" data-kind="todos" data-id="${esc(todo.id)}">✕</button></div>
    </div>`).join('');
}

function bugRows(state) {
  if (!state.dev.bugs.length) return empty('没有 Bug，挺顺');
  return state.dev.bugs.map((bug) => `
    <div class="row" data-item-id="${esc(bug.id)}">
      <button class="tag ${severityMeta(bug.severity).cls}" data-action="bug-severity" data-id="${esc(bug.id)}" title="切换严重度">${esc(severityMeta(bug.severity).label)}</button>
      <span class="row-title ${bug.status === 'verified' ? 'done' : ''}">${esc(bug.title)}</span>
      <span class="row-meta">
        <span class="faint">${esc(projectName(state, bug.projectId))}</span>
        <button class="tag ${bug.status === 'verified' ? 'ok' : bug.status === 'fixed' ? 'accent' : ''}" data-action="bug-status" data-id="${esc(bug.id)}">${esc(bugStatusLabel(bug.status))}</button>
      </span>
      <div class="row-actions">
        <button class="btn small" data-action="bug-to-todo" data-id="${esc(bug.id)}" title="转成待办">→待办</button>
        <button class="btn small danger" data-action="del-item" data-kind="bugs" data-id="${esc(bug.id)}">✕</button>
      </div>
    </div>`).join('');
}

function tabBody(state) {
  if (activeTab === 'needs') return needsRows(state);
  if (activeTab === 'todos') return todosRows(state);
  return bugRows(state);
}

function tabAddForm(state) {
  const projectOptions = state.dev.projects.map((project) => `<option value="${project.id}">${esc(project.name)}</option>`).join('');
  const base = `
    <input class="input grow" id="item-title" placeholder="写一条${TABS.find((tab) => tab.key === activeTab).label}…" data-enter="1" data-enter-action="add-item" data-focus-key="item-title">
    <select class="input mini" id="item-project"><option value="">不归属项目</option>${projectOptions}</select>`;
  if (activeTab === 'needs') {
    return `${base}<select class="input mini" id="item-extra"><option value="p1">P1</option><option value="p2">P2</option><option value="p0">P0</option></select><button class="btn primary small" data-action="add-item">＋ 加需求</button>`;
  }
  if (activeTab === 'todos') {
    return `${base}<select class="input mini" id="item-extra"><option value="功能">功能</option><option value="修复">修复</option><option value="优化">优化</option><option value="杂务">杂务</option></select><button class="btn primary small" data-action="add-item">＋ 加待办</button>`;
  }
  return `${base}<select class="input mini" id="item-extra"><option value="high">高</option><option value="mid" selected>中</option><option value="low">低</option></select><button class="btn primary small" data-action="add-item">＋ 记 Bug</button>`;
}

function logsBlock(state) {
  const logs = [...state.dev.logs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
    <div class="inline-form" style="margin-bottom:10px">
      <select class="input mini" id="log-project"><option value="">不归属项目</option>
        ${state.dev.projects.map((project) => `<option value="${project.id}">${esc(project.name)}</option>`).join('')}</select>
      <input class="input grow" id="log-did" placeholder="今天做了什么" data-enter="1" data-enter-action="add-log">
      <input class="input grow" id="log-blocker" placeholder="卡点（可空）">
      <button class="btn small primary" data-action="add-log">记今天</button>
    </div>
    ${logs.length ? logs.slice(0, 8).map((log) => `
      <div class="tl-item">
        <span class="tl-date">${esc(String(log.date).slice(5))}</span>
        <span class="tl-text"><b>${esc(log.did)}</b>${log.blocker ? ` · 卡点：${esc(log.blocker)}` : ''}<span class="faint"> · ${esc(projectName(state, log.projectId))}</span></span>
      </div>`).join('') : empty('今天干了什么，一句话也够')}`;
}

function versionsBlock(state) {
  const versions = [...state.dev.versions].sort((a, b) => String(b.releasedAt).localeCompare(String(a.releasedAt)));
  return `
    <div class="inline-form" style="margin-bottom:10px">
      <select class="input mini" id="ver-project"><option value="">不归属项目</option>
        ${state.dev.projects.map((project) => `<option value="${project.id}">${esc(project.name)}</option>`).join('')}</select>
      <input class="input mini" id="ver-no" placeholder="v0.3" style="width:86px">
      <input class="input mini" id="ver-date" type="date" value="${esc(todayStr())}">
      <input class="input grow" id="ver-changes" placeholder="变更要点" data-enter="1" data-enter-action="add-version">
      <button class="btn small primary" data-action="add-version">记版本</button>
    </div>
    ${versions.length ? versions.slice(0, 6).map((version) => `
      <div class="tl-item">
        <span class="tl-date">${esc(version.versionNo || '—')}</span>
        <span class="tl-text">${esc(version.changes)}<span class="faint"> · ${esc(version.releasedAt)} · ${esc(projectName(state, version.projectId))}</span></span>
      </div>`).join('') : empty('发布一个版本，记一句改了什么')}`;
}

export function render(ctx) {
  const state = ctx.state;
  const today = todayStr();
  const ongoing = state.dev.projects.filter((project) => ['plan', 'dev', 'test'].includes(project.stage)).length;
  const logged = hasLogToday(state.dev.logs, today);
  const counts = {
    needs: state.dev.needs.filter((need) => need.status !== 'done').length,
    todos: state.dev.todos.filter((todo) => !todo.done).length,
    bugs: openBugCount(state.dev.bugs),
  };

  return `
    <div class="kpi-row">
      <div class="stat"><span class="stat-value num">${ongoing}</span><span class="stat-label">进行中项目</span></div>
      <div class="stat"><span class="stat-value num">${state.dev.projects.length}</span><span class="stat-label">全部项目</span></div>
      <div class="stat"><span class="stat-value num">${counts.bugs}</span><span class="stat-label">待修 Bug</span></div>
      <div class="stat"><span class="stat-value">${logged ? '已写' : '未写'}</span><span class="stat-label">今日开发日志</span></div>
    </div>

    <section class="section-gap">
      <div class="card-head">
        <div class="card-title">项目</div>
        <div class="card-actions">
          <button class="btn small primary" data-action="open-project-modal">＋ 新建项目</button>
        </div>
      </div>
      ${projectCards(state)}
    </section>

    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">
          ${TABS.map((tab) => `<button class="btn small ${activeTab === tab.key ? 'primary' : 'ghost'}" data-action="tab" data-tab="${tab.key}">${tab.label} ${counts[tab.key] ? `<span class="faint">${counts[tab.key]}</span>` : ''}</button>`).join(' ')}
        </div>
      </div>
      <div class="inline-form" style="margin-bottom:10px">${tabAddForm(state)}</div>
      <div class="stack">${tabBody(state)}</div>
    </section>

    <div class="grid cols-2 section-gap">
      ${card({ title: '开发日志', sub: '做了 / 卡点 / 明天', body: logsBlock(state) })}
      ${card({ title: '版本记录', body: versionsBlock(state) })}
    </div>`;
}

function projectDrawer(project, ctx) {
  const state = ctx.state;
  const pct = projectProgress(state.settings.projectProgressMode, project, {
    needs: state.dev.needs, todos: state.dev.todos, bugs: state.dev.bugs,
  });
  return openDrawer(`
    <div class="drawer-head"><div class="drawer-title">${esc(project.name)}</div><div class="spacer"></div>${stageTag(project.stage)}</div>
    <div class="field"><label>项目名</label>
      <input class="input" data-change-action="project-field" data-id="${esc(project.id)}" data-field="name" value="${esc(project.name)}"></div>
    <div class="grid cols-2">
      <div class="field"><label>类型</label>
        <select class="input" data-change-action="project-field" data-id="${esc(project.id)}" data-field="type">
          ${['网站', '应用', '工具', '其他'].map((type) => `<option value="${type}" ${project.type === type ? 'selected' : ''}>${type}</option>`).join('')}
        </select></div>
      <div class="field"><label>阶段</label>
        <select class="input" data-change-action="project-field" data-id="${esc(project.id)}" data-field="stage">
          ${PROJECT_STAGES.map((stage) => `<option value="${stage.key}" ${project.stage === stage.key ? 'selected' : ''}>${stage.label}</option>`).join('')}
        </select></div>
    </div>
    <div class="field"><label>进度（${state.settings.projectProgressMode === 'auto' ? '按条目自动' : '手动'}）</label>
      <div class="hstack">${progress(pct)}<b class="num">${pct}%</b></div>
      ${state.settings.projectProgressMode === 'manual' ? `<input class="input" type="number" min="0" max="100" data-change-action="project-field" data-id="${esc(project.id)}" data-field="progress" value="${project.progress ?? 0}">` : ''}
    </div>
    <div class="field"><label>下一步</label>
      <input class="input" data-change-action="project-field" data-id="${esc(project.id)}" data-field="nextStep" value="${esc(project.nextStep || '')}" placeholder="下一件要做的事"></div>
    <div class="field"><label>截止日</label>
      <input class="input" type="date" data-change-action="project-field" data-id="${esc(project.id)}" data-field="dueDate" value="${esc(project.dueDate || '')}"></div>
    <div class="sep"></div>
    <div class="hstack">
      <button class="btn danger" data-action="del-project" data-id="${esc(project.id)}">删除项目</button>
    </div>
    <p class="faint">删除项目不会删掉它下面的清单，只是这些条目会变成「未归属项目」。</p>
  `);
}

export function handle(action, el, ctx, value) {
  const state = ctx.state;
  const id = el?.dataset?.id;

  if (action === 'new' || action === 'focus-project' || action === 'open-project-modal') {
    openProjectModal(ctx);
    return true;
  }

  if (action === 'open-project') {
    const project = state.dev.projects.find((item) => item.id === id);
    if (project) projectDrawer(project, ctx);
    return true;
  }

  if (action === 'project-field') {
    const field = el.dataset.field;
    ctx.mutate((doc) => {
      const project = doc.dev.projects.find((item) => item.id === id);
      if (!project) return;
      project[field] = field === 'progress' ? Number(el.value) || 0 : el.value;
      project.updatedAt = isoNow();
    });
    return true;
  }

  if (action === 'del-project') {
    ctx.mutate((doc) => {
      const index = doc.dev.projects.findIndex((item) => item.id === id);
      if (index >= 0) doc.dev.projects.splice(index, 1);
    }, { undo: true });
    openDrawer('');
    ctx.toast('项目已删，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    return true;
  }

  if (action === 'tab') { activeTab = el.dataset.tab; ctx.refresh(); return true; }

  if (action === 'add-item') {
    const titleInput = dom('item-title');
    const title = String(value || titleInput?.value || '').trim();
    if (!title) { ctx.toast('先写内容'); return true; }
    const projectId = dom('item-project')?.value || '';
    const extra = dom('item-extra')?.value || '';
    ctx.mutate((doc) => {
      if (activeTab === 'needs') {
        doc.dev.needs.push({ id: uid('n'), projectId, title, priority: extra || 'p1', status: 'todo', createdAt: isoNow() });
      } else if (activeTab === 'todos') {
        doc.dev.todos.push({ id: uid('d'), projectId, title, type: extra || '功能', done: false, createdAt: isoNow() });
      } else {
        doc.dev.bugs.push({ id: uid('b'), projectId, title, severity: extra || 'mid', status: 'repro', steps: '', foundAt: todayStr() });
      }
    });
    if (titleInput) titleInput.value = '';
    return true;
  }

  if (action === 'need-cycle') {
    ctx.mutate((doc) => {
      const need = doc.dev.needs.find((item) => item.id === id);
      if (!need) return;
      need.status = need.status === 'todo' ? 'doing' : need.status === 'doing' ? 'done' : 'todo';
    });
    return true;
  }

  if (action === 'todo-toggle') {
    ctx.mutate((doc) => {
      const todo = doc.dev.todos.find((item) => item.id === id);
      if (todo) todo.done = !todo.done;
    });
    return true;
  }

  if (action === 'bug-status') {
    ctx.mutate((doc) => {
      const bug = doc.dev.bugs.find((item) => item.id === id);
      if (!bug) return;
      const index = BUG_STATUS.findIndex((item) => item.key === bug.status);
      bug.status = BUG_STATUS[(index + 1) % BUG_STATUS.length].key;
      if (bug.status === 'verified') bug.fixedAt = todayStr();
    });
    return true;
  }

  if (action === 'bug-severity') {
    ctx.mutate((doc) => {
      const bug = doc.dev.bugs.find((item) => item.id === id);
      if (!bug) return;
      const index = BUG_SEVERITY.findIndex((item) => item.key === bug.severity);
      bug.severity = BUG_SEVERITY[(index + 1) % BUG_SEVERITY.length].key;
    });
    return true;
  }

  if (action === 'bug-to-todo') {
    const bug = state.dev.bugs.find((item) => item.id === id);
    if (!bug) return true;
    ctx.mutate((doc) => {
      doc.dev.todos.push({
        id: uid('d'), projectId: bug.projectId, title: `修复：${bug.title}`, type: '修复', done: false, fromBug: bug.id, createdAt: isoNow(),
      });
    });
    ctx.toast('已转成待办，Bug 还留着');
    return true;
  }

  if (action === 'del-item') {
    const kind = el.dataset.kind;
    ctx.mutate((doc) => {
      const index = doc.dev[kind].findIndex((item) => item.id === id);
      if (index >= 0) doc.dev[kind].splice(index, 1);
    }, { undo: true });
    ctx.toast('已删除，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    return true;
  }

  if (action === 'add-log') {
    const didInput = dom('log-did');
    const did = String(value || didInput?.value || '').trim();
    if (!did) { ctx.toast('写一句今天做了什么'); return true; }
    ctx.mutate((doc) => {
      doc.dev.logs.push({
        id: uid('l'), date: todayStr(), projectId: dom('log-project')?.value || '',
        did, blocker: dom('log-blocker')?.value || '', tomorrow: '', createdAt: isoNow(),
      });
    });
    if (didInput) didInput.value = '';
    const blocker = dom('log-blocker');
    if (blocker) blocker.value = '';
    ctx.toast('记下了');
    return true;
  }

  if (action === 'add-version') {
    const noInput = dom('ver-no');
    const changesInput = dom('ver-changes');
    const versionNo = String(noInput?.value || '').trim();
    const changes = String(value || changesInput?.value || '').trim();
    if (!versionNo || !changes) { ctx.toast('版本号和变更要点都要填'); return true; }
    ctx.mutate((doc) => {
      doc.dev.versions.push({
        id: uid('v'), projectId: dom('ver-project')?.value || '', versionNo,
        releasedAt: dom('ver-date')?.value || todayStr(), changes,
      });
    });
    if (noInput) noInput.value = '';
    if (changesInput) changesInput.value = '';
    return true;
  }

  return false;
}
