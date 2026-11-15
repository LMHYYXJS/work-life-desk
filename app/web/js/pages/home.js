// 首页总览：问候条、今日计划卡、快速备忘、四模块摘要

import { formatCn, isoNow, todayStr, uid } from '../schema.js';
import {
  LEAD_STAGES, PROJECT_STAGES, GAME_STATUS, WATCH_STATUS,
  hasLogToday, isUpdateDue, monthIncome, monthPosts, totalViews, followerSnapshot,
  openBugCount, templateFor, streakDays, weekMinutes, followUps, formatMinutes, formatMoney,
  sortMemos, taskStats,
} from '../logic.js';
import { card, dom, empty, esc, tag } from '../ui.js';

export const meta = { id: 'home', title: '首页总览', icon: '🏠' };

let editingMemoId = null;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '还没睡？';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function taskLine(task, ctx) {
  return `
    <div class="row" data-item-id="${esc(task.id)}">
      <button class="check ${task.done ? 'on' : ''}" data-action="home-toggle" data-id="${esc(task.id)}">✓</button>
      <span class="row-title ${task.done ? 'done' : ''}">${esc(task.title)}</span>
      <span class="row-meta">
        ${task.priority === 'p0' ? tag('P0', 'danger') : task.priority === 'p1' ? tag('P1', 'warn') : ''}
        ${task.estMinutes ? `<span class="num">${esc(task.estMinutes)}m</span>` : ''}
      </span>
    </div>`;
}

function summaryMedia(state, today) {
  const pending = state.media.ideas.filter((idea) => idea.stage !== 'publish');
  const views = totalViews(monthPosts(state.media.posts, today));
  const followers = followerSnapshot(state.media.followers);
  const total = Object.values(followers).reduce((sum, item) => sum + item.count, 0);
  const due = isUpdateDue(state.media.nextUpdateAt, today);
  return {
    title: '自媒体',
    icon: '🎬',
    focus: pending[0]?.id || '',
    lines: [
      `待推进 ${pending.length} 条`,
      `本月播放 ${views >= 10000 ? `${(views / 10000).toFixed(1)}w` : views}`,
      `粉丝 ${total}`,
    ],
    hint: due ? '该更新了' : '',
  };
}

function summaryDev(state) {
  const ongoing = state.dev.projects.filter((project) => ['plan', 'dev', 'test'].includes(project.stage)).length;
  const bugs = openBugCount(state.dev.bugs);
  const logged = hasLogToday(state.dev.logs, todayStr());
  const firstBug = state.dev.bugs.find((bug) => bug.status !== 'verified');
  return {
    title: '开发工作',
    icon: '💻',
    focus: firstBug?.id || '',
    lines: [`进行中 ${ongoing} 个`, `待修 Bug ${bugs}`, logged ? '今日日志 已写' : '今日日志 未写'],
    hint: logged ? '' : '写一条日志',
  };
}

function summaryFitness(state, today) {
  const part = templateFor(state.fitness.weekTemplate, today)?.part || '未排';
  const todaySession = state.fitness.sessions.find((session) => session.date === today);
  const streak = streakDays(state.fitness.sessions, today);
  return {
    title: '健身',
    icon: '🏋️',
    focus: todaySession?.id || '',
    lines: [`今日 ${part}`, todaySession ? '已打卡 ✓' : '未打卡', `连续 ${streak} 天`],
    hint: todaySession ? '' : '去打卡',
  };
}

function summaryGames(state, today) {
  const minutes = weekMinutes(state.games.plays, today);
  const playing = state.games.library.filter((game) => game.status === 'playing');
  const watch = state.games.watchlist.filter((item) => item.status !== 'finished').length;
  return {
    title: '游戏娱乐',
    icon: '🎮',
    focus: playing[0]?.id || '',
    lines: [`本周 ${formatMinutes(minutes)}`, `在玩 ${playing.length} 款`, `待看 ${watch} 部`],
    hint: '',
  };
}

function summaryCard(data) {
  return `
    <button class="card summary" data-page="${esc({
      '自媒体': 'media', '开发工作': 'dev', '健身': 'fitness', '游戏娱乐': 'games',
    }[data.title] || 'home')}" data-focus-id="${esc(data.focus || '')}">
      <div class="summary-head"><span class="summary-icon">${data.icon}</span><span class="summary-title">${esc(data.title)}</span></div>
      <div class="summary-lines">${data.lines.map((line) => `<span>${esc(line)}</span>`).join('')}</div>
      ${data.hint ? `<div class="summary-hint">${esc(data.hint)} →</div>` : ''}
    </button>`;
}

