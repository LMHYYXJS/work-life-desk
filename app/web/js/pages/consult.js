// 咨询工作：五段线索管道 + 待跟进提醒 + 沟通时间线 + 收入台账

import { addDays, isoNow, todayStr, uid } from '../schema.js';
import {
  LEAD_STAGES, followUps, isOverdue, leadsByStage, monthIncome, unpaidIncome,
} from '../logic.js';
import { card, dom, empty, esc, openDrawer, tag } from '../ui.js';

export const meta = { id: 'consult', title: '咨询工作', icon: '🤝' };

const PAY_STATUS = [
  { key: 'unpaid', label: '未收' },
  { key: 'partial', label: '部分' },
  { key: 'paid', label: '已收' },
];

function stageLabel(key) {
  return LEAD_STAGES.find((item) => item.key === key)?.label || key;
}

function leadCard(lead, today) {
  const overdue = isOverdue(lead, today);
  const money = lead.stage === 'deal' ? `¥${Number(lead.quote) || 0}` : '';
  return `
    <div class="kcard" data-action="open-lead" data-id="${esc(lead.id)}">
      <div class="kcard-title">${esc(lead.name)}</div>
      <div class="kcard-meta">
        <span class="cut">${esc(lead.need || '没写需求')}</span>
      </div>
      <div class="kcard-meta">
        ${money ? `<b class="num">${esc(money)}</b>` : ''}
        ${lead.nextFollowUp ? `<span class="${overdue ? 'down' : ''}">${overdue ? '⚠ ' : ''}${esc(String(lead.nextFollowUp).slice(5))}</span>` : ''}
      </div>
    </div>`;
}

function kanban(state, today) {
  const byStage = leadsByStage(state.consult.leads);
  return `
    <div class="kanban">
      ${LEAD_STAGES.map((stage) => `
        <div class="kcol">
          <div class="kcol-head"><b>${esc(stage.label)}</b><span class="kcol-count">${byStage[stage.key].length}</span></div>
          ${byStage[stage.key].length ? byStage[stage.key].map((lead) => leadCard(lead, today)).join('') : '<div class="kcol-empty">空的</div>'}
        </div>`).join('')}
    </div>`;
}

function followList(state, today) {
  const list = followUps(state.consult.leads, today);
  if (!list.length) return empty('没有要跟进的线索');
  return list.slice(0, 8).map((lead) => `
    <div class="row" data-item-id="${esc(lead.id)}">
      <span class="row-meta" style="min-width:78px">
        <span class="${lead.overdue ? 'down' : ''} num">${esc(lead.nextFollowUp)}</span>
      </span>
      <span class="row-title">${esc(lead.name)}</span>
      <span class="row-meta cut">${esc(lead.need || '')}${lead.overdue ? ` <span class="tag danger">逾期</span>` : ''}</span>
      <div class="row-actions">
        <button class="btn small primary" data-action="quick-follow" data-id="${esc(lead.id)}">已跟进</button>
        <button class="btn small" data-action="open-lead" data-id="${esc(lead.id)}">记一笔</button>
        <button class="btn small" data-action="snooze-lead" data-id="${esc(lead.id)}">顺延 3 天</button>
      </div>
    </div>`).join('');
}

