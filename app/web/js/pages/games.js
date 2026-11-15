// 游戏娱乐：游戏库 + 时长记录与每周额度 + 想玩 / 想看清单

import { todayStr, uid } from '../schema.js';
import {
  GAME_STATUS, WATCH_STATUS, formatMinutes, minutesForGame, playsOf, todayMinutes, weekMinutes,
} from '../logic.js';
import { card, dom, empty, esc, openDrawer, progress, tag } from '../ui.js';

export const meta = { id: 'games', title: '游戏娱乐', icon: '🎮' };

function statusLabel(key) {
  return GAME_STATUS.find((item) => item.key === key)?.label || key;
}

function watchLabel(key) {
  return WATCH_STATUS.find((item) => item.key === key)?.label || key;
}

function gameCard(game, state) {
  const minutes = minutesForGame(state.games.plays, game.id);
  const stars = '★'.repeat(Number(game.rating) || 0) + '☆'.repeat(Math.max(0, 5 - (Number(game.rating) || 0)));
  return `
    <div class="card project-card" data-item-id="${esc(game.id)}">
      <div class="card-head">
        <div class="card-title">${esc(game.name)}</div>
        <button class="tag ${game.status === 'playing' ? 'accent' : game.status === 'done' ? 'ok' : ''}"
          data-action="game-status" data-id="${esc(game.id)}" title="点一下切状态">${esc(statusLabel(game.status))}</button>
      </div>
      <div class="card-body">
        <div class="hstack">
          <span class="faint">${esc(game.platform || '未填平台')}</span>
          <span class="spacer"></span>
          <span class="num faint">${formatMinutes(minutes)}</span>
        </div>
        <div class="faint">${stars}</div>
        <div class="hstack">
          <button class="btn small" data-action="quick-play" data-id="${esc(game.id)}">＋30 分钟</button>
          <button class="btn small" data-action="open-game" data-id="${esc(game.id)}">详情</button>
        </div>
      </div>
    </div>`;
}

function libraryBlock(state) {
  if (!state.games.library.length) return empty('游戏库是空的。把在玩的、想玩的先记进来');
  return `<div class="grid cols-2">${state.games.library.map((game) => gameCard(game, state)).join('')}</div>`;
}

