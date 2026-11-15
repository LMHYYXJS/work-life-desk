// 数据与设置：数据文件信息 + 备份/恢复 + 偏好 + 每日回顾 + 危险区

import { defaultDoc, isoNow, todayStr, uid } from '../schema.js';
import { card, dom, empty, esc, tag } from '../ui.js';

export const meta = { id: 'settings', title: '数据与设置', icon: '⚙️' };

const backupState = { loaded: false, loading: false, items: [], error: '', lastAt: '' };

function fmtSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function fmtTime(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—';
}

function backupKind(name = '') {
  if (name.includes('pre-restore')) return { label: '恢复前自动', cls: 'warn' };
  if (/^\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(name)) return { label: '手动', cls: 'accent' };
  return { label: '每日自动', cls: '' };
}

function backupRows(state) {
  if (backupState.loading) return '<div class="faint">正在读备份目录…</div>';
  if (backupState.error) return `<div class="down">${esc(backupState.error)}</div>`;
  if (!backupState.items.length) return empty('还没有备份。点右边「立即备份」生成第一份');
  return backupState.items.map((item) => {
    const kind = backupKind(item.name);
    const counts = item.counts || {};
    const summary = `任务 ${counts.tasks || 0} · 选题 ${counts.ideas || 0} · 项目 ${counts.projects || 0} · 线索 ${counts.leads || 0}`;
    return `
      <div class="row" data-item-id="${esc(item.name)}">
        <div class="stack" style="gap:2px">
          <span class="row-title num">${esc(item.name)}</span>
          <span class="faint">${esc(item.mtime || '')} · ${fmtSize(item.size)} · ${esc(summary)}</span>
        </div>
        <span class="row-meta">${tag(kind.label, kind.cls)}${item.valid === false ? tag('文件损坏', 'danger') : ''}</span>
        <div class="row-actions">
          <button class="btn small" data-action="restore-backup" data-name="${esc(item.name)}" ${item.valid === false ? 'disabled' : ''}>恢复</button>
        </div>
      </div>`;
  }).join('');
}

function reviewBlock(state) {
  const reviews = [...state.reviews].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const todayReview = reviews.find((review) => review.date === todayStr());
  return `
    <div class="grid cols-3">
      <div class="field"><label>今天做成的</label>
        <input class="input" id="review-good" value="${esc(todayReview?.good || '')}" placeholder="一句话就够"></div>
      <div class="field"><label>卡在哪</label>
        <input class="input" id="review-block" value="${esc(todayReview?.block || '')}" placeholder="卡点"></div>
      <div class="field"><label>明天第一件事</label>
        <input class="input" id="review-next" value="${esc(todayReview?.next || '')}" placeholder="明天先做这个"></div>
    </div>
    <div class="hstack" style="margin-top:10px">
      <button class="btn primary small" data-action="save-review">存今天回顾</button>
      <span class="faint">${todayReview ? '今天已写过，改了再存会覆盖' : '写一句也行'}</span>
    </div>
    <div class="sep"></div>
    ${reviews.length ? reviews.slice(0, 5).map((review) => `
      <div class="tl-item">
        <span class="tl-date">${esc(String(review.date).slice(5))}</span>
        <span class="tl-text">${esc(review.good || '—')}${review.block ? ` · 卡：${esc(review.block)}` : ''}${review.next ? ` · 明天：${esc(review.next)}` : ''}</span>
      </div>`).join('') : '<div class="faint">还没有回顾记录</div>'}`;
}

