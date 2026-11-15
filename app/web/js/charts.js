// 发布数据可视化：纯函数计算 + 本地 SVG 折线图（不依赖任何 CDN）

import { addDays, parseDate, todayStr } from './schema.js';
import { esc } from './ui.js';

export const CHART_COLORS = ['#4DD8FF', '#FFB648', '#4ADE80', '#FF6B6B', '#A78BFA'];

export const RANGE_OPTIONS = [
  { key: '7', label: '近 7 天' },
  { key: '30', label: '近 30 天' },
  { key: '90', label: '近 90 天' },
  { key: 'all', label: '全部' },
];

export function rangeStart(range, today = todayStr()) {
  if (range === '7') return addDays(today, -6);
  if (range === '30') return addDays(today, -29);
  if (range === '90') return addDays(today, -89);
  return null;
}

/** 一条发布记录的最新累计数字：优先取最后一次快照，其次取表里的当前值。 */
export function latestMetrics(post = {}) {
  const snapshots = [...(post.snapshots || [])]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = snapshots[snapshots.length - 1] || null;
  return {
    date: latest?.date || post.publishedAt || '',
    views: Number(latest ? latest.views : post.views) || 0,
    likes: Number(latest ? latest.likes : post.likes) || 0,
    comments: Number(latest ? latest.comments : post.comments) || 0,
    saves: Number(latest ? latest.saves : post.saves) || 0,
  };
}

function inRange(date, from, to) {
  if (!date) return false;
  if (from && String(date) < from) return false;
  if (to && String(date) > to) return false;
  return true;
}

/** 汇总取「范围内最后一次快照」；范围内没有快照时，只有发布日在范围内才用当前值。 */
export function metricsInRange(post = {}, { from = null, to = null } = {}) {
  const snapshots = [...(post.snapshots || [])]
    .filter((snapshot) => inRange(snapshot.date, from, to))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = snapshots[snapshots.length - 1];
  if (latest) {
    return {
      date: latest.date,
      views: Number(latest.views) || 0,
      likes: Number(latest.likes) || 0,
      comments: Number(latest.comments) || 0,
      saves: Number(latest.saves) || 0,
    };
  }
  if ((from || to) && !inRange(post.publishedAt, from, to)) {
    return { date: '', views: 0, likes: 0, comments: 0, saves: 0 };
  }
  return latestMetrics(post);
}

/** 把一条记录变成时间序列；没有快照时用发布日 + 当前值补一个点。 */
export function postSeries(post = {}, { from = null, to = null } = {}) {
  const snapshots = [...(post.snapshots || [])]
    .filter((snapshot) => snapshot && snapshot.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let points = snapshots.map((snapshot) => ({
    date: snapshot.date,
    value: Number(snapshot.views) || 0,
  }));
  if (!points.length && post.publishedAt) {
    points = [{ date: post.publishedAt, value: Number(post.views) || 0 }];
  }
  points = points.filter((point) => (!from || point.date >= from) && (!to || point.date <= to));
  // 同一天多条快照只保留最后一条
  const byDate = new Map();
  points.forEach((point) => byDate.set(point.date, point));
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function filterPosts(posts = [], { platform = 'all', from = null, to = null } = {}) {
  return (posts || []).filter((post) => {
    if (platform !== 'all' && post.platform !== platform) return false;
    if (!from && !to) return true;
    const snapshotInRange = (post.snapshots || []).some((snapshot) => inRange(snapshot.date, from, to));
    return snapshotInRange || inRange(post.publishedAt, from, to);
  });
}

export function chartSummary(posts = [], { platform = 'all', from = null, to = null } = {}) {
  const filtered = filterPosts(posts, { platform, from, to });
  const totals = filtered.reduce((sum, post) => {
    const metrics = metricsInRange(post, { from, to });
    return {
      views: sum.views + metrics.views,
      likes: sum.likes + metrics.likes,
      comments: sum.comments + metrics.comments,
      saves: sum.saves + metrics.saves,
    };
  }, { views: 0, likes: 0, comments: 0, saves: 0 });
  return { ...totals, posts: filtered.length };
}

/** 给多条对比生成 series；selectedIds 为空时自动取数据点最多的前 4 条。 */
export function comparisonSeries(posts = [], {
  platform = 'all', from = null, to = null, selectedIds = [], limit = 4,
} = {}) {
  const filtered = filterPosts(posts, { platform, from, to });
  const selected = selectedIds.length
    ? filtered.filter((post) => selectedIds.includes(post.id))
    : [...filtered]
      .sort((a, b) => (b.snapshots || []).length - (a.snapshots || []).length)
      .slice(0, limit);
  return selected.slice(0, limit).map((post, index) => ({
    id: post.id,
    label: post.title || '未命名',
    color: CHART_COLORS[index % CHART_COLORS.length],
    points: postSeries(post, { from, to }),
  }));
}

function niceMax(value) {
  const max = Math.max(1, Number(value) || 0);
  const power = 10 ** Math.floor(Math.log10(max));
  const scaled = max / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function dayValue(date) {
  const parsed = parseDate(date);
  return Math.floor(parsed.getTime() / 86400000);
}

/** 生成折线图 SVG；series 的每项为 {label,color,points:[{date,value}]}。 */
export function lineChart(series = [], {
  from = null, to = null, width = 720, height = 220, valueLabel = '播放',
} = {}) {
  const clean = (series || []).filter((item) => item && item.points && item.points.length);
  if (!clean.length) {
    return '<div class="empty chart-empty"><span>这个范围内还没有数据点，先在下面补一条</span></div>';
  }
  const allPoints = clean.flatMap((item) => item.points);
  const dates = allPoints.map((point) => point.date).sort();
  const start = from || dates[0];
  const end = to || dates[dates.length - 1];
  const startDay = dayValue(start);
  const endDay = Math.max(startDay + 1, dayValue(end));
  const maxValueRaw = Math.max(...allPoints.map((point) => Number(point.value) || 0));
  const maxValue = niceMax(maxValueRaw);

  const pad = { left: 46, right: 14, top: 14, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (date) => pad.left + ((dayValue(date) - startDay) / (endDay - startDay)) * plotW;
  const y = (value) => pad.top + plotH - ((Number(value) || 0) / maxValue) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gy = pad.top + plotH - ratio * plotH;
    return `<line x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}" class="chart-grid"/>`
      + `<text x="${pad.left - 8}" y="${gy + 4}" text-anchor="end" class="chart-axis">${Math.round(maxValue * ratio)}</text>`;
  }).join('');

  const xLabels = [0, 0.5, 1].map((ratio) => {
    const date = addDays(start, Math.round((endDay - startDay) * ratio));
    return `<text x="${pad.left + plotW * ratio}" y="${height - 8}" text-anchor="${ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}" class="chart-axis">${esc(date.slice(5))}</text>`;
  }).join('');

  const paths = clean.map((item) => {
    const points = item.points.map((point) => `${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    const circles = item.points.map((point) => `<circle cx="${x(point.date).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="3" fill="${item.color}"><title>${esc(point.date)} · ${Number(point.value) || 0}</title></circle>`).join('');
    return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2" vector-effect="non-scaling-stroke"/>${circles}`;
  }).join('');

  const legend = clean.length > 1
    ? `<div class="chart-legend">${clean.map((item) => `<span class="chart-legend-item"><i style="background:${item.color}"></i>${esc(item.label)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(valueLabel)}趋势图">
        ${gridLines}
        ${xLabels}
        ${paths}
      </svg>
      ${legend}
    </div>`;
}
