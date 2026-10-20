import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, idParam, validate, wrap } from '../middleware/http.js';
import { DAILY_FOCUS_XP_CAP, REWARDS } from '../domain/progression.js';
import { applyProgress } from '../domain/ledger.js';

const startBody = z.object({
  plannedMinutes: z.coerce.number().int().min(5).max(180),
  assignmentId: z.coerce.number().int().positive().nullable().optional(),
});

/**
 * Focus sessions are timed by the server: the client says "start" and "stop",
 * and the minutes credited are min(wall-clock elapsed, planned). A client
 * can't claim focus time it didn't spend.
 */
export function focusRoutes({ db, now = () => new Date() }) {
  const router = Router();
  router.use(requireAuth);

  router.post(
    '/',
    validate({ body: startBody }),
    wrap(async (req, res) => {
      const { plannedMinutes, assignmentId } = req.valid.body;
      if (assignmentId) {
        const owned = await db.query('SELECT 1 FROM assignments WHERE id = $1 AND user_id = $2', [
          assignmentId,
          req.user.id,
        ]);
        if (!owned.rows[0]) throw new HttpError(404, 'Assignment not found.');
      }
      // Starting a new session abandons any unfinished one (credited at 0).
      await db.query(
        'UPDATE focus_sessions SET ended_at = $2, minutes = 0 WHERE user_id = $1 AND ended_at IS NULL',
        [req.user.id, now()],
      );
      const { rows } = await db.query(
        `INSERT INTO focus_sessions (user_id, assignment_id, planned_minutes, started_at)
         VALUES ($1, $2, $3, $4) RETURNING id, planned_minutes, started_at`,
        [req.user.id, assignmentId ?? null, plannedMinutes, now()],
      );
      res.status(201).json({
        session: { id: rows[0].id, plannedMinutes: rows[0].planned_minutes, startedAt: rows[0].started_at },
      });
    }),
  );

  router.post(
    '/:id/finish',
    validate({ params: idParam }),
    wrap(async (req, res) => {
      const result = await db.tx(async (q) => {
        const { rows } = await q(
          `SELECT id, planned_minutes, started_at, ended_at FROM focus_sessions
           WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [req.valid.params.id, req.user.id],
        );
        const session = rows[0];
        if (!session) throw new HttpError(404, 'Session not found.');
        if (session.ended_at) throw new HttpError(409, 'This session has already ended.');

        const endedAt = now();
        const elapsed = Math.floor((endedAt - new Date(session.started_at)) / 60_000);
        const minutes = Math.max(0, Math.min(elapsed, session.planned_minutes));
        await q('UPDATE focus_sessions SET ended_at = $1, minutes = $2 WHERE id = $3', [
          endedAt,
          minutes,
          session.id,
        ]);

        let reward = REWARDS.focusSession(minutes);
        const today = await q(
          `SELECT COALESCE(sum(xp), 0)::int AS xp FROM progress_events
           WHERE user_id = $1 AND kind = 'focus' AND created_at >= date_trunc('day', now())`,
          [req.user.id],
        );
        const room = Math.max(0, DAILY_FOCUS_XP_CAP - today.rows[0].xp);
        if (reward.xp > room) reward = { xp: room, coins: Math.floor(room / 10) };

        const applied = await applyProgress(q, { userId: req.user.id, kind: 'focus', ref: session.id, ...reward });
        return {
          minutes,
          reward,
          capped: room < REWARDS.focusSession(minutes).xp,
          progress: applied.progress,
        };
      });
      res.json(result);
    }),
  );

  router.get(
    '/stats',
    wrap(async (req, res) => {
      const { rows } = await db.query(
        `SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day, sum(minutes)::int AS minutes
         FROM focus_sessions
         WHERE user_id = $1 AND ended_at IS NOT NULL AND started_at > now() - interval '14 days'
         GROUP BY 1 ORDER BY 1`,
        [req.user.id],
      );
      res.json({ days: rows });
    }),
  );

  return router;
}
