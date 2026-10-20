import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { grantCoins, setup, signUp } from './helpers.js';
import { DAILY_FOCUS_XP_CAP } from '../server/domain/progression.js';

let ctx;
before(async () => (ctx = await setup()));
after(() => ctx.close());

const today = () => new Date().toISOString().slice(0, 10);

test('gifts charge the server’s price, whatever the client claims', async () => {
  const { agent, user } = await signUp(ctx.app);
  await grantCoins(ctx.db, user.id, 60);
  const res = await agent.post('/api/companion/gifts').send({ treat: 'cookie', amount: 1, cost: 1 });
  assert.equal(res.status, 201);
  assert.equal(res.body.progress.coins, 10);
  assert.equal(res.body.treat.cost, 50);
});

test('you cannot spend coins you don’t have, and nothing is recorded when you try', async () => {
  const { agent, user } = await signUp(ctx.app);
  await grantCoins(ctx.db, user.id, 30);
  const res = await agent.post('/api/companion/gifts').send({ treat: 'cake' });
  assert.equal(res.status, 409);
  const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM gifts WHERE user_id = $1', [user.id]);
  assert.equal(rows[0].n, 0);
  assert.equal((await agent.get('/api/companion')).body.progress.coins, 30);
});

test('simultaneous purchases can’t overspend the balance', async () => {
  const { agent, user } = await signUp(ctx.app);
  await grantCoins(ctx.db, user.id, 100);
  const results = await Promise.all(Array.from({ length: 5 }, () => agent.post('/api/companion/gifts').send({ treat: 'cookie' })));
  assert.equal(results.filter((r) => r.status === 201).length, 2);
  assert.equal((await agent.get('/api/companion')).body.progress.coins, 0);
});

test('unknown treats are refused', async () => {
  const { agent } = await signUp(ctx.app);
  assert.equal((await agent.post('/api/companion/gifts').send({ treat: '__proto__' })).status, 400);
  assert.equal((await agent.post('/api/companion/gifts').send({ treat: 'diamond' })).status, 400);
});

test('focus time is measured by the server, not the client', async () => {
  const { agent } = await signUp(ctx.app);
  const start = await agent.post('/api/focus').send({ plannedMinutes: 25 });
  assert.equal(start.status, 201);
  ctx.clock.now = new Date(ctx.clock.now.getTime() + 12 * 60_000); // 12 minutes pass
  const done = await agent.post(`/api/focus/${start.body.session.id}/finish`).send({ minutes: 180 });
  assert.equal(done.body.minutes, 12);
  assert.equal(done.body.reward.xp, 12);
  assert.equal((await agent.post(`/api/focus/${start.body.session.id}/finish`)).status, 409);
});

test('focus credit never exceeds the planned length, and daily focus XP is capped', async () => {
  const { agent } = await signUp(ctx.app);
  let earned = 0;
  for (let i = 0; i < 4; i += 1) {
    const s = await agent.post('/api/focus').send({ plannedMinutes: 90 });
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 300 * 60_000); // far longer than planned
    const done = await agent.post(`/api/focus/${s.body.session.id}/finish`);
    assert.equal(done.body.minutes, 90);
    earned += done.body.reward.xp;
  }
  assert.equal(earned, DAILY_FOCUS_XP_CAP);
});

test('a habit check-in rewards once per day, and future days are refused', async () => {
  const { agent } = await signUp(ctx.app);
  const habit = (await agent.post('/api/habits').send({ name: 'Read', targetPerWeek: 5 })).body.habit;
  const first = await agent.put(`/api/habits/${habit.id}/checkins/${today()}`);
  assert.ok(first.body.reward.xp > 0);
  await agent.delete(`/api/habits/${habit.id}/checkins/${today()}`);
  const again = await agent.put(`/api/habits/${habit.id}/checkins/${today()}`);
  assert.equal(again.body.reward, null);

  const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await agent.put(`/api/habits/${habit.id}/checkins/${future}`)).status, 400);

  const list = await agent.get('/api/habits');
  assert.deepEqual(list.body.habits[0].checkins, [today()]);
});

test('earning enough XP grows the companion to the next life stage', async () => {
  const { agent } = await signUp(ctx.app);
  let stage = 'baby';
  for (let i = 0; i < 3 && stage === 'baby'; i += 1) {
    const a = (await agent.post('/api/assignments').send({ course: 'C', title: `T${i}`, dueAt: new Date().toISOString(), totalHours: 20 })).body.assignment;
    stage = (await agent.post(`/api/assignments/${a.id}/complete`)).body.progress.stage;
  }
  assert.equal(stage, 'child');
});
