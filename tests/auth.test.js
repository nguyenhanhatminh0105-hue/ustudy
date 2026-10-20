import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { setup, signUp } from './helpers.js';

let ctx;
before(async () => (ctx = await setup()));
after(() => ctx.close());

test('signup sets an httpOnly, SameSite=Strict session cookie and never returns the hash', async () => {
  const res = await request(ctx.app)
    .post('/api/auth/signup')
    .send({ name: 'Ada', email: 'Ada@Example.test', password: 'long-enough-pass', companion: 'panda' });
  assert.equal(res.status, 201);
  const cookie = res.headers['set-cookie'].join(';');
  assert.match(cookie, /ustudy_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.equal(res.body.user.email, 'ada@example.test');
  assert.equal(res.body.user.progress.stage, 'baby');
  assert.equal(res.body.user.progress.companion, 'panda');
  assert.ok(!JSON.stringify(res.body).includes('password'));
});

test('emails are unique regardless of case', async () => {
  await signUp(ctx.app, { email: 'twin@example.test' });
  const res = await request(ctx.app)
    .post('/api/auth/signup')
    .send({ name: 'Twin', email: 'TWIN@example.test', password: 'long-enough-pass' });
  assert.equal(res.status, 409);
});

test('signup validates input and explains each problem', async () => {
  const res = await request(ctx.app).post('/api/auth/signup').send({ name: '', email: 'nope', password: 'short' });
  assert.equal(res.status, 400);
  const fields = res.body.fields.map((f) => f.field).sort();
  assert.deepEqual(fields, ['email', 'name', 'password']);
});

test('login works with the right password and gives the same answer for unknown email or wrong password', async () => {
  const { credentials } = await signUp(ctx.app);
  const ok = await request(ctx.app).post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
  assert.equal(ok.status, 200);

  const wrong = await request(ctx.app).post('/api/auth/login').send({ email: credentials.email, password: 'not-the-password' });
  const unknown = await request(ctx.app).post('/api/auth/login').send({ email: 'ghost@example.test', password: 'whatever-pass' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
});

test('/me needs a valid session; forged and expired tokens are rejected', async () => {
  assert.equal((await request(ctx.app).get('/api/auth/me')).status, 401);

  const forged = jwt.sign({ sub: '1', role: 'admin' }, 'ustudy-secret-key'); // the old hard-coded fallback secret
  const res = await request(ctx.app).get('/api/auth/me').set('Cookie', `ustudy_session=${forged}`);
  assert.equal(res.status, 401);

  const expired = jwt.sign({ sub: '1', role: 'student', exp: Math.floor(Date.now() / 1000) - 10 }, ctx.config.jwtSecret);
  assert.equal((await request(ctx.app).get('/api/auth/me').set('Cookie', `ustudy_session=${expired}`)).status, 401);

  const none = jwt.sign({ sub: '1', role: 'admin' }, '', { algorithm: 'none' });
  assert.equal((await request(ctx.app).get('/api/auth/me').set('Cookie', `ustudy_session=${none}`)).status, 401);
});

test('logout clears the session', async () => {
  const { agent } = await signUp(ctx.app);
  assert.equal((await agent.get('/api/auth/me')).status, 200);
  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('profile updates companion and name, and rejects unknown companions', async () => {
  const { agent } = await signUp(ctx.app);
  const ok = await agent.patch('/api/auth/me').send({ companion: 'panda', companionName: 'Bao' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.progress.companion, 'panda');
  assert.equal(ok.body.user.progress.companionName, 'Bao');
  assert.equal((await agent.patch('/api/auth/me').send({ companion: 'dragon' })).status, 400);
});

test('role cannot be set by the client', async () => {
  const { agent } = await signUp(ctx.app, { role: 'admin' });
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.user.role, 'student');
  await agent.patch('/api/auth/me').send({ name: 'Still me', role: 'admin' });
  assert.equal((await agent.get('/api/auth/me')).body.user.role, 'student');
});
