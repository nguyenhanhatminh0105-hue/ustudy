import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { z } from 'zod';
import { SESSION_COOKIE, verifySession } from '../middleware/auth.js';
import { findLiveRoom, joinRoom, roomCode } from '../routes/rooms.js';

const messageSchema = z.object({ roomId: roomCode, body: z.string().trim().min(1).max(1000) });
const notesSchema = z.object({ roomId: roomCode, content: z.string().max(20000) });

/**
 * Realtime study rooms. Every socket is authenticated from the same httpOnly
 * session cookie as the REST API; identity always comes from the token,
 * never from what the client says its name is.
 */
export function attachRealtime(httpServer, { db, config, log }) {
  const io = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: false },
  });

  io.use(async (socket, next) => {
    try {
      await authenticate(socket);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  async function authenticate(socket) {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const session = verifySession(config, cookies[SESSION_COOKIE]);
    if (!session) throw new Error('unauthorized');
    const { rows } = await db.query('SELECT id, name FROM users WHERE id = $1', [session.id]);
    if (!rows[0]) throw new Error('unauthorized');
    socket.data.user = rows[0];
    socket.data.sent = [];
  }

  const presence = async (roomId) => {
    const sockets = await io.in(roomId).fetchSockets();
    const names = new Map();
    for (const s of sockets) names.set(s.data.user.id, s.data.user.name);
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  };

  /** At most 8 messages per 10 seconds per socket. */
  const allowMessage = (socket) => {
    const now = Date.now();
    socket.data.sent = socket.data.sent.filter((t) => now - t < 10_000);
    if (socket.data.sent.length >= 8) return false;
    socket.data.sent.push(now);
    return true;
  };

  /** A failing handler acknowledges with an error instead of crashing the process. */
  const safe = (handler) => async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      await handler(payload, reply);
    } catch (err) {
      log.error('[socket] handler failed', err);
      reply({ error: 'Something went wrong. Try again.' });
    }
  };

  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('room:join', safe(async (payload, ack) => {
      const parsed = roomCode.safeParse(payload?.roomId);
      if (!parsed.success) return ack({ error: 'Invalid room code.' });
      const room = await findLiveRoom(db, parsed.data);
      if (!room) return ack({ error: 'That room doesn’t exist or has expired.' });
      for (const joined of socket.rooms) if (joined !== socket.id) socket.leave(joined);
      await joinRoom(db, room.id, user.id);
      socket.join(room.id);
      ack({ ok: true });
      io.to(room.id).emit('room:presence', await presence(room.id));
    }));

    socket.on('room:message', safe(async (payload, ack) => {
      const parsed = messageSchema.safeParse(payload);
      if (!parsed.success) return ack({ error: 'Messages must be 1–1000 characters.' });
      const { roomId, body } = parsed.data;
      if (!socket.rooms.has(roomId)) return ack({ error: 'Join the room first.' });
      if (!allowMessage(socket)) return ack({ error: 'Slow down a little.' });
      try {
        const { rows } = await db.query(
          `INSERT INTO room_messages (room_id, user_id, author, body) VALUES ($1, $2, $3, $4)
           RETURNING id, created_at`,
          [roomId, user.id, user.name, body],
        );
        const message = { id: rows[0].id, author: user.name, authorId: user.id, body, createdAt: rows[0].created_at };
        io.to(roomId).emit('room:message', message);
        ack({ ok: true });
      } catch (err) {
        log.error('[socket] message failed', err);
        ack({ error: 'Message not sent. Try again.' });
      }
    }));

    socket.on('room:notes', safe(async (payload, ack) => {
      const parsed = notesSchema.safeParse(payload);
      if (!parsed.success) return ack({ error: 'Notes are limited to 20,000 characters.' });
      const { roomId, content } = parsed.data;
      if (!socket.rooms.has(roomId)) return ack({ error: 'Join the room first.' });
      await db.query(
        `INSERT INTO room_notes (room_id, content, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (room_id) DO UPDATE SET content = $2, updated_by = $3, updated_at = now()`,
        [roomId, content, user.id],
      );
      socket.to(roomId).emit('room:notes', { content, by: user.name });
      ack({ ok: true, savedAt: new Date().toISOString() });
    }));

    socket.on('disconnecting', () => {
      const rooms = [...socket.rooms].filter((r) => r !== socket.id);
      setImmediate(async () => {
        for (const roomId of rooms) io.to(roomId).emit('room:presence', await presence(roomId));
      });
    });
  });

  return io;
}
