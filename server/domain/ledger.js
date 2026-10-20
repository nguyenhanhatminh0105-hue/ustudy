import { progressSnapshot } from './progression.js';

/**
 * Grants (or spends) XP and coins inside an existing transaction.
 * The (user, kind, ref) unique key makes each reward idempotent: completing
 * the same assignment twice, or replaying a request, grants nothing the
 * second time. Returns { granted, progress }.
 */
export async function applyProgress(q, { userId, kind, ref, xp = 0, coins = 0 }) {
  const inserted = await q(
    `INSERT INTO progress_events (user_id, kind, ref, xp, coins)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, kind, ref) DO NOTHING
     RETURNING id`,
    [userId, kind, String(ref), xp, coins],
  );
  if (inserted.rows.length === 0) {
    const current = await q('SELECT xp, coins, companion, companion_name FROM users WHERE id = $1', [userId]);
    return { granted: false, progress: progressSnapshot(current.rows[0]) };
  }

  // coins + $2 >= 0 keeps spending atomic: two simultaneous purchases can't both
  // pass a balance check and drive the balance negative.
  const updated = await q(
    `UPDATE users SET xp = xp + $1, coins = coins + $2
     WHERE id = $3 AND coins + $2 >= 0
     RETURNING xp, coins, companion, companion_name`,
    [xp, coins, userId],
  );
  if (updated.rows.length === 0) {
    const err = new Error('Not enough coins');
    err.status = 409;
    err.expose = true;
    throw err;
  }
  return { granted: true, progress: progressSnapshot(updated.rows[0]) };
}