export function render(ctx) {
  const state = ctx.state;
  const store = ctx.store;
  const meta = store?.meta || {};
  const settings = state.settings || {};
  const counts = meta.counts || {};
  const dataPath = meta.path || '（启动后由服务端返回）';

  // 首次进入本页时自动读一次备份目录（Node 测试环境没有 window，不触发）
  if (!backupState.loaded && !backupState.loading && typeof window !== 'undefined' && ctx.api) {
    backupState.loading = true;
    ctx.api.backups().then((result) => {
      backupState.loading = false;
      backupState.loaded = true;
      if (result.ok) {
        backupState.items = result.data.items || [];
        backupState.error = '';
      } else {
        backupState.error = result.data?.error || '读备份列表失败';
      }
      if (typeof ctx.refresh === 'function') ctx.refresh();
    });
  }

  return `
    <div class="kpi-row">
      <div class="stat"><span class="stat-value num">${store?.rev ?? '—'}</span><span class="stat-label">数据版本 rev</span></div>
      <div class="stat"><span class="stat-value">${fmtSize(meta.size)}</span><span class="stat-label">数据文件大小</span></div>
      <div class="stat"><span class="stat-value">${fmtTime(store?.lastSavedAt)}</span><span class="stat-label">最后保存</span></div>
      <div class="stat"><span class="stat-value num">${backupState.items.length}</span><span class="stat-label">可用备份</span></div>
    </div>

    <div class="grid cols-2 section-gap">
      ${card({
        title: '数据文件',
        sub: '所有内容就在这一个 JSON 里，复制走就能带走',
        body: `
          <div class="stack">
            <div class="field"><label>文件路径</label><div class="code-line">${esc(dataPath)}</div></div>
            <div class="hstack"><span class="faint">记录数</span><span class="num">任务 ${counts.tasks || 0} · 备忘 ${counts.memos || 0} · 选题 ${counts.ideas || 0} · 发布 ${counts.posts || 0} · 项目 ${counts.projects || 0} · 线索 ${counts.leads || 0} · 训练 ${counts.sessions || 0} · 游戏 ${counts.games || 0}</span></div>
            <div class="hstack">
              <button class="btn small primary" data-action="save-now">立即写盘</button>
              <button class="btn small" data-action="copy-path">复制路径</button>
            </div>
            <p class="faint">保存是整份覆盖写，先写临时文件再替换，断电也不会写坏原文件。</p>
          </div>`,
      })}
      ${card({
        title: '备份与恢复',
        sub: '恢复之前会自动再备份一份，手滑也能退回来',
        actions: `<div class="hstack"><button class="btn small" data-action="refresh-backups">刷新列表</button><button class="btn small primary" data-action="backup-now">立即备份</button></div>`,
        body: `
          <div class="inline-form" style="margin-bottom:10px">
            <label class="hstack faint"><input type="checkbox" data-change-action="setting" data-field="autoBackup" ${settings.autoBackup ? 'checked' : ''}> 每日自动备份</label>
            <span class="faint">保留</span>
            <select class="input mini" data-change-action="setting" data-field="backupKeepDays">
              ${[7, 14, 30, 90].map((days) => `<option value="${days}" ${Number(settings.backupKeepDays) === days ? 'selected' : ''}>${days} 天</option>`).join('')}
            </select>
          </div>
          <div class="stack">${backupRows(state)}</div>
          <div class="sep"></div>
          <div class="hstack" style="flex-wrap:wrap">
            <button class="btn small" data-action="export-backup">导出备份文件</button>
            <label class="btn small" for="import-file">从文件恢复</label>
            <input type="file" id="import-file" accept="application/json,.json" class="hidden-file" data-change-action="import-backup">
            <span class="faint">导出的 .json 可以拷到别的盘，也能从它恢复</span>
          </div>`,
      })}
    </div>

    <section class="card section-gap">
      <div class="card-head"><div class="card-title">外观与习惯</div><div class="card-actions faint">改完立刻生效，自动保存</div></div>
      <div class="grid cols-3">
        <div class="field"><label>主题</label>
          <select class="input" data-change-action="setting" data-field="theme">
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>深色（默认）</option>
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>浅色</option>
          </select></div>
        <div class="field"><label>字号</label>
          <select class="input" data-change-action="setting" data-field="fontSize">
            <option value="small" ${settings.fontSize === 'small' ? 'selected' : ''}>小</option>
            <option value="normal" ${settings.fontSize === 'normal' ? 'selected' : ''}>正常</option>
            <option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>大</option>
          </select></div>
        <div class="field"><label>项目进度</label>
          <select class="input" data-change-action="setting" data-field="projectProgressMode">
            <option value="auto" ${settings.projectProgressMode === 'auto' ? 'selected' : ''}>按条目自动算</option>
            <option value="manual" ${settings.projectProgressMode === 'manual' ? 'selected' : ''}>我自己填</option>
          </select></div>
      </div>
      <div class="grid cols-3" style="margin-top:10px">
        <div class="field"><label>昨天没做完的任务</label>
          <select class="input" data-change-action="setting" data-field="carryOverYesterday">
            <option value="true" ${settings.carryOverYesterday ? 'selected' : ''}>自动挪到今天</option>
            <option value="false" ${!settings.carryOverYesterday ? 'selected' : ''}>留在昨天</option>
          </select></div>
        <div class="field"><label>每日热量目标（kcal）</label>
          <input class="input" type="number" min="800" step="50" data-change-action="setting" data-field="calorieGoal" value="${settings.calorieGoal}"></div>
        <div class="field"><label>每日饮水目标（杯）</label>
          <input class="input" type="number" min="1" data-change-action="setting" data-field="waterGoal" value="${settings.waterGoal}"></div>
      </div>
      <div class="grid cols-3" style="margin-top:10px">
        <div class="field"><label>每周娱乐上限（小时）</label>
          <input class="input" type="number" min="0" step="1" data-change-action="setting" data-field="entertainmentWeeklyLimit" value="${settings.entertainmentWeeklyLimit}"></div>
        <div class="field"><label>首页摘要卡</label>
          <div class="hstack" style="flex-wrap:wrap; gap:12px">
            ${[['media', '自媒体'], ['dev', '开发'], ['fitness', '健身'], ['games', '游戏娱乐']].map(([key, label]) => `
              <label class="hstack faint"><input type="checkbox" data-change-action="home-summary" data-key="${key}" ${(settings.homeSummary || []).includes(key) ? 'checked' : ''}> ${label}</label>`).join('')}
          </div></div>
      </div>
    </section>

    <section class="card section-gap">
      <div class="card-head"><div class="card-title">每日回顾</div><div class="card-actions faint">三句话，写给明天的自己</div></div>
      ${reviewBlock(state)}
    </section>

    <div class="grid cols-2 section-gap">
      ${card({
        title: '快捷键',
        sub: '不用鼠标也能跑',
        body: `
          <table class="table">
            <tbody>
              <tr><td class="num">1 – 9</td><td>切到对应页面</td></tr>
              <tr><td class="num">Ctrl + B</td><td>收起 / 展开侧栏</td></tr>
              <tr><td class="num">Ctrl + S</td><td>立即写盘</td></tr>
              <tr><td class="num">N</td><td>当前页新建</td></tr>
              <tr><td class="num">Esc</td><td>关掉抽屉</td></tr>
            </tbody>
          </table>`,
      })}
      ${card({
        title: '关于',
        sub: '纯本地，不联网，不登录',
        body: `
          <div class="stack">
            <div class="hstack"><span class="faint">版本</span><span class="num">${esc(meta.appVersion || '1.0.0')}</span></div>
            <div class="hstack"><span class="faint">数据格式</span><span class="num">schemaVersion ${esc(String(meta.schemaVersion ?? 1))}</span></div>
            <p class="faint">启动：双击「启动.bat」。关闭：双击「关闭.bat」。数据在 data 目录，整个文件夹复制走就是完整迁移。</p>
            <div class="hstack"><button class="btn small" data-action="open-readme">怎么用</button></div>
          </div>`,
      })}
    </div>

    <section class="card section-gap danger-zone">
      <div class="card-head"><div class="card-title">危险区</div><div class="card-actions faint">都会先问一遍，且写入前自动备份</div></div>
      <div class="hstack" style="flex-wrap:wrap">
        <button class="btn danger" data-action="reset-settings">恢复默认设置</button>
        <button class="btn danger" data-action="wipe-data">清空全部数据</button>
      </div>
      <p class="faint">清空全部数据会删掉任务、备忘和各模块记录，但不会删掉备份文件；如果后悔，可以从上面的备份里恢复。</p>
    </section>`;
}

