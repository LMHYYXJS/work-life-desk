// 页面级未保存草稿：图表数据点 + 开发里程碑；切页/关窗/刷新时统一拦截

export function collectDraftSources(mediaPage, devPage) {
  const sources = [];
  if (mediaPage && typeof mediaPage.isChartDraftDirty === 'function' && mediaPage.isChartDraftDirty()) {
    sources.push({ key: 'media-chart', label: '图表数据', reset: () => mediaPage.resetChartDraft?.() });
  }
  if (devPage && typeof devPage.isMilestoneDraftDirty === 'function' && devPage.isMilestoneDraftDirty()) {
    sources.push({ key: 'dev-milestones', label: '里程碑', reset: () => devPage.resetMilestoneDraft?.() });
  }
  return sources;
}

export function unsavedMessage(sources = []) {
  const labels = sources.map((source) => source.label).join(' 和 ');
  return `${labels}还没保存。离开后这些改动会丢失。`;
}

export async function confirmDiscardDrafts(sources, confirm) {
  if (!sources.length) return true;
  const ok = await confirm({
    title: '还有没保存的内容',
    text: unsavedMessage(sources),
    confirmLabel: '放弃并离开',
    danger: true,
  });
  if (ok) sources.forEach((source) => source.reset?.());
  return Boolean(ok);
}

export function shouldBlockUnload(mediaPage, devPage) {
  return collectDraftSources(mediaPage, devPage).length > 0;
}

/** 切页守卫：有未保存草稿先确认；取消就不调用 go。 */
export async function guardNavigation({ target, current, go, mediaPage, devPage, confirm }) {
  if (!target || target === current) {
    go(target);
    return true;
  }
  const sources = collectDraftSources(mediaPage, devPage);
  if (!sources.length) {
    go(target);
    return true;
  }
  const ok = await confirmDiscardDrafts(sources, confirm);
  if (ok) go(target);
  return ok;
}
