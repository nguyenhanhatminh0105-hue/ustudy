import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, validate, wrap } from '../middleware/http.js';

export const ROOM_TTL_DAYS = 14;
const MAX_OWNED_ROOMS = 3;
// No 0/O/1/I/L, so codes survive being read aloud or copied by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/, 'Room codes are 8 letters and numbers.');

function newRoomCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function toRoom(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    owned: row.owned ?? undefined,
  };
}

/** Loads a live (unexpired) room or throws 404. Shared with the socket layer. */
export async function findLiveRoom(db, id) {
  const { rows } = await db.query('SELECT * FROM study_rooms WHERE id = $1 AND expires_at > now()', [id]);
  return rows[0] ?? null;
}

export async function joinRoom(db, roomId, userId) {
  await db.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    roomId,
    userId,
  ]);
}

export function roomRoutes({ db, limiters }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    wrap(async (req, res) => {
      const { rows } = await db.query(
        `SELECT r.*, (r.created_by = $1) AS owned FROM study_rooms r
         JOIN room_members m ON m.room_id = r.id AND m.user_id = $1
         WHERE r.expires_at > now() ORDER BY m.joined_at DESC`,
        [req.user.id],
      );
      res.json({ rooms: rows.map(toRoom) });
    }),
  );

  router.post(
    '/',
    limiters.writes,
    validate({ body: z.object({ name: z.string().trim().min(1, 'Name the room.').max(60) }) }),
    wrap(async (req, res) => {
      const room = await db.tx(async (q) => {
        const owned = await q(
          'SELECT count(*)::int AS n FROM study_rooms WHERE created_by = $1 AND expires_at > now()',
          [req.user.id],
        );
        if (owned.rows[0].n >= MAX_OWNED_ROOMS) {
          throw new HttpError(409, `You can host up to ${MAX_OWNED_ROOMS} rooms at a time.`);
        }
        const { rows } = await q(
          `INSERT INTO study_rooms (id, name, created_by, expires_at)
           VALUES ($1, $2, $3, now() + make_interval(days => $4)) RETURNING *`,
          [newRoomCode(), req.valid.body.name, req.user.id, ROOM_TTL_DAYS],
        );
        await q('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [rows[0].id, req.user.id]);
        await q('INSERT INTO room_notes (room_id, updated_by) VALUES ($1, $2)', [rows[0].id, req.user.id]);
        return rows[0];
      });
      res.status(201).json({ room: toRoom({ ...room, owned: true }) });
    }),
  );

  router.get(
    '/:id',
    validate({ params: z.object({ id: roomCode }) }),
    wrap(async (req, res) => {
      const room = await findLiveRoom(db, req.valid.params.id);
      if (!room) throw new HttpError(404, 'That room doesn’t exist or has expired.');
      await joinRoom(db, room.id, req.user.id);
      const [messages, notes] = await Promise.all([
        db.query(
          `SELECT id, author, body, user_id, created_at FROM room_messages
           WHERE room_id = $1 AND created_at > now() - make_interval(days => $2)
           ORDER BY created_at DESC LIMIT 200`,
          [room.id, ROOM_TTL_DAYS],
        ),
        db.query('SELECT content, updated_at FROM room_notes WHERE room_id = $1', [room.id]),
      ]);
      res.json({
        room: toRoom({ ...room, owned: room.created_by === req.user.id }),
        messages: messages.rows.reverse().map((m) => ({
          id: m.id,
          author: m.author,
          body: m.body,
          mine: m.user_id === req.user.id,
          createdAt: m.created_at,
        })),
        notes: notes.rows[0] ?? { content: '', updated_at: null },
      });
    }),
  );

  router.delete(
    '/:id/membership',
    validate({ params: z.object({ id: roomCode }) }),
    wrap(async (req, res) => {
      await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [
        req.valid.params.id,
        req.user.id,
      ]);
      res.status(204).end();
    }),
  );

  return router;
}