function playsBlock(state) {
  const today = todayStr();
  const todaySum = todayMinutes(state.games.plays, today);
  const plays = [...state.games.plays].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
    <div class="inline-form" style="margin-bottom:10px">
      <select class="input mini" id="play-game">
        <option value="">临时游戏</option>
        ${state.games.library.map((game) => `<option value="${game.id}">${esc(game.name)}</option>`).join('')}
      </select>
      <input class="input mini" type="date" id="play-date" value="${esc(today)}" style="width:130px">
      <input class="input mini" id="play-minutes" type="number" min="1" placeholder="分钟" style="width:78px">
      <input class="input grow" id="play-note" placeholder="玩了什么进度">
      <button class="btn small primary" data-action="add-play">记时长</button>
    </div>
    <div class="hstack faint" style="margin-bottom:8px">今天已玩 <b class="num">${todaySum}</b> 分钟</div>
    ${plays.length ? plays.slice(0, 8).map((play) => `
      <div class="row">
        <span class="row-meta num" style="min-width:64px">${esc(String(play.date).slice(5))}</span>
        <span class="row-title">${esc(state.games.library.find((game) => game.id === play.gameId)?.name || '临时游戏')}</span>
        <span class="row-meta faint">${play.note ? esc(play.note) : ''}</span>
        <span class="row-meta num">${play.minutes} 分钟</span>
        <div class="row-actions"><button class="btn small danger" data-action="del-play" data-id="${esc(play.id)}">✕</button></div>
      </div>`).join('') : empty('还没记过时长')}`;
}

function watchBlock(state) {
  const list = state.games.watchlist;
  return `
    <div class="inline-form" style="margin-bottom:10px">
      <input class="input grow" id="wish-title" placeholder="想玩的游戏 / 想看的剧" data-enter="1" data-enter-action="add-wish">
      <button class="btn small primary" data-action="add-wish">＋</button>
    </div>
    ${list.length ? list.map((item) => `
      <div class="row">
        <span class="row-title">${esc(item.title)}</span>
        <button class="tag ${item.status === 'watching' ? 'accent' : item.status === 'finished' ? 'ok' : ''}"
          data-action="wish-status" data-id="${esc(item.id)}">${esc(watchLabel(item.status))}</button>
        <div class="row-actions">
          <button class="btn small" data-action="wish-to-lib" data-id="${esc(item.id)}">转游戏库</button>
          <button class="btn small danger" data-action="del-wish" data-id="${esc(item.id)}">✕</button>
        </div>
      </div>`).join('') : empty('想玩清单空着')}`;
}

export function render(ctx) {
  const state = ctx.state;
  const today = todayStr();
  const weekMin = weekMinutes(state.games.plays, today);
  const limitMin = (Number(state.settings.entertainmentWeeklyLimit) || 0) * 60;
  const remain = limitMin - weekMin;
  const playing = state.games.library.filter((game) => game.status === 'playing').length;
  const pct = limitMin ? Math.min(100, Math.round((weekMin / limitMin) * 100)) : 0;

  return `
    <div class="kpi-row">
      <div class="stat"><span class="stat-value num">${state.games.library.length}</span><span class="stat-label">游戏库</span></div>
      <div class="stat"><span class="stat-value num">${playing}</span><span class="stat-label">在玩</span></div>
      <div class="stat"><span class="stat-value num">${formatMinutes(weekMin)}</span><span class="stat-label">本周时长</span></div>
      <div class="stat"><span class="stat-value ${remain < 0 ? 'down' : ''}">${remain < 0 ? `超 ${formatMinutes(-remain)}` : formatMinutes(remain)}</span><span class="stat-label">本周额度剩余</span></div>
    </div>

    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">本周额度</div>
        <div class="card-actions faint">每周上限 ${state.settings.entertainmentWeeklyLimit || 0} 小时，可在设置改</div>
      </div>
      ${progress(pct)}
      ${remain < 0 ? '<p class="down">这周已经超了，收一收。</p>' : '<p class="faint">还在额度内，玩得安心。</p>'}
    </section>

    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">游戏库</div>
        <div class="card-actions">
          <input class="input mini" id="game-name" placeholder="游戏名" style="width:150px" data-enter="1" data-enter-action="add-game" data-focus-key="game-name">
          <select class="input mini" id="game-platform"><option value="PC">PC</option><option value="Steam">Steam</option><option value="Switch">Switch</option><option value="PS5">PS5</option><option value="手游">手游</option><option value="其他">其他</option></select>
          <select class="input mini" id="game-status">${GAME_STATUS.map((status) => `<option value="${status.key}">${status.label}</option>`).join('')}</select>
          <button class="btn small primary" data-action="add-game">＋ 加游戏</button>
        </div>
      </div>
      ${libraryBlock(state)}
    </section>

    <div class="grid cols-2 section-gap">
      ${card({ title: '游玩记录', sub: '记了才知道时间去哪了', body: playsBlock(state) })}
      ${card({ title: '想玩 / 想看', body: watchBlock(state) })}
    </div>`;
}

function gameDrawer(game, ctx) {
  const state = ctx.state;
  const minutes = minutesForGame(state.games.plays, game.id);
  return openDrawer(`
    <div class="drawer-head"><div class="drawer-title">${esc(game.name)}</div><div class="spacer"></div>
      <span class="tag accent">${esc(statusLabel(game.status))}</span></div>
    <div class="grid cols-2">
      <div class="field"><label>游戏名</label>
        <input class="input" data-change-action="game-field" data-id="${esc(game.id)}" data-field="name" value="${esc(game.name)}"></div>
      <div class="field"><label>平台</label>
        <input class="input" data-change-action="game-field" data-id="${esc(game.id)}" data-field="platform" value="${esc(game.platform || '')}"></div>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>状态</label>
        <select class="input" data-change-action="game-field" data-id="${esc(game.id)}" data-field="status">
          ${GAME_STATUS.map((status) => `<option value="${status.key}" ${game.status === status.key ? 'selected' : ''}>${status.label}</option>`).join('')}
        </select></div>
      <div class="field"><label>评分（0-5）</label>
        <input class="input" type="number" min="0" max="5" data-change-action="game-field" data-id="${esc(game.id)}" data-field="rating" value="${game.rating ?? 0}"></div>
    </div>
    <div class="field"><label>备注</label>
      <input class="input" data-change-action="game-field" data-id="${esc(game.id)}" data-field="note" value="${esc(game.note || '')}"></div>
    <div class="hstack"><span class="faint">累计时长</span><b class="num">${formatMinutes(minutes)}</b></div>
    <div class="sep"></div>
    <div class="hstack">
      <button class="btn danger" data-action="del-game" data-id="${esc(game.id)}">删除游戏</button>
    </div>
    <p class="faint">删除游戏不会删掉已有的时长记录，只是这些记录会显示为「临时游戏」。</p>`);
}

export function handle(action, el, ctx, value) {
  const state = ctx.state;
  const id = el?.dataset?.id;

  if (action === 'new') { dom('game-name')?.focus(); return true; }
  if (action === 'focus-game') { dom('game-name')?.focus(); return true; }

  if (action === 'add-game') {
    const nameInput = dom('game-name');
    const name = String(value || nameInput?.value || '').trim();
    if (!name) { ctx.toast('先写游戏名'); return true; }
    ctx.mutate((doc) => {
      doc.games.library.push({
        id: uid('g'), name, platform: dom('game-platform')?.value || 'PC',
        status: dom('game-status')?.value || 'want', rating: 0, note: '',
      });
    });
    if (nameInput) nameInput.value = '';
    return true;
  }

  if (action === 'open-game') {
    const game = state.games.library.find((item) => item.id === id);
    if (game) gameDrawer(game, ctx);
    return true;
  }

  if (action === 'game-field') {
    const field = el.dataset.field;
    ctx.mutate((doc) => {
      const game = doc.games.library.find((item) => item.id === id);
      if (!game) return;
      game[field] = field === 'rating' ? Number(el.value) || 0 : el.value;
    });
    return true;
  }

  if (action === 'game-status') {
    ctx.mutate((doc) => {
      const game = doc.games.library.find((item) => item.id === id);
      if (!game) return;
      const index = GAME_STATUS.findIndex((status) => status.key === game.status);
      game.status = GAME_STATUS[(index + 1) % GAME_STATUS.length].key;
    });
    return true;
  }

  if (action === 'del-game') {
    ctx.mutate((doc) => {
      const index = doc.games.library.findIndex((item) => item.id === id);
      if (index >= 0) doc.games.library.splice(index, 1);
    }, { undo: true });
    openDrawer('');
    ctx.toast('游戏已删，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    return true;
  }

  if (action === 'add-play' || action === 'quick-play') {
    const minutes = action === 'quick-play' ? 30 : Number(dom('play-minutes')?.value || 0);
    const gameId = action === 'quick-play' ? id : (dom('play-game')?.value || '');
    if (!minutes) { ctx.toast('填一下分钟数'); return true; }
    ctx.mutate((doc) => {
      doc.games.plays.push({
        id: uid('pl'), gameId, date: action === 'quick-play' ? todayStr() : (dom('play-date')?.value || todayStr()),
        minutes, note: action === 'quick-play' ? '' : (dom('play-note')?.value || ''),
      });
    });
    ctx.toast(action === 'quick-play' ? '已记 30 分钟' : '记下了');
    return true;
  }

  if (action === 'del-play') {
    ctx.mutate((doc) => {
      const index = doc.games.plays.findIndex((item) => item.id === id);
      if (index >= 0) doc.games.plays.splice(index, 1);
    });
    return true;
  }

  if (action === 'add-wish') {
    const input = dom('wish-title');
    const title = String(value || input?.value || '').trim();
    if (!title) { ctx.toast('先写想玩 / 想看什么'); return true; }
    ctx.mutate((doc) => {
      doc.games.watchlist.push({ id: uid('w'), title, status: 'todo', note: '' });
    });
    if (input) input.value = '';
    return true;
  }

  if (action === 'wish-status') {
    ctx.mutate((doc) => {
      const item = doc.games.watchlist.find((row) => row.id === id);
      if (!item) return;
      const index = WATCH_STATUS.findIndex((status) => status.key === item.status);
      item.status = WATCH_STATUS[(index + 1) % WATCH_STATUS.length].key;
    });
    return true;
  }

  if (action === 'wish-to-lib') {
    const item = state.games.watchlist.find((row) => row.id === id);
    if (!item) return true;
    ctx.mutate((doc) => {
      doc.games.library.push({ id: uid('g'), name: item.title, platform: 'PC', status: 'want', rating: 0, note: '' });
      const index = doc.games.watchlist.findIndex((row) => row.id === id);
      if (index >= 0) doc.games.watchlist.splice(index, 1);
    });
    ctx.toast('已转进游戏库');
    return true;
  }

  if (action === 'del-wish') {
    ctx.mutate((doc) => {
      const index = doc.games.watchlist.findIndex((row) => row.id === id);
      if (index >= 0) doc.games.watchlist.splice(index, 1);
    });
    return true;
  }

  if (action === 'play-filter') return true;

  return false;
}