async function reloadBackups(ctx) {
  backupState.loading = true;
  ctx.refresh();
  const result = await ctx.api.backups();
  backupState.loading = false;
  backupState.loaded = true;
  if (result.ok) {
    backupState.items = result.data.items || [];
    backupState.error = '';
    backupState.lastAt = isoNow();
  } else {
    backupState.error = result.data?.error || '读备份列表失败';
  }
  ctx.refresh();
}

export function handle(action, el, ctx, value) {
  if (action === 'new') return true;

  if (action === 'setting') {
    const field = el.dataset.field;
    if (!field) return false;
    let next = el.type === 'checkbox' ? el.checked : el.value;
    if (['calorieGoal', 'waterGoal', 'backupKeepDays', 'entertainmentWeeklyLimit'].includes(field)) {
      next = Number(next) || 0;
    }
    if (field === 'carryOverYesterday') next = next === true || next === 'true';
    ctx.mutate((doc) => { doc.settings[field] = next; });
    return true;
  }

  if (action === 'home-summary') {
    const key = el.dataset.key;
    ctx.mutate((doc) => {
      const list = Array.isArray(doc.settings.homeSummary) ? doc.settings.homeSummary : [];
      doc.settings.homeSummary = el.checked
        ? Array.from(new Set([...list, key]))
        : list.filter((item) => item !== key);
    });
    return true;
  }

  if (action === 'export-backup') {
    const doc = ctx.store?.doc;
    if (!doc) return true;
    if (typeof document === 'undefined' || typeof Blob === 'undefined') return true;
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `工作生活台-备份-${todayStr()}.json`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
    ctx.toast('已导出备份文件');
    return true;
  }

  if (action === 'import-backup') {
    const file = el.files && el.files[0];
    if (!file) return true;
    file.text().then((text) => {
      let doc = null;
      try {
        doc = JSON.parse(text);
      } catch (error) {
        ctx.toast('这个文件不是合法 JSON，没有导入');
        return;
      }
      const tasksCount = Array.isArray(doc?.tasks) ? doc.tasks.length : 0;
      const leadsCount = Array.isArray(doc?.consult?.leads) ? doc.consult.leads.length : 0;
      ctx.confirm({
        title: '用这个文件覆盖当前数据？',
        text: `文件里有任务 ${tasksCount} 条、咨询线索 ${leadsCount} 条。结构不合法会被拒绝，确认前会先自动备份当前数据。`,
        confirmLabel: '导入并恢复',
        danger: true,
      }).then(async (ok) => {
        if (!ok) return;
        const result = await ctx.api.restoreByDoc(doc);
        if (!result.ok) { ctx.toast(result.data?.error || '文件结构不合法，已拒绝'); return; }
        await ctx.store.load();
        reloadBackups(ctx);
        ctx.toast(`已从文件恢复（恢复前备份：${result.data.preBackupName || '已生成'}）`);
      });
    }).catch(() => ctx.toast('读取文件失败'));
    return true;
  }
  if (action === 'save-now') {
    ctx.store.saveNow();
    ctx.toast('正在写盘');
    return true;
  }

  if (action === 'copy-path') {
    const text = ctx.store?.meta?.path || '';
    if (navigator?.clipboard && text) {
      navigator.clipboard.writeText(text).then(() => ctx.toast('路径已复制')).catch(() => ctx.toast(text));
    } else {
      ctx.toast(text || '路径还没读到');
    }
    return true;
  }

  if (action === 'backup-now') {
    ctx.api.backup().then((result) => {
      if (result.ok) {
        ctx.toast(`已备份：${result.data.name}`);
        reloadBackups(ctx);
      } else {
        ctx.toast(result.data?.error || '备份失败');
      }
    });
    return true;
  }

  if (action === 'refresh-backups') {
    reloadBackups(ctx);
    return true;
  }

  if (action === 'restore-backup') {
    const name = el.dataset.name;
    const item = backupState.items.find((backup) => backup.name === name);
    const counts = item?.counts || {};
    ctx.confirm({
      title: '从这个备份恢复？',
      text: `备份 ${name}：任务 ${counts.tasks || 0} 条、选题 ${counts.ideas || 0} 条、项目 ${counts.projects || 0} 个、线索 ${counts.leads || 0} 条。恢复会用这份内容覆盖当前数据，覆盖前自动把现在的内容再备份一份。`,
      confirmLabel: '恢复',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      const result = await ctx.api.restoreByName(name);
      if (!result.ok) { ctx.toast(result.data?.error || '恢复失败'); return; }
      await ctx.store.load();
      reloadBackups(ctx);
      ctx.toast(`已恢复，恢复前备份：${result.data.preBackupName || '已生成'}`);
    });
    return true;
  }

  if (action === 'save-review') {
    const good = String(dom('review-good')?.value || '').trim();
    const block = String(dom('review-block')?.value || '').trim();
    const next = String(dom('review-next')?.value || '').trim();
    if (!good && !block && !next) { ctx.toast('至少写一句'); return true; }
    ctx.mutate((doc) => {
      const date = todayStr();
      const existing = doc.reviews.find((review) => review.date === date);
      if (existing) {
        existing.good = good; existing.block = block; existing.next = next; existing.updatedAt = isoNow();
      } else {
        doc.reviews.push({ id: uid('r'), date, good, block, next, createdAt: isoNow() });
      }
    });
    ctx.toast('回顾已存');
    return true;
  }

  if (action === 'reset-settings') {
    ctx.confirm({
      title: '恢复默认设置？',
      text: '主题、字号、各目标值都会回到默认，任务和记录不受影响。',
      confirmLabel: '恢复默认',
    }).then((ok) => {
      if (!ok) return;
      ctx.mutate((doc) => { doc.settings = defaultDoc().settings; });
      ctx.refresh();
      ctx.toast('设置已恢复默认');
    });
    return true;
  }

  if (action === 'wipe-data') {
    ctx.confirmTyped({
      title: '清空全部数据？',
      text: '任务、备忘、自媒体、开发、咨询、健身、饮食、游戏记录都会清空。清空前会自动备份一份，备份文件不会被删，可以恢复。',
      word: '确认删除',
      confirmLabel: '清空',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      const result = await ctx.api.backup();
      if (!result.ok) { ctx.toast('先备份失败，已中止清空'); return; }
      ctx.replaceDoc(defaultDoc());
      ctx.refresh();
      ctx.toast('已清空，可从备份恢复');
    });
    return true;
  }

  if (action === 'open-readme') {
    ctx.toast('使用说明.txt 就在应用根目录');
    return true;
  }

  return false;
}