export function render(ctx) {
  const state = ctx.state;
  const today = todayStr();
  const todays = state.tasks.filter((task) => task.date === today && !task.abandoned);
  const stats = taskStats(todays);
  const undone = todays.filter((task) => !task.done).slice(0, 5);
  const memos = sortMemos(state.memos).slice(0, 6);
  const settings = state.settings;
  const streak = streakDays(state.fitness.sessions, today);

  const summaries = [];
  if (settings.homeSummary.includes('media')) summaries.push(summaryCard(summaryMedia(state, today)));
  if (settings.homeSummary.includes('dev')) summaries.push(summaryCard(summaryDev(state)));
  if (settings.homeSummary.includes('fitness')) summaries.push(summaryCard(summaryFitness(state, today)));
  if (settings.homeSummary.includes('games')) summaries.push(summaryCard(summaryGames(state, today)));

  const overdue = followUps(state.consult.leads, today).filter((lead) => lead.overdue).length;

  return `
    <div class="home-greet">
      <span class="greet-text">${greeting()}，今天 ${formatCn(today)}</span>
      <span class="greet-meta">
        <span>今日 <b class="num">${stats.done}/${stats.total}</b> 完成</span>
        <span>连续打卡 <b class="num">${streak}</b> 天</span>
        ${overdue ? `<span class="tag danger">逾期跟进 ${overdue}</span>` : ''}
      </span>
    </div>

    <div class="home-top">
      ${card({
        title: '今日计划',
        sub: `${stats.done}/${stats.total}`,
        actions: `<button class="btn small" data-page="tasks">更多 →</button>`,
        body: undone.length
          ? undone.map((task) => taskLine(task, ctx)).join('')
          : empty(stats.total ? '今天的都做完了，收个尾' : '今天还没排任务，写三件最要紧的', '去排任务', 'go-tasks'),
      })}

      ${card({
        title: '快速备忘',
        actions: '',
        body: `
          <input class="input" id="memo-input" placeholder="想到什么先扔进来，回车即存…" data-enter="1" data-enter-action="add-memo" data-focus-key="memo-input">
          <div class="memo-list">
            ${memos.length ? memos.map((memo) => `
              <div class="row memo-row" data-item-id="${esc(memo.id)}">
                <span class="memo-pin ${memo.pinned ? 'on' : ''}" data-action="pin-memo" data-id="${esc(memo.id)}" title="置顶">${memo.pinned ? '★' : '☆'}</span>
                ${editingMemoId === memo.id
                  ? `<input class="input mini grow" data-focus-key="memo-${esc(memo.id)}" data-autofocus="1" data-change-action="commit-memo" data-enter="1" data-enter-action="commit-memo" data-id="${esc(memo.id)}" value="${esc(memo.text)}">`
                  : `<span class="row-title grow" data-action="edit-memo" data-id="${esc(memo.id)}">${esc(memo.text)}</span>`}
                <button class="btn small danger" data-action="del-memo" data-id="${esc(memo.id)}">✕</button>
              </div>`).join('') : '<div class="faint memo-empty">还没有备忘</div>'}
          </div>`,
      })}
    </div>

    ${summaries.length ? `<div class="summary-grid section-gap">${summaries.join('')}</div>` : ''}`;
}

export function handle(action, el, ctx, value) {
  const state = ctx.state;
  const id = el?.dataset?.id;

  if (action === 'new') {
    dom('memo-input')?.focus();
    return true;
  }

  if (action === 'go-tasks') { ctx.navigate('tasks'); return true; }
  if (action === 'go-memo') { dom('memo-input')?.focus(); return true; }

  if (action === 'home-toggle') {
    ctx.mutate((doc) => {
      const task = doc.tasks.find((item) => item.id === id);
      if (!task) return;
      task.done = !task.done;
      task.doneAt = task.done ? isoNow() : null;
    });
    return true;
  }

  if (action === 'add-memo') {
    const text = String(value || dom('memo-input')?.value || '').trim();
    if (!text) return true;
    ctx.mutate((doc) => {
      doc.memos.push({ id: uid('m'), text, pinned: false, createdAt: isoNow() });
    });
    const input = dom('memo-input');
    if (input) input.value = '';
    return true;
  }

  if (action === 'pin-memo') {
    ctx.mutate((doc) => {
      const memo = doc.memos.find((item) => item.id === id);
      if (memo) memo.pinned = !memo.pinned;
    });
    return true;
  }

  if (action === 'edit-memo') { editingMemoId = id; ctx.refresh(); return true; }

  if (action === 'commit-memo') {
    const text = String(value || '').trim();
    editingMemoId = null;
    if (text) {
      ctx.mutate((doc) => {
        const memo = doc.memos.find((item) => item.id === id);
        if (memo) memo.text = text;
      });
    } else {
      ctx.refresh();
    }
    return true;
  }

  if (action === 'del-memo') {
    ctx.mutate((doc) => {
      const index = doc.memos.findIndex((item) => item.id === id);
      if (index >= 0) doc.memos.splice(index, 1);
    }, { undo: true });
    ctx.toast('已删除，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    return true;
  }

  return false;
}
