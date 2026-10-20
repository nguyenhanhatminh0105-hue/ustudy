import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import { setup, signUp } from './helpers.js';
import { attachRealtime } from '../server/realtime/socket.js';
import { purgeExpired } from '../server/jobs/retention.js';

let ctx;
let server;
let url;

before(async () => {
  ctx = await setup();
  server = http.createServer(ctx.app);
  attachRealtime(server, { db: ctx.db, config: ctx.config, log: { error() {} } });
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await ctx.close();
});

const cookieOf = async (agent) => {
  const res = await agent.post('/api/auth/login').send(agent.credentials);
  return res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
};
const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

async function student() {
  const s = await signUp(ctx.app);
  s.agent.credentials = { email: s.credentials.email, password: s.credentials.password };
  s.cookie = await cookieOf(s.agent);
  return s;
}

test('rooms: create, join by code, and list only rooms you belong to', async () => {
  const host = await student();
  const guest = await student();
  const outsider = await student();
  const created = await host.agent.post('/api/rooms').send({ name: 'CMPT 381 crew' });
  assert.equal(created.status, 201);
  const code = created.body.room.id;
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);

  assert.equal((await guest.agent.get(`/api/rooms/${code}`)).status, 200);
  assert.equal((await guest.agent.get('/api/rooms')).body.rooms.length, 1);
  assert.equal((await outsider.agent.get('/api/rooms')).body.rooms.length, 0);
  assert.equal((await outsider.agent.get('/api/rooms/ZZZZZZZZ')).status, 404);
});

test('hosting is limited to three live rooms', async () => {
  const host = await student();
  for (let i = 0; i < 3; i += 1) assert.equal((await host.agent.post('/api/rooms').send({ name: `R${i}` })).status, 201);
  assert.equal((await host.agent.post('/api/rooms').send({ name: 'R4' })).status, 409);
});

test('sockets need a session; message authors come from the session, not the client', async () => {
  const anon = connect(url, { transports: ['websocket'], reconnection: false });
  const err = await once(anon, 'connect_error');
  assert.equal(err.message, 'unauthorized');
  anon.close();

  const host = await student();
  const guest = await student();
  const code = (await host.agent.post('/api/rooms').send({ name: 'Study' })).body.room.id;

  const a = connect(url, { transports: ['websocket'], extraHeaders: { Cookie: host.cookie } });
  const b = connect(url, { transports: ['websocket'], extraHeaders: { Cookie: guest.cookie } });
  try {
    assert.deepEqual(await emit(a, 'room:join', { roomId: code }), { ok: true });
    assert.deepEqual(await emit(b, 'room:join', { roomId: code }), { ok: true });

    const received = once(b, 'room:message');
    await emit(a, 'room:message', { roomId: code, body: 'hello <script>', author: 'Professor X' });
    const msg = await received;
    assert.equal(msg.author, host.user.name);
    assert.equal(msg.body, 'hello <script>'); // stored as text; the client renders it with textContent

    const notes = once(b, 'room:notes');
    await emit(a, 'room:notes', { roomId: code, content: '# Plan' });
    assert.equal((await notes).content, '# Plan');

    const outsiderRoom = await emit(b, 'room:message', { roomId: 'ABCDEFGH', body: 'sneaky' });
    assert.ok(outsiderRoom.error);
  } finally {
    a.close();
    b.close();
  }

  const history = await guest.agent.get(`/api/rooms/${code}`);
  assert.equal(history.body.messages.length, 1);
  assert.equal(history.body.messages[0].mine, false);
  assert.equal(history.body.notes.content, '# Plan');
});

test('expired rooms are purged with their messages', async () => {
  const host = await student();
  const code = (await host.agent.post('/api/rooms').send({ name: 'Old' })).body.room.id;
  await ctx.db.query(`UPDATE study_rooms SET expires_at = now() - interval '1 minute' WHERE id = $1`, [code]);
  assert.equal((await host.agent.get(`/api/rooms/${code}`)).status, 404);
  const purged = await purgeExpired(ctx.db);
  assert.ok(purged.rooms >= 1);
});
