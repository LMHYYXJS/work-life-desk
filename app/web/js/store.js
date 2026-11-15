// 唯一状态源：负责加载、变更、撤销、防抖保存、冲突处理

import { api } from './api.js';
import { clone, isoNow, normalizeDoc } from './schema.js';

const SAVE_DELAY = 600;

export class Store {
  constructor() {
    this.doc = null;
    this.rev = 1;
    this.meta = {};
    this.warning = null;
    this.status = 'loading'; // loading | saved | saving | error | conflict
    this.lastSavedAt = null;
    this.dirty = false;
    this.conflictRev = null;
    this.listeners = new Set();
    this.undoStack = [];
    this.timer = null;
    this.retryTimer = null;
    this.onStatus = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  setStatus(status, extra = {}) {
    this.status = status;
    Object.assign(this, extra);
    if (this.onStatus) this.onStatus(this);
  }

  async load() {
    const result = await api.load();
    if (!result.ok) {
      this.setStatus('error', { errorMessage: result.data?.error || '加载失败' });
      return false;
    }
    this.doc = normalizeDoc(result.data.doc);
    this.rev = result.data.rev ?? this.doc.rev ?? 1;
    this.meta = result.data.meta || {};
    this.warning = result.data.warning || null;
    this.lastSavedAt = this.doc.meta?.lastSavedAt || null;
    this.setStatus('saved');
    return true;
  }

  /** 变更数据；undo=true 时先压一份快照用于撤销。 */
  mutate(mutator, { undo = false } = {}) {
    if (!this.doc) return;
    if (undo) this.pushUndo();
    mutator(this.doc);
    this.doc.meta.lastSavedAt = isoNow();
    this.dirty = true;
    this.setStatus('saving');
    this.emit();
    this.scheduleSave();
  }

  pushUndo() {
    this.undoStack.push(clone(this.doc));
    if (this.undoStack.length > 10) this.undoStack.shift();
    this.emit();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    const rev = this.doc.rev;
    this.doc = normalizeDoc(snapshot);
    this.doc.rev = rev;
    this.dirty = true;
    this.setStatus('saving');
    this.emit();
    this.scheduleSave();
    return true;
  }

  scheduleSave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), SAVE_DELAY);
  }

  async saveNow() {
    clearTimeout(this.timer);
    if (!this.doc || !this.dirty) return;
    this.setStatus('saving');
    const payload = clone(this.doc);
    const baseRev = this.rev;
    const result = await api.save(payload, baseRev);
    if (result.ok) {
      this.rev = result.data.rev;
      this.doc.rev = result.data.rev;
      this.lastSavedAt = result.data.lastSavedAt || isoNow();
      this.doc.meta.lastSavedAt = this.lastSavedAt;
      this.dirty = false;
      this.setStatus('saved');
      this.emit();
      return;
    }
    if (result.status === 409) {
      this.dirty = false;
      this.setStatus('conflict', { conflictRev: result.data.currentRev });
      return;
    }
    this.setStatus('error', { errorMessage: result.data?.error || '保存失败' });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.dirty = true;
      this.saveNow();
    }, 5000);
  }

  /** 冲突时：用本地数据强行覆盖 */
  async forceSave() {
    const result = await api.save(clone(this.doc), this.conflictRev);
    if (result.ok) {
      this.rev = result.data.rev;
      this.dirty = false;
      this.setStatus('saved');
      this.emit();
    } else {
      this.setStatus('error', { errorMessage: result.data?.error || '覆盖失败' });
    }
  }

  /** 冲突时：放弃本地改动，拉取服务端最新 */
  async reloadFromServer() {
    const result = await api.load();
    if (result.ok) {
      this.doc = normalizeDoc(result.data.doc);
      this.rev = result.data.rev;
      this.dirty = false;
      this.undoStack = [];
      this.setStatus('saved');
      this.emit();
    }
  }

  replaceDoc(doc) {
    const rev = this.doc?.rev;
    this.doc = normalizeDoc(doc);
    if (rev) this.doc.rev = rev;
    this.dirty = true;
    this.setStatus('saving');
    this.emit();
    this.scheduleSave();
  }
}
