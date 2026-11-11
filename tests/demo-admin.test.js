import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup } from './helpers.js';
import { DEMO, seedDemo, secureDemoAdmin } from '../server/db/seed.js';

const quiet = { info() {}, warn() {}, error() {} };
const signIn = (app, email, password) => request(app).post('/api/auth/login').send({ email, password });

test('on a public deploy the published admin password stops working', async () => {
  const { app, db, close } = await setup();
  await seedDemo(db, quiet);
  assert.equal((await signIn(app, DEMO.admin.email, DEMO.admin.password)).status, 200);

  await secureDemoAdmin(db, undefined, quiet);
  assert.equal((await signIn(app, DEMO.admin.email, DEMO.admin.password)).status, 401);
  // The sample student account is the public demo and keeps working.
  assert.equal((await signIn(app, DEMO.student.email, DEMO.student.password)).status, 200);
  await close();
});

test('the host can choose the admin password instead', async () => {
  const { app, db, close } = await setup();
  await seedDemo(db, quiet);
  await secureDemoAdmin(db, 'a-password-only-the-host-knows', quiet);
  assert.equal((await signIn(app, DEMO.admin.email, DEMO.admin.password)).status, 401);
  assert.equal((await signIn(app, DEMO.admin.email, 'a-password-only-the-host-knows')).status, 200);
  await close();
});
