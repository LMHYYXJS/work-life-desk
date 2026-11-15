// 自媒体：五列内容流水线 + 发布数据台账 + 粉丝记录

import { isoNow, todayStr, uid } from '../schema.js';
import {
  IDEA_STAGES, PLATFORMS, followerSnapshot, ideasByStage, isUpdateDue,
  monthPosts, nextStage, totalViews,
} from '../logic.js';
import { card, dom, empty, esc, openDrawer, tag } from '../ui.js';

export const meta = { id: 'media', title: '自媒体', icon: '🎬' };

let postFilter = 'all';

function platformLabel(key) {
  return PLATFORMS.find((item) => item.key === key)?.label || '未选平台';
}

function stageLabel(key) {
  return IDEA_STAGES.find((item) => item.key === key)?.label || key;
}

function ideaCard(idea) {
  return `
    <div class="kcard" data-item-id="${esc(idea.id)}" data-action="open-idea" data-id="${esc(idea.id)}">
      <div class="kcard-title">${esc(idea.title)}</div>
      <div class="kcard-meta">
        <span>${esc(platformLabel(idea.platform))}</span>
        ${idea.planDate ? `<span class="num">${esc(idea.planDate.slice(5))}</span>` : ''}
      </div>
    </div>`;
}

function kanban(state) {
  const byStage = ideasByStage(state.media.ideas);
  return `
    <div class="kanban">
      ${IDEA_STAGES.map((stage) => `
        <div class="kcol">
          <div class="kcol-head"><b>${esc(stage.label)}</b><span class="kcol-count">${byStage[stage.key].length}</span></div>
          ${byStage[stage.key].length ? byStage[stage.key].map(ideaCard).join('') : '<div class="kcol-empty">空的，往这里推一个</div>'}
        </div>`).join('')}
    </div>`;
}

