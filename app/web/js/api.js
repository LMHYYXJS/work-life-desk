// 本地接口封装：所有请求都发往同源 127.0.0.1，不访问任何外部域名

async function request(path, { method = 'GET', body = null } = {}) {
  const options = { method, headers: {} };
  if (body != null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    return { ok: false, status: 0, data: { error: '服务连不上，可能启动脚本没在跑' }, network: true };
  }
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = { error: '返回内容不是 JSON' };
  }
  return { ok: response.ok, status: response.status, data };
}

export const api = {
  load: () => request('/api/data'),
  save: (doc, baseRev) => request('/api/data', { method: 'POST', body: { doc, baseRev } }),
  backups: () => request('/api/backups'),
  backup: () => request('/api/backup', { method: 'POST', body: {} }),
  restoreByName: (name) => request('/api/restore', { method: 'POST', body: { name } }),
  restoreByDoc: (doc) => request('/api/restore', { method: 'POST', body: { doc } }),
  health: () => request('/api/health'),
};
