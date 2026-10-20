import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { inDays, makeAdmin, setup, signUp } from './helpers.js';
import { REWARDS } from '../server/domain/progression.js';

let ctx;
before(async () => (ctx = await setup()));
after(() => ctx.close());

const sample = (over = {}) => ({ course: 'CMPT 381', title: 'A3', dueAt: inDays(3), totalHours: 4, ...over });

test('create, list, update and delete an assignment', async () => {
  const { agent } = await signUp(ctx.app);
  const created = await agent.post('/api/assignments').send(sample({ priority: 'high' }));
  assert.equal(created.status, 201);
  const id = created.body.assignment.id;
  assert.equal(created.body.assignment.status, 'not_started');

  const list = await agent.get('/api/assignments');
  assert.equal(list.body.assignments.length, 1);

  const updated = await agent.patch(`/api/assignments/${id}`).send({ title: 'A3 prototype', status: 'in_progress' });
  assert.equal(updated.body.assignment.title, 'A3 prototype');
  assert.equal(updated.body.assignment.status, 'in_progress');

  assert.equal((await agent.delete(`/api/assignments/${id}`)).status, 204);
  assert.equal((await agent.get('/api/assignments')).body.assignments.length, 0);
});

test('users can never see or change each other’s assignments', async () => {
  const alice = await signUp(ctx.app);
  const bob = await signUp(ctx.app);
  const { body } = await alice.agent.post('/api/assignments').send(sample());
  const id = body.assignment.id;

  assert.equal((await bob.agent.get('/api/assignments')).body.assignments.length, 0);
  assert.equal((await bob.agent.patch(`/api/assignments/${id}`).send({ title: 'pwned' })).status, 404);
  assert.equal((await bob.agent.post(`/api/assignments/${id}/complete`)).status, 404);
  assert.equal((await bob.agent.delete(`/api/assignments/${id}`)).status, 404);
  assert.equal((await alice.agent.get('/api/assignments')).body.assignments[0].title, 'A3');
});

test('completing an assignment rewards once, even after reopening and completing again', async () => {
  const { agent } = await signUp(ctx.app);
  const { body } = await agent.post('/api/assignments').send(sample({ totalHours: 4 }));
  const id = body.assignment.id;
  const expected = REWARDS.assignmentComplete(4);

  const first = await agent.post(`/api/assignments/${id}/complete`);
  assert.deepEqual(first.body.reward, expected);
  assert.equal(first.body.progress.xp, expected.xp);

  await agent.patch(`/api/assignments/${id}`).send({ status: 'in_progress' });
  const again = await agent.post(`/api/assignments/${id}/complete`);
  assert.equal(again.body.reward, null);
  assert.equal(again.body.progress.xp, expected.xp);
});

test('logging hours to the total completes the assignment and rewards it', async () => {
  const { agent } = await signUp(ctx.app);
  const { body } = await agent.post('/api/assignments').send(sample({ totalHours: 3 }));
  const id = body.assignment.id;
  const partial = await agent.post(`/api/assignments/${id}/log-hours`).send({ hours: 2 });
  assert.equal(partial.body.assignment.status, 'in_progress');
  assert.equal(partial.body.reward, null);
  const done = await agent.post(`/api/assignments/${id}/log-hours`).send({ hours: 5 });
  assert.equal(done.body.assignment.status, 'completed');
  assert.equal(done.body.assignment.hoursWorked, 3);
  assert.ok(done.body.reward.xp > 0);
});

test('invalid input is rejected field by field', async () => {
  const { agent } = await signUp(ctx.app);
  const res = await agent.post('/api/assignments').send({ course: '', title: 'x'.repeat(500), dueAt: 'tomorrow', priority: 'urgent' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.fields.map((f) => f.field).sort(), ['course', 'dueAt', 'priority', 'title']);
});

test('only admins publish official assignments; students add them to their list once', async () => {
  const student = await signUp(ctx.app);
  const staff = await signUp(ctx.app);
  await makeAdmin(ctx.db, staff.user.id);
  const relog = await staff.agent.post('/api/auth/login').send({ email: staff.credentials.email, password: staff.credentials.password });
  assert.equal(relog.body.user.role, 'admin');

  const official = { course: 'CMPT 381', title: 'A4', dueAt: inDays(10), estimatedHours: 5 };
  assert.equal((await student.agent.post('/api/official').send(official)).status, 403);
  const posted = await staff.agent.post('/api/official').send(official);
  assert.equal(posted.status, 201);

  const listing = await student.agent.get('/api/official');
  assert.equal(listing.body.official[0].added, false);
  const added = await student.agent.post(`/api/official/${posted.body.official.id}/add`);
  assert.equal(added.status, 201);
  assert.equal(added.body.assignment.totalHours, 5);
  assert.equal((await student.agent.post(`/api/official/${posted.body.official.id}/add`)).status, 409);
  assert.equal((await student.agent.get('/api/official')).body.official[0].added, true);
});
