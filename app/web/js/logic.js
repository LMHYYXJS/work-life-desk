// 业务逻辑（纯函数，无 DOM）。所有页面与测试共用这份规则，避免页面里各写一套。

import { addDays, parseDate, todayStr, uid } from './schema.js';

export const PRIORITIES = [
  { key: 'p0', label: 'P0 要紧' },
  { key: 'p1', label: 'P1 该做' },
  { key: 'p2', label: 'P2 有空' },
];

export const MODULE_TAGS = [
  { key: '', label: '无' },
  { key: 'media', label: '自媒体' },
  { key: 'dev', label: '开发' },
  { key: 'consult', label: '咨询' },
  { key: 'fitness', label: '健身' },
  { key: 'diet', label: '饮食' },
  { key: 'games', label: '游戏' },
];

export function groupTasks(tasks) {
  const groups = { p0: [], p1: [], p2: [] };
  (tasks || []).forEach((task) => {
    const key = groups[task.priority] ? task.priority : 'p2';
    groups[key].push(task);
  });
  Object.keys(groups).forEach((key) => {
    groups[key].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  });
  return groups;
}

export function taskStats(tasks) {
  const total = (tasks || []).length;
  const done = (tasks || []).filter((task) => task.done).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** 把昨天未完成、未放弃、未顺延过的任务复制到今天。幂等：重复调用不会重复生成。 */
export function carryOver(tasks, today) {
  const yesterday = addDays(today, -1);
  const list = tasks || [];
  const alreadyToday = list.filter((task) => task.date === today);
  const added = [];
  list.forEach((task) => {
    if (task.date !== yesterday || task.done || task.carried || task.abandoned) return;
    if (alreadyToday.some((item) => item.carriedFrom === yesterday && item.title === task.title)) return;
    added.push({
      id: uid('t'),
      title: task.title,
      date: today,
      priority: task.priority || 'p2',
      done: false,
      doneAt: null,
      moduleTag: task.moduleTag || '',
      estMinutes: task.estMinutes ?? null,
      note: task.note || '',
      carriedFrom: yesterday,
      createdAt: `${today}T00:00:00+08:00`,
    });
  });
  return { added, tasks: list.concat(added) };
}

export function sortMemos(memos) {
  return [...(memos || [])].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

// ---------- 自媒体 ----------
export const IDEA_STAGES = [
  { key: 'idea', label: '灵感' },
  { key: 'plan', label: '待策划' },
  { key: 'producing', label: '制作中' },
  { key: 'ready', label: '待发布' },
];

const STAGE_ALIASES = {
  idea: 'idea',
  plan: 'plan',
  producing: 'producing',
  ready: 'ready',
  script: 'plan',
  shoot: 'producing',
  edit: 'producing',
  publish: 'ready',
};

/** 兼容旧数据：脚本/拍摄/剪辑/发布 自动映射到新的四列。 */
export function normalizeIdeaStage(stage) {
  return STAGE_ALIASES[stage] || 'idea';
}

export const PLATFORMS = [
  { key: 'douyin', label: '抖音' },
  { key: 'bilibili', label: 'B站' },
  { key: 'xiaohongshu', label: '小红书' },
  { key: 'shipinhao', label: '视频号' },
  { key: 'other', label: '其他' },
];

export function nextStage(stage) {
  const normalized = normalizeIdeaStage(stage);
  const index = IDEA_STAGES.findIndex((item) => item.key === normalized);
  if (index < 0 || index >= IDEA_STAGES.length - 1) return null;
  return IDEA_STAGES[index + 1].key;
}

export function ideasByStage(ideas) {
  const map = { idea: [], plan: [], producing: [], ready: [] };
  (ideas || []).forEach((idea) => {
    const key = normalizeIdeaStage(idea.stage);
    map[key].push(idea);
  });
  Object.values(map).forEach((list) => {
    list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
      || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  });
  return map;
}

/**
 * 移动选题卡片：跨列或同列排序。
 * 返回新的数组；目标列按 beforeId 插入（null 表示放到最后），并重排 order 保证刷新后顺序不变。
 */
export function moveIdea(ideas, id, targetStage, beforeId = null) {
  const stage = normalizeIdeaStage(targetStage);
  const list = (ideas || []).map((item) => ({ ...item }));
  const moving = list.find((item) => item.id === id);
  if (!moving) return list;
  const fromStage = normalizeIdeaStage(moving.stage);
  moving.stage = stage;

  const destination = list
    .filter((item) => item.id !== id && normalizeIdeaStage(item.stage) === stage)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
      || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  let index = destination.length;
  if (beforeId) {
    const found = destination.findIndex((item) => item.id === beforeId);
    if (found >= 0) index = found;
  }
  destination.splice(index, 0, moving);
  destination.forEach((item, order) => { item.order = order; });

  // 跨列时，原列被抽走一项后顺序也压紧，避免出现空洞
  if (fromStage !== stage) {
    list
      .filter((item) => item.id !== id && normalizeIdeaStage(item.stage) === fromStage)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
        || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      .forEach((item, order) => { item.order = order; });
  }

  return list;
}

export function monthPosts(posts, refDate) {
  const month = String(refDate || todayStr()).slice(0, 7);
  return (posts || []).filter((post) => String(post.publishedAt || '').slice(0, 7) === month);
}

export function totalViews(posts) {
  return (posts || []).reduce((sum, post) => sum + (Number(post.views) || 0), 0);
}

export function followerSnapshot(followers) {
  const byPlatform = {};
  (followers || []).forEach((item) => {
    const key = item.platform || 'other';
    if (!byPlatform[key]) byPlatform[key] = [];
    byPlatform[key].push(item);
  });
  const result = {};
  Object.entries(byPlatform).forEach(([key, list]) => {
    const sorted = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    result[key] = {
      latest,
      prev,
      count: Number(latest?.count) || 0,
      delta: prev ? (Number(latest?.count) || 0) - (Number(prev?.count) || 0) : 0,
    };
  });
  return result;
}

export function isUpdateDue(nextUpdateAt, today) {
  if (!nextUpdateAt) return false;
  return String(nextUpdateAt) <= String(today);
}

// ---------- 开发 ----------
export const PROJECT_STAGES = [
  { key: 'plan', label: '构思' },
  { key: 'dev', label: '开发' },
  { key: 'test', label: '测试' },
  { key: 'online', label: '上线' },
  { key: 'maintain', label: '维护' },
];

export const BUG_SEVERITY = [
  { key: 'high', label: '高', cls: 'danger' },
  { key: 'mid', label: '中', cls: 'warn' },
  { key: 'low', label: '低', cls: '' },
];

export const BUG_STATUS = [
  { key: 'repro', label: '待复现' },
  { key: 'locate', label: '定位中' },
  { key: 'fixing', label: '修复中' },
  { key: 'fixed', label: '已修复' },
  { key: 'verified', label: '已验证' },
];

export function isItemDone(kind, item) {
  if (kind === 'need') return item.status === 'done';
  if (kind === 'bug') return item.status === 'verified';
  return !!item.done;
}

export function autoProgress(projectId, { needs = [], todos = [], bugs = [] } = {}) {
  const items = [
    ...needs.filter((item) => item.projectId === projectId).map((item) => ['need', item]),
    ...todos.filter((item) => item.projectId === projectId).map((item) => ['todo', item]),
    ...bugs.filter((item) => item.projectId === projectId).map((item) => ['bug', item]),
  ];
  if (!items.length) return 0;
  const done = items.filter(([kind, item]) => isItemDone(kind, item)).length;
  return Math.round((done / items.length) * 100);
}

export function projectProgress(mode, project, lists) {
  if (mode === 'auto') return autoProgress(project.id, lists);
  return Math.max(0, Math.min(100, Number(project.progress) || 0));
}

export function openBugCount(bugs) {
  return (bugs || []).filter((bug) => bug.status !== 'verified').length;
}

// ---------- 开发里程碑 ----------
export const MILESTONE_STATUS = [
  { key: 'todo', label: '未开始', cls: '' },
  { key: 'doing', label: '进行中', cls: 'warn' },
  { key: 'done', label: '已完成', cls: 'ok' },
  { key: 'blocked', label: '卡住', cls: 'danger' },
];

export function normalizeMilestoneStatus(status) {
  return MILESTONE_STATUS.some((item) => item.key === status) ? status : 'todo';
}

export function projectMilestones(project = {}) {
  return [...(project.milestones || [])].sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
}

export function isMilestoneOverdue(milestone = {}, today = todayStr()) {
  if (normalizeMilestoneStatus(milestone.status) === 'done') return false;
  return Boolean(milestone.dueDate) && String(milestone.dueDate) < String(today);
}

export function milestoneStats(milestones = [], today = todayStr()) {
  const total = milestones.length;
  const done = milestones.filter((item) => normalizeMilestoneStatus(item.status) === 'done').length;
  const overdue = milestones.filter((item) => isMilestoneOverdue(item, today)).length;
  return { total, done, overdue, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** 所有项目的节点摊平，附带项目名，供顶部逾期提醒使用。 */
export function allMilestones(projects = []) {
  return (projects || []).flatMap((project) => (project.milestones || []).map((milestone) => ({
    ...milestone,
    projectId: project.id,
    projectName: project.name,
  })));
}

export function milestoneOverview(projects = [], today = todayStr()) {
  const items = allMilestones(projects);
  const stats = milestoneStats(items, today);
  const overdue = items
    .filter((item) => isMilestoneOverdue(item, today))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  return { ...stats, overdueItems: overdue };
}

export function hasLogToday(logs, today) {
  return (logs || []).some((log) => log.date === today);
}

// ---------- 咨询 ----------
export const LEAD_STAGES = [
  { key: 'new', label: '新咨询' },
  { key: 'quoted', label: '已报价' },
  { key: 'ongoing', label: '进行中' },
  { key: 'deal', label: '已成交' },
  { key: 'closed', label: '已结束' },
];

export function leadsByStage(leads) {
  const map = { new: [], quoted: [], ongoing: [], deal: [], closed: [] };
  (leads || []).forEach((lead) => {
    const key = map[lead.stage] ? lead.stage : 'new';
    map[key].push(lead);
  });
  return map;
}

export function isOverdue(lead, today) {
  if (!lead || !lead.nextFollowUp) return false;
  if (lead.stage === 'deal' || lead.stage === 'closed') return false;
  return String(lead.nextFollowUp) < String(today);
}

export function followUps(leads, today) {
  return (leads || [])
    .filter((lead) => lead.stage !== 'deal' && lead.stage !== 'closed' && lead.nextFollowUp)
    .sort((a, b) => String(a.nextFollowUp).localeCompare(String(b.nextFollowUp))
      || String(a.name || '').localeCompare(String(b.name || '')))
    .map((lead) => ({ ...lead, overdue: isOverdue(lead, today) }));
}

export function monthIncome(incomes, refDate) {
  const month = String(refDate || todayStr()).slice(0, 7);
  return (incomes || [])
    .filter((item) => String(item.date || '').slice(0, 7) === month)
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

export function unpaidIncome(incomes) {
  return (incomes || [])
    .filter((item) => item.paidStatus !== 'paid')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

// ---------- 健身 ----------
export function mondayOf(dateStr) {
  const date = parseDate(dateStr || todayStr());
  const day = date.getDay() === 0 ? 7 : date.getDay();
  date.setDate(date.getDate() - (day - 1));
  return todayStr(date);
}

export function weekdayIndex(dateStr) {
  const day = parseDate(dateStr || todayStr()).getDay();
  return day === 0 ? 7 : day;
}

export function templateFor(template, dateStr) {
  return (template || []).find((item) => Number(item.day) === weekdayIndex(dateStr)) || null;
}

export function blankWeekTemplate() {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, part: '休息', exerciseIds: [] }));
}

export function totalSets(session) {
  return (session?.exercises || []).reduce((sum, item) => sum + (Number(item.doneSets) || 0), 0);
}

export function sessionDone(session) {
  const exercises = session?.exercises || [];
  if (!exercises.length) return false;
  return exercises.every((item) => Number(item.doneSets) >= Number(item.sets));
}

export function weekSessions(sessions, refDate) {
  const start = mondayOf(refDate);
  const end = addDays(start, 6);
  return (sessions || []).filter((session) => session.date >= start && session.date <= end);
}

export function streakDays(sessions, today) {
  const days = new Set((sessions || []).map((session) => session.date));
  if (!days.size) return 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function latestBody(body) {
  const sorted = [...(body || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = sorted[sorted.length - 1] || null;
  const prev = sorted[sorted.length - 2] || null;
  const delta = {};
  if (latest && prev) {
    ['weight', 'bodyFat', 'chest', 'waist', 'arm', 'leg'].forEach((key) => {
      if (latest[key] != null && prev[key] != null) delta[key] = Number(latest[key]) - Number(prev[key]);
    });
  }
  return { latest, prev, delta };
}

// ---------- 饮食 ----------
export const MEAL_SLOTS = [
  { key: 'breakfast', label: '早餐', time: '07:40' },
  { key: 'snack1', label: '加餐', time: '10:00' },
  { key: 'lunch', label: '午餐', time: '12:20' },
  { key: 'snack2', label: '加餐', time: '16:00' },
  { key: 'dinner', label: '晚餐', time: '18:50' },
  { key: 'night', label: '夜宵', time: '22:00' },
];

export function mealsOf(meals, date) {
  return (meals || []).filter((meal) => meal.date === date);
}

export function mealsBySlot(meals, date) {
  const map = {};
  MEAL_SLOTS.forEach((slot) => { map[slot.key] = []; });
  mealsOf(meals, date).forEach((meal) => {
    const key = map[meal.slot] ? meal.slot : 'snack1';
    map[key].push(meal);
  });
  return map;
}

export function kcalOf(meals) {
  return (meals || []).reduce((sum, meal) => sum + (Number(meal.kcal) || 0), 0);
}

export function dailyRecord(daily, date) {
  return (daily || []).find((item) => item.date === date) || null;
}

export function waterOf(daily, date) {
  return Number(dailyRecord(daily, date)?.waterCups) || 0;
}

export function outsideThisWeek(daily, refDate) {
  const start = mondayOf(refDate);
  const end = addDays(start, 6);
  const rows = (daily || []).filter((item) => item.date >= start && item.date <= end);
  return {
    count: rows.reduce((sum, item) => sum + (Number(item.outsideCount) || 0), 0),
    spend: rows.reduce((sum, item) => sum + (Number(item.outsideSpend) || 0), 0),
  };
}

// ---------- 游戏 ----------
export const GAME_STATUS = [
  { key: 'want', label: '想玩' },
  { key: 'playing', label: '在玩' },
  { key: 'done', label: '已通关' },
  { key: 'shelved', label: '搁置' },
];

export const WATCH_STATUS = [
  { key: 'todo', label: '待看' },
  { key: 'watching', label: '在看' },
  { key: 'finished', label: '看完' },
];

export function playsOf(plays, date) {
  return (plays || []).filter((play) => play.date === date);
}

export function weekMinutes(plays, refDate) {
  const start = mondayOf(refDate);
  const end = addDays(start, 6);
  return (plays || [])
    .filter((play) => play.date >= start && play.date <= end)
    .reduce((sum, play) => sum + (Number(play.minutes) || 0), 0);
}

export function todayMinutes(plays, today) {
  return playsOf(plays, today).reduce((sum, play) => sum + (Number(play.minutes) || 0), 0);
}

export function minutesForGame(plays, gameId) {
  return (plays || [])
    .filter((play) => play.gameId === gameId)
    .reduce((sum, play) => sum + (Number(play.minutes) || 0), 0);
}

// ---------- 展示工具 ----------
export function formatMinutes(minutes) {
  const value = Number(minutes) || 0;
  if (!value) return '0';
  if (value < 60) return `${Math.round(value)}min`;
  const hours = value / 60;
  return `${Number(hours.toFixed(hours >= 10 ? 0 : 1))}h`;
}

export function formatMoney(amount) {
  return `¥${Number(amount) || 0}`;
}

export function pctClass(pct) {
  if (pct >= 100) return 'ok';
  if (pct >= 60) return '';
  return 'warn';
}
