// 双标签页同时写：409 冲突不静默丢数据，可覆盖或取最新
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../app/web/js');
const load = (name) => import(pathToFileURL(path.join(SRC, name)).href);
const schema = await load('schema.js');
const { Store } = await load('store.js');

function fakeFetch({ conflict = false, serverDoc = null, serverRev = 9 } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      const reply = (data, status) => ({ ok: status < 400, status, json: async () => data });
      if (url === '/api/data' && (options.method || 'GET') === 'GET') {
        return reply({ doc: serverDoc || schema.defaultDoc(), rev: serverRev, meta: {} }, 200);
      }
      if (url === '/api/data' && options.method === 'POST') {
        if (conflict) return reply({ error: 'rev 冲突', currentRev: serverRev }, 409);
        return reply({ rev: 10, lastSavedAt: schema.isoNow() }, 200);
      }
      return reply({ error: 'not found' }, 404);
    },
  };
}

test('409 时进入冲突状态，不把改动当成已保存', async () => {
  const stub = fakeFetch({ conflict: true });
  globalThis.fetch = stub.fetch;
  const store = new Store();
  store.doc = schema.defaultDoc();
  store.doc.tasks = [{ id: 't1', title: '本地改动', date: schema.todayStr(), done: false }];
  store.rev = 1;
  store.dirty = true;
  await store.saveNow();
  assert.equal(store.status, 'conflict');
  assert.equal(store.conflictRev, 9);
  assert.equal(store.dirty, false);
});

test('冲突后用「我这边的覆盖」能落盘', async () => {
  const stub = fakeFetch({ conflict: true });
  globalThis.fetch = stub.fetch;
  const store = new Store();
  store.doc = schema.defaultDoc();
  store.rev = 1;
  store.conflictRev = 9;
  store.setStatus('conflict', { conflictRev: 9 });

  const okStub = fakeFetch({ conflict: false });
  globalThis.fetch = okStub.fetch;
  await store.forceSave();
  assert.equal(store.status, 'saved');
  assert.equal(store.rev, 10);
  const post = okStub.calls.find((call) => call.method === 'POST');
  assert.equal(post.body.baseRev, 9, '覆盖时带服务端最新 rev');
});

test('冲突后取最新会换成服务端数据', async () => {
  const serverDoc = schema.defaultDoc();
  serverDoc.tasks = [{ id: 's1', title: '服务端的数据', date: schema.todayStr(), done: true }];
  const stub = fakeFetch({ conflict: true, serverDoc, serverRev: 12 });
  globalThis.fetch = stub.fetch;
  const store = new Store();
  store.doc = schema.defaultDoc();
  store.doc.tasks = [{ id: 't1', title: '本地未保存', date: schema.todayStr(), done: false }];
  store.rev = 1;

  await store.reloadFromServer();
  assert.equal(store.status, 'saved');
  assert.equal(store.rev, 12);
  assert.equal(store.doc.tasks[0].title, '服务端的数据');
});
