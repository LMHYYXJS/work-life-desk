// 页面切换：记录当前页与各页滚动位置、未提交的输入草稿，通知订阅者

export const router = {
  current: 'home',
  scrollMemory: {},
  drafts: {},
  pendingDraftRestore: false,
  listeners: new Set(),
  onPage(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  captureDrafts(page) {
    const view = typeof document !== 'undefined' ? document.getElementById('view') : null;
    if (!view || !view.querySelectorAll) return;
    const map = {};
    view.querySelectorAll('input[id], textarea[id], select[id]').forEach((el) => {
      if (el.type === 'file') return;
      map[el.id] = el.value;
    });
    this.drafts[page] = map;
  },
  applyDrafts(page) {
    const view = typeof document !== 'undefined' ? document.getElementById('view') : null;
    if (!view || !view.querySelectorAll) return;
    const map = this.drafts[page] || {};
    view.querySelectorAll('input[id], textarea[id], select[id]').forEach((el) => {
      if (el.type === 'file') return;
      if (map[el.id] !== undefined && map[el.id] !== '') el.value = map[el.id];
    });
  },
  go(id, { keepScroll = false } = {}) {
    if (!id || id === this.current) {
      this.emit();
      return;
    }
    const view = document.getElementById('view');
    if (view) {
      this.scrollMemory[this.current] = view.scrollTop;
      this.captureDrafts(this.current);
    }
    this.current = id;
    this.pendingDraftRestore = true;
    this.emit({ keepScroll });
  },
  emit(extra = {}) {
    this.listeners.forEach((fn) => fn(this.current, extra));
  },
  restoreScroll() {
    const view = document.getElementById('view');
    if (!view) return;
    view.scrollTop = this.scrollMemory[this.current] || 0;
  },
};
