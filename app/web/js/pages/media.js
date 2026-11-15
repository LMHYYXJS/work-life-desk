// 自媒体：五列内容流水线 + 发布数据台账 + 粉丝记录

import { isoNow, todayStr, uid } from '../schema.js';
import {
  IDEA_STAGES, PLATFORMS, followerSnapshot, ideasByStage, isUpdateDue,
  monthPosts, moveIdea, nextStage, normalizeIdeaStage, totalViews,
} from '../logic.js';
import {
  CHART_COLORS, RANGE_OPTIONS, chartSummary, comparisonSeries, filterPosts, lineChart, postSeries, rangeStart,
} from '../charts.js';
import { card, dom, empty, esc, openDrawer, tag } from '../ui.js';

export const meta = { id: 'media', title: '自媒体', icon: '🎬' };

let postFilter = 'all';
let chartRange = '30';
let chartPlatform = 'all';
let chartPostId = null;
let compareIds = [];

function platformLabel(key) {
  return PLATFORMS.find((item) => item.key === key)?.label || '未选平台';
}

function stageLabel(key) {
  const normalized = normalizeIdeaStage(key);
  return IDEA_STAGES.find((item) => item.key === normalized)?.label || normalized;
}

function ideaCard(idea) {
  const stage = normalizeIdeaStage(idea.stage);
  return `
    <div class="kcard" draggable="true" data-item-id="${esc(idea.id)}" data-stage="${esc(stage)}"
      data-order="${Number(idea.order) || 0}" data-action="open-idea" data-id="${esc(idea.id)}">
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
    <div class="kanban four">
      ${IDEA_STAGES.map((stage) => `
        <div class="kcol" data-stage="${esc(stage.key)}">
          <div class="kcol-head"><b>${esc(stage.label)}</b><span class="kcol-count">${byStage[stage.key].length}</span></div>
          ${byStage[stage.key].length ? byStage[stage.key].map(ideaCard).join('') : '<div class="kcol-empty">空的，拖一张卡进来</div>'}
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

function snapshotRows(post) {
  if (!post) return '<div class="faint">先选一条发布记录</div>';
  const snapshots = [...(post.snapshots || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!snapshots.length) return '<div class="faint">还没有数据点。补第一条后，走势图就有线了</div>';
  return `
    <table class="table">
      <thead><tr><th>日期</th><th class="num">播放</th><th class="num">赞</th><th class="num">评</th><th class="num">藏</th><th></th></tr></thead>
      <tbody>
        ${snapshots.slice(0, 8).map((snapshot) => `
          <tr>
            <td class="num">${esc(snapshot.date)}</td>
            <td class="num">${Number(snapshot.views) || 0}</td>
            <td class="num">${Number(snapshot.likes) || 0}</td>
            <td class="num">${Number(snapshot.comments) || 0}</td>
            <td class="num">${Number(snapshot.saves) || 0}</td>
            <td><button class="btn small danger" data-action="del-snapshot" data-post="${esc(post.id)}" data-id="${esc(snapshot.id)}">✕</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function chartSection(state) {
  const today = todayStr();
  const from = rangeStart(chartRange, today);
  const platformPosts = filterPosts(state.media.posts, { platform: chartPlatform });
  const rangePosts = filterPosts(state.media.posts, { platform: chartPlatform, from, to: today });
  if (!rangePosts.some((post) => post.id === chartPostId)) chartPostId = rangePosts[0]?.id || null;
  const focus = rangePosts.find((post) => post.id === chartPostId) || null;

  const singleSeries = focus ? [{
    id: focus.id,
    label: focus.title || '未命名',
    color: CHART_COLORS[0],
    points: postSeries(focus, { from, to: today }),
  }] : [];
  const selectedIds = compareIds.filter((id) => rangePosts.some((post) => post.id === id));
  const multiSeries = comparisonSeries(state.media.posts, {
    platform: chartPlatform, from, to: today, selectedIds,
  });
  const summary = chartSummary(state.media.posts, { platform: chartPlatform, from, to: today });

  const platformOptions = PLATFORMS
    .map((platform) => `<option value="${platform.key}" ${chartPlatform === platform.key ? 'selected' : ''}>${esc(platform.label)}</option>`)
    .join('');
  const postOptions = rangePosts
    .map((post) => `<option value="${esc(post.id)}" ${post.id === chartPostId ? 'selected' : ''}>${esc(post.title)}</option>`)
    .join('');
  const snapPostOptions = platformPosts
    .map((post) => `<option value="${esc(post.id)}" ${post.id === chartPostId ? 'selected' : ''}>${esc(post.title)} · ${esc(platformLabel(post.platform))}</option>`)
    .join('');

  return `
    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">发布数据可视化</div>
        <span class="card-sub">手动录入，不自动抓取</span>
        <div class="card-actions">
          <select class="input mini" data-change-action="chart-range">
            ${RANGE_OPTIONS.map((item) => `<option value="${item.key}" ${chartRange === item.key ? 'selected' : ''}>${item.label}</option>`).join('')}
          </select>
          <select class="input mini" data-change-action="chart-platform">
            <option value="all" ${chartPlatform === 'all' ? 'selected' : ''}>全部平台</option>
            ${platformOptions}
          </select>
        </div>
      </div>
      <div class="kpi-row chart-kpis">
        <div class="stat"><span class="stat-value num">${summary.views >= 10000 ? `${(summary.views / 10000).toFixed(1)}w` : summary.views}</span><span class="stat-label">总播放</span></div>
        <div class="stat"><span class="stat-value num">${summary.likes}</span><span class="stat-label">总赞</span></div>
        <div class="stat"><span class="stat-value num">${summary.comments}</span><span class="stat-label">总评论</span></div>
        <div class="stat"><span class="stat-value num">${summary.saves}</span><span class="stat-label">总收藏</span></div>
        <div class="stat"><span class="stat-value num">${summary.posts}</span><span class="stat-label">范围内记录</span></div>
      </div>

      <div class="grid cols-2 section-gap">
        ${card({
          title: '单条走势',
          sub: '播放量随时间变化',
          actions: `<select class="input mini" data-change-action="chart-post">${postOptions || '<option value="">没有可画的记录</option>'}</select>`,
          body: lineChart(singleSeries, { from, to: today }),
        })}
        ${card({
          title: '多条对比',
          sub: '最多同时对比 4 条',
          body: `
            <div class="chart-compare-list">
              ${rangePosts.length ? rangePosts.map((post) => `
                <label class="chart-compare-item">
                  <input type="checkbox" data-change-action="chart-compare" data-id="${esc(post.id)}" ${selectedIds.includes(post.id) ? 'checked' : ''}>
                  <span class="cut">${esc(post.title)}</span>
                </label>`).join('') : '<span class="faint">范围内没有发布记录</span>'}
            </div>
            ${lineChart(multiSeries, { from, to: today, valueLabel: '对比播放' })}
            <p class="faint">不勾选时自动选数据点最多的 4 条。</p>`,
        })}
      </div>

      <div class="grid cols-2 section-gap">
        ${card({
          title: '补一条发布数据',
          sub: '数字从平台后台抄过来',
          body: `
            <div class="inline-form">
              <select class="input mini" id="snap-post">${snapPostOptions || '<option value="">先有发布记录</option>'}</select>
              <input class="input mini" type="date" id="snap-date" value="${esc(today)}">
              <input class="input mini" type="number" min="0" id="snap-views" placeholder="播放" style="width:82px">
              <input class="input mini" type="number" min="0" id="snap-likes" placeholder="赞" style="width:70px">
              <input class="input mini" type="number" min="0" id="snap-comments" placeholder="评" style="width:70px">
              <input class="input mini" type="number" min="0" id="snap-saves" placeholder="藏" style="width:70px">
              <button class="btn small primary" data-action="add-snapshot">保存数据点</button>
            </div>
            <p class="faint">同一天再记一次会覆盖当天数字，不会重复累加。</p>`,
        })}
        ${card({
          title: '数据点明细',
          sub: focus ? `${focus.title} · ${platformLabel(focus.platform)}` : '未选记录',
          body: snapshotRows(focus),
        })}
      </div>
    </section>`;
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
    </div>

    ${chartSection(state)}`;
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
      ${normalizeIdeaStage(idea.stage) === 'ready' ? `<button class="btn primary" data-action="make-post" data-id="${esc(idea.id)}">生成发布记录</button>` : ''}
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
      const column = doc.media.ideas.filter((item) => normalizeIdeaStage(item.stage) === 'idea');
      doc.media.ideas.push({
        id: uid('i'), title, stage: 'idea', platform: dom('idea-platform')?.value || 'douyin',
        platforms: [], scriptOutline: '', refLink: '', planDate: null, publishedAt: null, note: '', createdAt: isoNow(),
        order: column.length,
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
      if (next === 'ready' && !target.publishedAt) target.order = doc.media.ideas.filter((item) => item.id !== id && normalizeIdeaStage(item.stage) === 'ready').length;
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

  if (action === 'move-idea') {
    let payload = {};
    try { payload = JSON.parse(value || '{}'); } catch (error) { payload = {}; }
    const target = normalizeIdeaStage(payload.stage || el?.dataset?.stage);
    const beforeId = payload.beforeId || null;
    if (!id) return true;
    ctx.mutate((doc) => {
      doc.media.ideas = moveIdea(doc.media.ideas, id, target, beforeId);
    });
    return true;
  }

  if (action === 'chart-range') { chartRange = value || '30'; return true; }
  if (action === 'chart-platform') { chartPlatform = value || 'all'; return true; }
  if (action === 'chart-post') { chartPostId = value || null; return true; }

  if (action === 'chart-compare') {
    const postId = el?.dataset?.id;
    if (!postId) return true;
    if (el.checked) {
      if (!compareIds.includes(postId) && compareIds.length >= 4) {
        ctx.toast('最多同时对比 4 条');
        return true;
      }
      compareIds = [...new Set([...compareIds, postId])].slice(0, 4);
    } else {
      compareIds = compareIds.filter((item) => item !== postId);
    }
    return true;
  }

  if (action === 'add-snapshot') {
    const postId = dom('snap-post')?.value;
    const date = dom('snap-date')?.value || todayStr();
    const post = state.media.posts.find((item) => item.id === postId);
    if (!post) { ctx.toast('先选一条发布记录'); return true; }
    const metrics = {
      views: Number(dom('snap-views')?.value || 0),
      likes: Number(dom('snap-likes')?.value || 0),
      comments: Number(dom('snap-comments')?.value || 0),
      saves: Number(dom('snap-saves')?.value || 0),
    };
    ctx.mutate((doc) => {
      const target = doc.media.posts.find((item) => item.id === postId);
      if (!target) return;
      target.snapshots = target.snapshots || [];
      const existing = target.snapshots.find((snapshot) => snapshot.date === date);
      if (existing) {
        Object.assign(existing, metrics);
      } else {
        target.snapshots.push({ id: uid('sn'), date, ...metrics });
      }
      target.snapshots.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      Object.assign(target, metrics);
    });
    ctx.toast('已保存数据点');
    return true;
  }

  if (action === 'del-snapshot') {
    const postId = el?.dataset?.post;
    ctx.mutate((doc) => {
      const post = doc.media.posts.find((item) => item.id === postId);
      if (!post) return;
      post.snapshots = (post.snapshots || []).filter((snapshot) => snapshot.id !== id);
      const latest = [...post.snapshots].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      if (latest) {
        ['views', 'likes', 'comments', 'saves'].forEach((field) => { post[field] = Number(latest[field]) || 0; });
      }
    });
    return true;
  }

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
