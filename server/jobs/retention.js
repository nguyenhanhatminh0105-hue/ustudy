import { ROOM_TTL_DAYS } from '../routes/rooms.js';

/** Deletes expired study rooms (messages and notes cascade) and messages past the retention window. */
export async function purgeExpired(db) {
  const rooms = await db.query('DELETE FROM study_rooms WHERE expires_at <= now() RETURNING id');
  const messages = await db.query(
    `DELETE FROM room_messages WHERE created_at <= now() - make_interval(days => $1) RETURNING id`,
    [ROOM_TTL_DAYS],
  );
  return { rooms: rooms.rows.length, messages: messages.rows.length };
}

export function scheduleRetention(db, log, everyMs = 6 * 60 * 60 * 1000) {
  const run = () =>
    purgeExpired(db)
      .then((r) => (r.rooms || r.messages) && log.info(`[retention] removed ${r.rooms} rooms, ${r.messages} messages`))
      .catch((err) => log.error('[retention] failed', err));
  run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