function postsTable(state) {
  const all = state.media.posts
    .filter((post) => postFilter === 'all' || post.platform === postFilter)
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  if (!all.length) {
    return empty('还没有发布记录。选题推进到「发布」后会自动出现在这里');
  }
  return `
    <table class="table">
      <thead><tr><th>标题</th><th>平台</th><th>发布</th><th class="num">播放</th><th class="num">赞</th><th class="num">评</th><th class="num">藏</th></tr></thead>
      <tbody>
        ${all.map((post) => `
          <tr data-item-id="${esc(post.id)}">
            <td class="cut" title="${esc(post.title)}">${esc(post.title)}</td>
            <td>${esc(platformLabel(post.platform))}</td>
            <td class="num">${esc(String(post.publishedAt || '').slice(5))}</td>
            ${['views', 'likes', 'comments', 'saves'].map((field) => `
              <td class="num"><input class="input mini num" style="width:64px" type="number" min="0"
                data-change-action="post-field" data-id="${esc(post.id)}" data-field="${field}"
                value="${post[field] ?? ''}" placeholder="0"></td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function followersBlock(state) {
  const snapshot = followerSnapshot(state.media.followers);
  const rows = PLATFORMS.filter((platform) => snapshot[platform.key]);
  return `
    <div class="stack">
      ${rows.length ? rows.map((platform) => {
        const item = snapshot[platform.key];
        const delta = item.delta;
        return `
          <div class="hstack">
            <span class="tag">${esc(platform.label)}</span>
            <b class="num">${esc(item.count)}</b>
            <span class="${delta > 0 ? 'up' : delta < 0 ? 'down' : 'faint'}">${delta > 0 ? '↑' : delta < 0 ? '↓' : '—'}${delta ? Math.abs(delta) : ''}</span>
            <span class="faint">${esc(item.latest?.date || '')}</span>
          </div>`;
      }).join('') : '<div class="faint">还没有粉丝记录</div>'}
      <div class="inline-form">
        <input class="input mini" type="date" id="follower-date" value="${esc(todayStr())}">
        <select class="input mini" id="follower-platform">
          ${PLATFORMS.map((platform) => `<option value="${platform.key}">${esc(platform.label)}</option>`).join('')}
        </select>
        <input class="input mini" type="number" min="0" id="follower-count" placeholder="数量" style="width:88px">
        <button class="btn small" data-action="add-follower">记录</button>
      </div>
    </div>`;
}

export function render(ctx) {
  const state = ctx.state;
  const today = todayStr();
  const monthCount = monthPosts(state.media.posts, today).length;
  const views = totalViews(state.media.posts);
  const followers = followerSnapshot(state.media.followers);
  const followerTotal = Object.values(followers).reduce((sum, item) => sum + item.count, 0);
  const due = isUpdateDue(state.media.nextUpdateAt, today);
  const pipeline = state.media.ideas.filter((idea) => idea.stage !== 'publish').length;

  return `
    <div class="kpi-row">
      <div class="stat"><span class="stat-value num">${monthCount}</span><span class="stat-label">本月发布</span></div>
      <div class="stat"><span class="stat-value num">${views >= 10000 ? `${(views / 10000).toFixed(1)}w` : views}</span><span class="stat-label">总播放（手动录）</span></div>
      <div class="stat"><span class="stat-value num">${followerTotal}</span><span class="stat-label">粉丝</span></div>
      <div class="stat"><span class="stat-value num">${pipeline}</span><span class="stat-label">流水线里待推进</span></div>
      <div class="stat">
        <input class="input mini" type="date" data-change-action="next-update" value="${esc(state.media.nextUpdateAt || '')}">
        <span class="stat-label">${due ? '<span class="tag warn">该更新了</span>' : '下次更新'}</span>
      </div>
    </div>

    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">内容流水线</div>
        <div class="card-actions">
          <input class="input mini" id="idea-title" placeholder="新选题，比如「Raft 第 4 期」" style="width:220px" data-enter="1" data-enter-action="add-idea" data-focus-key="idea-title">
          <select class="input mini" id="idea-platform">
            ${PLATFORMS.map((platform) => `<option value="${platform.key}">${esc(platform.label)}</option>`).join('')}
          </select>
          <button class="btn small primary" data-action="add-idea">＋ 新建选题</button>
        </div>
      </div>
      ${state.media.ideas.length ? kanban(state) : empty('还没有选题。想拍什么，先记下来', '记第一个选题', 'focus-idea')}
    </section>

    <div class="grid cols-2 section-gap">
      ${card({
        title: '平台数据',
        sub: '数字手动录，不联网抓取',
        actions: `<select class="input mini" data-change-action="filter-posts">
          <option value="all">全部平台</option>
          ${PLATFORMS.map((platform) => `<option value="${platform.key}" ${postFilter === platform.key ? 'selected' : ''}>${platform.label}</option>`).join('')}
        </select>`,
        body: postsTable(state),
      })}
      ${card({ title: '粉丝记录', sub: '按平台记，看涨跌', body: followersBlock(state) })}
    </div>`;
}

function ideaDrawer(idea, ctx) {
  const next = nextStage(idea.stage);
  return openDrawer(`
    <div class="drawer-head">
      <div class="drawer-title">${esc(idea.title)}</div>
      <div class="spacer"></div>
      <span class="tag accent">${esc(stageLabel(idea.stage))}</span>
    </div>
    <div class="field"><label>标题</label>
      <input class="input" data-change-action="idea-field" data-id="${esc(idea.id)}" data-field="title" value="${esc(idea.title)}"></div>
    <div class="field"><label>平台</label>
      <select class="input" data-change-action="idea-field" data-id="${esc(idea.id)}" data-field="platform">
        ${PLATFORMS.map((platform) => `<option value="${platform.key}" ${idea.platform === platform.key ? 'selected' : ''}>${esc(platform.label)}</option>`).join('')}
      </select></div>
    <div class="field"><label>计划发布日</label>
      <input class="input" type="date" data-change-action="idea-field" data-id="${esc(idea.id)}" data-field="planDate" value="${esc(idea.planDate || '')}"></div>
    <div class="field"><label>脚本大纲</label>
      <textarea class="input" rows="6" data-change-action="idea-field" data-id="${esc(idea.id)}" data-field="scriptOutline" placeholder="开头钩子 / 中间 / 结尾">${esc(idea.scriptOutline || '')}</textarea></div>
    <div class="field"><label>参考链接</label>
      <input class="input" data-change-action="idea-field" data-id="${esc(idea.id)}" data-field="refLink" value="${esc(idea.refLink || '')}" placeholder="https://…"></div>
    <div class="field"><label>备注</label>
      <input class="input" data-change-action="idea-field" data-id="${esc(idea.id)}" data-field="note" value="${esc(idea.note || '')}"></div>
    <div class="sep"></div>
    <div class="hstack">
      ${next ? `<button class="btn primary" data-action="advance-idea" data-id="${esc(idea.id)}">推进到 ${esc(stageLabel(next))} →</button>` : ''}
      ${idea.stage === 'publish' ? `<button class="btn primary" data-action="make-post" data-id="${esc(idea.id)}">生成发布记录</button>` : ''}
      <button class="btn danger" data-action="del-idea" data-id="${esc(idea.id)}">删除选题</button>
    </div>
    <p class="faint">推进阶段会写进历史；发布后生成的记录在「平台数据」里填数字。</p>
  `);
}

export function handle(action, el, ctx, value) {
  const state = ctx.state;
  const id = el?.dataset?.id;

  if (action === 'new') { dom('idea-title')?.focus(); return true; }
  if (action === 'focus-idea') { dom('idea-title')?.focus(); return true; }

  if (action === 'add-idea') {
    const titleInput = dom('idea-title');
    const title = String(value || titleInput?.value || '').trim();
    if (!title) { ctx.toast('先写选题标题'); return true; }
    ctx.mutate((doc) => {
      doc.media.ideas.push({
        id: uid('i'), title, stage: 'idea', platform: dom('idea-platform')?.value || 'douyin',
        platforms: [], scriptOutline: '', refLink: '', planDate: null, publishedAt: null, note: '', createdAt: isoNow(),
      });
    });
    if (titleInput) titleInput.value = '';
    return true;
  }

  if (action === 'open-idea') {
    const idea = state.media.ideas.find((item) => item.id === id);
    if (idea) ideaDrawer(idea, ctx);
    return true;
  }

  if (action === 'idea-field') {
    const field = el.dataset.field;
    ctx.mutate((doc) => {
      const idea = doc.media.ideas.find((item) => item.id === id);
      if (!idea) return;
      idea[field] = el.value;
    });
    return true;
  }

  if (action === 'advance-idea') {
    const idea = state.media.ideas.find((item) => item.id === id);
    const next = idea && nextStage(idea.stage);
    if (!next) { ctx.toast('已经到最后一步了'); return true; }
    ctx.mutate((doc) => {
      const target = doc.media.ideas.find((item) => item.id === id);
      target.stage = next;
      if (next === 'publish' && !target.publishedAt) target.publishedAt = todayStr();
    });
    openDrawer('');
    ctx.toast(`已推进到「${stageLabel(next)}」`);
    return true;
  }

  if (action === 'make-post') {
    const idea = state.media.ideas.find((item) => item.id === id);
    if (!idea) return true;
    if (state.media.posts.some((post) => post.ideaId === id)) {
      ctx.toast('这条已经生成过发布记录了');
      return true;
    }
    ctx.mutate((doc) => {
      doc.media.posts.push({
        id: uid('p'), ideaId: id, platform: idea.platform || 'douyin', title: idea.title,
        url: '', publishedAt: todayStr(), views: null, likes: null, comments: null, saves: null,
      });
    });
    ctx.toast('已生成发布记录，去下面填数字');
    return true;
  }

  if (action === 'del-idea') {
    ctx.mutate((doc) => {
      const index = doc.media.ideas.findIndex((item) => item.id === id);
      if (index >= 0) doc.media.ideas.splice(index, 1);
    }, { undo: true });
    openDrawer('');
    ctx.toast('已删除，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    return true;
  }

  if (action === 'post-field') {
    const field = el.dataset.field;
    const number = el.value === '' ? null : Number(el.value);
    ctx.mutate((doc) => {
      const post = doc.media.posts.find((item) => item.id === id);
      if (post) post[field] = Number.isNaN(number) ? null : number;
    });
    return true;
  }

  if (action === 'filter-posts') { postFilter = value || 'all'; ctx.refresh(); return true; }

  if (action === 'add-follower') {
    const count = Number(dom('follower-count')?.value || 0);
    const date = dom('follower-date')?.value || todayStr();
    const platform = dom('follower-platform')?.value || 'douyin';
    if (!count) { ctx.toast('先填粉丝数'); return true; }
    ctx.mutate((doc) => {
      doc.media.followers.push({ id: uid('f'), date, platform, count });
    });
    ctx.toast('已记下');
    return true;
  }

  if (action === 'next-update') {
    ctx.mutate((doc) => { doc.media.nextUpdateAt = el.value || null; });
    return true;
  }

  return false;
}
