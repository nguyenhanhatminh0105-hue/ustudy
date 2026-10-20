import request from 'supertest';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db/index.js';
import { migrate } from '../server/db/migrate.js';
import { createApp } from '../server/app.js';

const quiet = { info() {}, warn() {}, error() {} };

/**
 * A fresh app on an in-memory database. `clock` lets tests move time forward
 * (focus sessions are timed by the server).
 */
export async function setup() {
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-'.padEnd(48, 'x') });
  const db = await createDb(config);
  await migrate(db);
  const clock = { now: new Date() };
  const app = createApp({ db, config, log: quiet, now: () => clock.now });
  return { app, db, config, clock, close: () => db.close() };
}

let counter = 0;

/** Signs up a new user and returns a supertest agent that carries its session cookie. */
export async function signUp(app, overrides = {}) {
  counter += 1;
  const agent = request.agent(app);
  const body = {
    name: `Student ${counter}`,
    email: `student${counter}@example.test`,
    password: 'correct-horse-battery',
    ...overrides,
  };
  const res = await agent.post('/api/auth/signup').send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user, credentials: body };
}

export async function makeAdmin(db, userId) {
  await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId]);
}

export async function grantCoins(db, userId, coins) {
  await db.query('UPDATE users SET coins = $1 WHERE id = $2', [coins, userId]);
}

export const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
