// 数据结构、默认值、校验与日期/id 工具（纯函数，无 DOM，便于测试）

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.0.0';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  fontSize: 'normal',
  autoBackup: true,
  backupKeepDays: 30,
  carryOverYesterday: true,
  homeSummary: ['media', 'dev', 'fitness', 'games'],
  projectProgressMode: 'auto',
  calorieGoal: 2200,
  waterGoal: 8,
  entertainmentWeeklyLimit: 10,
  lastBackupDate: null,
};

export function uid(prefix = 'x') {
  const stamp = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${prefix}_${stamp}${rand}`;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function todayStr(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isoNow(date = new Date()) {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${todayStr(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}

export function parseDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return todayStr(date);
}

export function weekdayCn(dateStr) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[parseDate(dateStr).getDay()];
}

export function formatCn(dateStr) {
  const date = parseDate(dateStr);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayCn(dateStr)}`;
}

export function isDateStr(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function relativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '—';
  const diff = Date.now() - then.getTime();
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `今天 ${pad2(then.getHours())}:${pad2(then.getMinutes())}`;
  return `${then.getMonth() + 1}月${then.getDate()}日 ${pad2(then.getHours())}:${pad2(then.getMinutes())}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getByPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function setByPath(obj, path, value) {
  const keys = String(path).split('.');
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

export function defaultDoc() {
  const now = isoNow();
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: 1,
    meta: { createdAt: now, lastSavedAt: now, appVersion: APP_VERSION },
    settings: clone(DEFAULT_SETTINGS),
    tasks: [],
    memos: [],
    media: { ideas: [], posts: [], followers: [], nextUpdateAt: null },
    dev: { projects: [], needs: [], todos: [], bugs: [], logs: [], versions: [] },
    consult: { leads: [], talks: [], incomes: [] },
    fitness: { weekTemplate: [], sessions: [], body: [], exerciseLib: [] },
    diet: { meals: [], foodLib: [], daily: [] },
    games: { library: [], plays: [], watchlist: [] },
    reviews: [],
  };
}

const NAMESPACES = {
  media: ['ideas', 'posts', 'followers'],
  dev: ['projects', 'needs', 'todos', 'bugs', 'logs', 'versions'],
  consult: ['leads', 'talks', 'incomes'],
  fitness: ['weekTemplate', 'sessions', 'body', 'exerciseLib'],
  diet: ['meals', 'foodLib', 'daily'],
  games: ['library', 'plays', 'watchlist'],
};

export function normalizeDoc(doc) {
  const base = defaultDoc();
  const out = doc && typeof doc === 'object' ? clone(doc) : base;
  Object.keys(base).forEach((key) => {
    if (!(key in out)) out[key] = clone(base[key]);
  });
  if (!out.meta || typeof out.meta !== 'object') out.meta = clone(base.meta);
  out.settings = { ...clone(DEFAULT_SETTINGS), ...(out.settings || {}) };
  if (!Number.isInteger(out.rev)) out.rev = 1;
  Object.entries(NAMESPACES).forEach(([ns, subs]) => {
    if (!out[ns] || typeof out[ns] !== 'object') out[ns] = {};
    subs.forEach((sub) => {
      if (!Array.isArray(out[ns][sub])) out[ns][sub] = [];
    });
  });
  ['tasks', 'memos', 'reviews'].forEach((key) => {
    if (!Array.isArray(out[key])) out[key] = [];
  });
  if (typeof out.media.nextUpdateAt !== 'string') out.media.nextUpdateAt = null;
  out.media.posts.forEach((post) => {
    if (!Array.isArray(post.snapshots)) post.snapshots = [];
  });
  return out;
}

export function validateDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: '文件不是一个数据对象' };
  if (!Number.isInteger(doc.schemaVersion)) return { ok: false, reason: '缺少 schemaVersion，可能不是本应用的数据文件' };
  for (const key of ['tasks', 'memos', 'reviews']) {
    if (!Array.isArray(doc[key])) return { ok: false, reason: `${key} 不是列表` };
  }
  if (!doc.settings || typeof doc.settings !== 'object') return { ok: false, reason: 'settings 不是对象' };
  for (const ns of Object.keys(NAMESPACES)) {
    if (!doc[ns] || typeof doc[ns] !== 'object') return { ok: false, reason: `缺少 ${ns} 分区` };
  }
  return { ok: true, reason: '' };
}

export function counts(doc) {
  if (!doc) return {};
  const media = doc.media || {};
  const dev = doc.dev || {};
  const consult = doc.consult || {};
  const fitness = doc.fitness || {};
  const diet = doc.diet || {};
  const games = doc.games || {};
  return {
    tasks: (doc.tasks || []).length,
    memos: (doc.memos || []).length,
    ideas: (media.ideas || []).length,
    posts: (media.posts || []).length,
    followers: (media.followers || []).length,
    projects: (dev.projects || []).length,
    needs: (dev.needs || []).length,
    todos: (dev.todos || []).length,
    bugs: (dev.bugs || []).length,
    logs: (dev.logs || []).length,
    versions: (dev.versions || []).length,
    leads: (consult.leads || []).length,
    talks: (consult.talks || []).length,
    incomes: (consult.incomes || []).length,
    sessions: (fitness.sessions || []).length,
    body: (fitness.body || []).length,
    meals: (diet.meals || []).length,
    daily: (diet.daily || []).length,
    games: (games.library || []).length,
    plays: (games.plays || []).length,
    watchlist: (games.watchlist || []).length,
    reviews: (doc.reviews || []).length,
  };
}