function incomeBlock(state) {
  const incomes = [...state.consult.incomes].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
    <div class="inline-form" style="margin-bottom:10px">
      <input class="input mini" id="income-date" type="date" value="${esc(todayStr())}">
      <select class="input mini" id="income-lead"><option value="">不关联线索</option>
        ${state.consult.leads.map((lead) => `<option value="${lead.id}">${esc(lead.name)}</option>`).join('')}</select>
      <input class="input grow" id="income-item" placeholder="项目内容，比如「剪 3 条短片」">
      <input class="input mini" id="income-amount" type="number" min="0" placeholder="金额" style="width:88px">
      <button class="btn small primary" data-action="add-income">记一笔</button>
    </div>
    ${incomes.length ? `
      <table class="table">
        <thead><tr><th>日期</th><th>内容</th><th>对方</th><th class="num">金额</th><th>收款</th></tr></thead>
        <tbody>
          ${incomes.slice(0, 10).map((income) => `
            <tr data-item-id="${esc(income.id)}">
              <td class="num">${esc(income.date)}</td>
              <td class="cut">${esc(income.item)}</td>
              <td>${esc(state.consult.leads.find((lead) => lead.id === income.leadId)?.name || '—')}</td>
              <td class="num">${esc(income.amount)}</td>
              <td>
                <select class="input mini" data-change-action="income-status" data-id="${esc(income.id)}">
                  ${PAY_STATUS.map((status) => `<option value="${status.key}" ${income.paidStatus === status.key ? 'selected' : ''}>${status.label}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>` : empty('还没有收入记录')}`;
}

export function render(ctx) {
  const state = ctx.state;
  const today = todayStr();
  const list = followUps(state.consult.leads, today);
  const overdue = list.filter((lead) => lead.overdue).length;
  const deals = state.consult.leads.filter((lead) => lead.stage === 'deal').length;
  const month = monthIncome(state.consult.incomes, today);
  const unpaid = unpaidIncome(state.consult.incomes);

  return `
    <div class="kpi-row">
      <div class="stat"><span class="stat-value num">${list.length}</span><span class="stat-label">待跟进</span></div>
      <div class="stat"><span class="stat-value num ${overdue ? 'down' : ''}">${overdue}</span><span class="stat-label">其中逾期</span></div>
      <div class="stat"><span class="stat-value num">${month}</span><span class="stat-label">本月成交金额</span></div>
      <div class="stat"><span class="stat-value num">${unpaid}</span><span class="stat-label">未收款</span></div>
      <div class="stat"><span class="stat-value num">${deals}</span><span class="stat-label">已成交</span></div>
    </div>

    <section class="card section-gap">
      <div class="card-head">
        <div class="card-title">线索管道</div>
        <div class="card-actions">
          <input class="input mini" id="lead-name" placeholder="对方称呼" style="width:120px" data-enter="1" data-enter-action="add-lead" data-focus-key="lead-name">
          <input class="input mini" id="lead-need" placeholder="想要什么" style="width:150px">
          <select class="input mini" id="lead-source"><option value="朋友介绍">朋友介绍</option><option value="平台私信">平台私信</option><option value="熟人">熟人</option><option value="其他">其他</option></select>
          <input class="input mini" id="lead-follow" type="date" value="${esc(addDays(today, 3))}">
          <button class="btn small primary" data-action="add-lead">＋ 新线索</button>
        </div>
      </div>
      ${state.consult.leads.length ? kanban(state, today) : empty('还没有人来找你，或者还没记', '记第一位客户', 'focus-lead')}
    </section>

    <div class="grid cols-2 section-gap">
      ${card({ title: '待跟进', sub: '逾期标红，点开写沟通记录', body: `<div class="stack">${followList(state, today)}</div>` })}
      ${card({ title: '收入台账', sub: '只记账，不做财务分析', body: incomeBlock(state) })}
    </div>`;
}

function leadDrawer(lead, ctx) {
  const state = ctx.state;
  const talks = state.consult.talks
    .filter((talk) => talk.leadId === lead.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return openDrawer(`
    <div class="drawer-head"><div class="drawer-title">${esc(lead.name)}</div><div class="spacer"></div>
      <span class="tag accent">${esc(stageLabel(lead.stage))}</span>
      ${isOverdue(lead, todayStr()) ? '<span class="tag danger">逾期</span>' : ''}</div>
    <div class="grid cols-2">
      <div class="field"><label>称呼</label>
        <input class="input" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="name" value="${esc(lead.name)}"></div>
      <div class="field"><label>来源</label>
        <input class="input" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="source" value="${esc(lead.source || '')}"></div>
    </div>
    <div class="field"><label>需求</label>
      <input class="input" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="need" value="${esc(lead.need || '')}"></div>
    <div class="grid cols-2">
      <div class="field"><label>预算</label>
        <input class="input" type="number" min="0" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="budget" value="${lead.budget ?? ''}"></div>
      <div class="field"><label>我的报价</label>
        <input class="input" type="number" min="0" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="quote" value="${lead.quote ?? ''}"></div>
    </div>
    <div class="field"><label>交付内容</label>
      <input class="input" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="deliverable" value="${esc(lead.deliverable || '')}"></div>
    <div class="grid cols-2">
      <div class="field"><label>下次跟进</label>
        <input class="input" type="date" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="nextFollowUp" value="${esc(lead.nextFollowUp || '')}"></div>
      <div class="field"><label>阶段</label>
        <select class="input" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="stage">
          ${LEAD_STAGES.map((stage) => `<option value="${stage.key}" ${lead.stage === stage.key ? 'selected' : ''}>${stage.label}</option>`).join('')}
        </select></div>
    </div>
    <div class="field"><label>备注</label>
      <input class="input" data-change-action="lead-field" data-id="${esc(lead.id)}" data-field="note" value="${esc(lead.note || '')}"></div>

    <div class="sep"></div>
    <div class="hstack">
      <input class="input grow" id="talk-content" placeholder="这次聊了什么…" data-enter="1" data-enter-action="add-talk" data-id="${esc(lead.id)}">
      <select class="input mini" id="talk-channel"><option value="微信">微信</option><option value="电话">电话</option><option value="面聊">面聊</option><option value="平台私信">私信</option></select>
      <button class="btn small primary" data-action="add-talk" data-id="${esc(lead.id)}">记一笔</button>
    </div>
    <div class="timeline">
      ${talks.length ? talks.map((talk) => `
        <div class="tl-item"><span class="tl-date">${esc(talk.date)}</span><span class="tl-text">${esc(talk.channel)} · ${esc(talk.content)}</span></div>
      `).join('') : '<div class="faint">还没有沟通记录</div>'}
    </div>

    <div class="sep"></div>
    <div class="hstack">
      <button class="btn" data-action="snooze-lead" data-id="${esc(lead.id)}">顺延 3 天</button>
      <button class="btn" data-action="deal-lead" data-id="${esc(lead.id)}">标记成交</button>
      <button class="btn danger" data-action="close-lead" data-id="${esc(lead.id)}">放弃跟进</button>
      <button class="btn danger" data-action="del-lead" data-id="${esc(lead.id)}">删除</button>
    </div>`);
}

export function handle(action, el, ctx, value) {
  const state = ctx.state;
  const id = el?.dataset?.id;

  if (action === 'new') { dom('lead-name')?.focus(); return true; }
  if (action === 'focus-lead') { dom('lead-name')?.focus(); return true; }

  if (action === 'add-lead') {
    const nameInput = dom('lead-name');
    const name = String(value || nameInput?.value || '').trim();
    if (!name) { ctx.toast('先写对方怎么称呼'); return true; }
    ctx.mutate((doc) => {
      doc.consult.leads.push({
        id: uid('L'), name, source: dom('lead-source')?.value || '朋友介绍',
        need: dom('lead-need')?.value || '', budget: null, quote: null, deliverable: '',
        stage: 'new', nextFollowUp: dom('lead-follow')?.value || addDays(todayStr(), 3),
        note: '', createdAt: isoNow(),
      });
    });
    if (nameInput) nameInput.value = '';
    const need = dom('lead-need');
    if (need) need.value = '';
    return true;
  }

  if (action === 'open-lead') {
    const lead = state.consult.leads.find((item) => item.id === id);
    if (lead) leadDrawer(lead, ctx);
    return true;
  }

  if (action === 'lead-field') {
    const field = el.dataset.field;
    ctx.mutate((doc) => {
      const lead = doc.consult.leads.find((item) => item.id === id);
      if (!lead) return;
      const numeric = ['budget', 'quote'].includes(field);
      lead[field] = numeric ? (el.value === '' ? null : Number(el.value)) : el.value;
    });
    return true;
  }

  if (action === 'add-talk') {
    const input = dom('talk-content');
    const content = String(value || input?.value || '').trim();
    if (!content) { ctx.toast('写一句聊了什么'); return true; }
    ctx.mutate((doc) => {
      doc.consult.talks.push({
        id: uid('k'), leadId: id, date: todayStr(), channel: dom('talk-channel')?.value || '微信', content,
      });
      const lead = doc.consult.leads.find((item) => item.id === id);
      if (lead) lead.nextFollowUp = addDays(todayStr(), 3);
    });
    if (input) input.value = '';
    openDrawer('');
    ctx.toast('已记下，跟进日顺延 3 天');
    return true;
  }

  if (action === 'quick-follow') {
    ctx.mutate((doc) => {
      const lead = doc.consult.leads.find((item) => item.id === id);
      if (!lead) return;
      doc.consult.talks.push({ id: uid('k'), leadId: id, date: todayStr(), channel: '微信', content: '已跟进' });
      lead.nextFollowUp = addDays(todayStr(), 3);
    });
    ctx.toast('已跟进，3 天后再提醒');
    return true;
  }

  if (action === 'snooze-lead') {
    ctx.mutate((doc) => {
      const lead = doc.consult.leads.find((item) => item.id === id);
      if (lead) lead.nextFollowUp = addDays(lead.nextFollowUp || todayStr(), 3);
    });
    ctx.toast('已顺延 3 天');
    return true;
  }

  if (action === 'deal-lead') {
    ctx.mutate((doc) => {
      const lead = doc.consult.leads.find((item) => item.id === id);
      if (lead) lead.stage = 'deal';
    });
    ctx.toast('已标记成交，别忘了记一笔收入');
    return true;
  }

  if (action === 'close-lead' || action === 'del-lead') {
    if (action === 'close-lead') {
      ctx.mutate((doc) => {
        const lead = doc.consult.leads.find((item) => item.id === id);
        if (lead) lead.stage = 'closed';
      });
      ctx.toast('已转到已结束');
    } else {
      ctx.mutate((doc) => {
        const index = doc.consult.leads.findIndex((item) => item.id === id);
        if (index >= 0) doc.consult.leads.splice(index, 1);
      }, { undo: true });
      openDrawer('');
      ctx.toast('已删除，可撤销', { actionLabel: '撤销', onAction: () => ctx.undo(), duration: 6000 });
    }
    return true;
  }

  if (action === 'add-income') {
    const item = String(dom('income-item')?.value || '').trim();
    const amount = Number(dom('income-amount')?.value || 0);
    if (!item || !amount) { ctx.toast('内容和金额都要填'); return true; }
    ctx.mutate((doc) => {
      doc.consult.incomes.push({
        id: uid('in'), date: dom('income-date')?.value || todayStr(),
        leadId: dom('income-lead')?.value || '', item, amount, paidStatus: 'unpaid',
      });
    });
    ctx.toast('记下了');
    return true;
  }

  if (action === 'income-status') {
    ctx.mutate((doc) => {
      const income = doc.consult.incomes.find((item) => item.id === id);
      if (income) income.paidStatus = el.value;
    });
    return true;
  }

  return false;
}
