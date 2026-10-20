import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, signUp } from './helpers.js';

let ctx;
before(async () => (ctx = await setup()));
after(() => ctx.close());

test('server source is never served over HTTP', async () => {
  for (const path of ['/server/config.js', '/server/db/index.js', '/js/routes/auth.js', '/js/db.js', '/.env', '/package.json']) {
    assert.equal((await request(ctx.app).get(path)).status, 404, path);
  }
});

test('security headers are set, including a strict CSP with no inline scripts', async () => {
  const res = await request(ctx.app).get('/api/health');
  const csp = res.headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('cross-site writes are blocked even with a valid session', async () => {
  const { agent } = await signUp(ctx.app);
  const res = await agent
    .post('/api/assignments')
    .set('Origin', 'https://evil.example')
    .send({ course: 'X', title: 'Y', dueAt: new Date().toISOString() });
  assert.equal(res.status, 403);
});

test('no CORS: other origins get no access-control headers', async () => {
  const res = await request(ctx.app).get('/api/health').set('Origin', 'https://evil.example');
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('malformed JSON and oversized bodies get clean 4xx errors, not stack traces', async () => {
  const { agent } = await signUp(ctx.app);
  const bad = await agent.post('/api/assignments').set('Content-Type', 'application/json').send('{"course":');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'Malformed JSON.');

  const huge = await agent.post('/api/assignments').send({ description: 'x'.repeat(100_000) });
  assert.equal(huge.status, 413);
});

test('database errors are not leaked to the client', async () => {
  const { agent } = await signUp(ctx.app);
  const original = ctx.db.query;
  ctx.db.query = async () => {
    throw new Error('relation "secret_table" does not exist');
  };
  try {
    const res = await agent.get('/api/assignments');
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(res.body).includes('secret_table'));
  } finally {
    ctx.db.query = original;
  }
});

test('the old self-service XP endpoint is gone', async () => {
  const { agent } = await signUp(ctx.app);
  const res = await agent.post('/api/progress/add').send({ xp: 99999, coins: 99999 });
  assert.equal(res.status, 404);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.user.progress.xp, 0);
});
