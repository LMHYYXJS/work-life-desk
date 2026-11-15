// 页面注册表：顺序即侧栏顺序（数字键 1–9 对应）

import * as home from './home.js';
import * as tasks from './tasks.js';
import * as media from './media.js';
import * as dev from './dev.js';
import * as consult from './consult.js';
import * as fitness from './fitness.js';
import * as diet from './diet.js';
import * as games from './games.js';
import * as settings from './settings.js';

export const pages = [home, tasks, media, dev, consult, fitness, diet, games, settings];

export function pageById(id) {
  return pages.find((page) => page.meta.id === id) || home;
}
