import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_SERVER, HOSTED_SERVER, normalizeServer, originPattern, isBuiltIn, pickDefaultServer, getServer } from '../extension/src/server.js';

const json = (status) => new Response('{}', { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const memory = (initial = {}) => {
  const data = { ...initial };
  return { data, get: async (key) => ({ [key]: data[key] }), set: async (obj) => Object.assign(data, obj), remove: async (key) => delete data[key] };
};

test('normalizeServer keeps only the origin of an http(s) address', () => {
  assert.equal(normalizeServer(' https://ustudy.example.com/today.html?x=1 '), 'https://ustudy.example.com');
  assert.equal(normalizeServer('http://localhost:3000/'), 'http://localhost:3000');
  assert.equal(normalizeServer('HTTP://LocalHost:3000'), 'http://localhost:3000');
});

test('normalizeServer rejects anything that is not a web address', () => {
  for (const bad of ['', 'ustudy', 'ftp://example.com', 'javascript:alert(1)', 'chrome-extension://abc/popup.html', null, undefined]) {
    assert.equal(normalizeServer(bad), null, String(bad));
  }
});

test('originPattern is the permission pattern for a server', () => {
  assert.equal(originPattern('https://ustudy.example.com'), 'https://ustudy.example.com/*');
  assert.equal(originPattern('http://localhost:3000'), 'http://localhost/*');
});

test('the local and hosted servers need no extra permission', () => {
  assert.equal(isBuiltIn(LOCAL_SERVER), true);
  assert.equal(isBuiltIn('http://127.0.0.1:3000'), true);
  assert.equal(isBuiltIn(HOSTED_SERVER), true);
  assert.equal(isBuiltIn('https://my-ustudy.example.com'), false);
});

test('a UStudy running on this computer is preferred', async () => {
  const asked = [];
  const fetchImpl = async (url) => { asked.push(url); return json(401); };
  assert.equal(await pickDefaultServer({ fetchImpl }), LOCAL_SERVER);
  assert.deepEqual(asked, [`${LOCAL_SERVER}/api/auth/session`]);
  assert.equal(await pickDefaultServer({ fetchImpl: async () => json(200) }), LOCAL_SERVER);
});

test('with nothing running locally, the hosted UStudy is used', async () => {
  const refused = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await pickDefaultServer({ fetchImpl: refused }), HOSTED_SERVER);
});

test('some other program on port 3000 is not mistaken for UStudy', async () => {
  const otherApp = async () => new Response('<html>Not found</html>', { status: 404, headers: { 'content-type': 'text/html' } });
  assert.equal(await pickDefaultServer({ fetchImpl: otherApp }), HOSTED_SERVER);
  const htmlOk = async () => new Response('<html>hello</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  assert.equal(await pickDefaultServer({ fetchImpl: htmlOk }), HOSTED_SERVER);
});

test('a local server that never answers does not hang the popup', async () => {
  const never = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  const started = Date.now();
  assert.equal(await pickDefaultServer({ fetchImpl: never, timeoutMs: 50 }), HOSTED_SERVER);
  assert.ok(Date.now() - started < 1000);
});

test('a saved choice wins and skips the check', async () => {
  let asked = 0;
  const fetchImpl = async () => { asked += 1; return json(401); };
  assert.equal(await getServer({ storage: memory({ server: 'https://my-ustudy.example.com' }), fetchImpl }), 'https://my-ustudy.example.com');
  assert.equal(asked, 0);
});

test('without a saved choice the server is picked automatically and nothing is saved', async () => {
  const storage = memory();
  assert.equal(await getServer({ storage, fetchImpl: async () => json(401) }), LOCAL_SERVER);
  assert.equal(storage.data.server, undefined);
});

test('a damaged saved value falls back to the automatic pick', async () => {
  const refused = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await getServer({ storage: memory({ server: 'not a url' }), fetchImpl: refused }), HOSTED_SERVER);
});
