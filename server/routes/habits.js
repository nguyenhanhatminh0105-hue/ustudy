import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, idParam, validate, wrap } from '../middleware/http.js';
import { REWARDS } from '../domain/progression.js';
import { applyProgress } from '../domain/ledger.js';

const day = z.iso.date({ message: 'Use a YYYY-MM-DD date.' });

const createBody = z.object({
  name: z.string().trim().min(1, 'Name the habit.').max(60),
  targetPerWeek: z.coerce.number().int().min(1).max(7).default(7),
});
const updateBody = createBody.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
const checkinParams = idParam.extend({ day });
const listQuery = z.object({ from: day.optional(), to: day.optional() });

/** A check-in may be logged for today or the two days before, never the future. */
function assertCheckinDay(value) {
  const target = Date.parse(`${value}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const diffDays = (today - target) / 86_400_000;
  if (diffDays < -1 || diffDays > 2) throw new HttpError(400, 'You can only check in for today or the last two days.');
}

export function habitRoutes({ db }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    validate({ query: listQuery }),
    wrap(async (req, res) => {
      const to = req.valid.query.to ?? new Date().toISOString().slice(0, 10);
      const from =
        req.valid.query.from ?? new Date(Date.parse(to) - 27 * 86_400_000).toISOString().slice(0, 10);
      const { rows: habits } = await db.query(
        `SELECT id, name, target_per_week, created_at FROM habits
         WHERE user_id = $1 AND archived_at IS NULL ORDER BY created_at`,
        [req.user.id],
      );
      const { rows: checkins } = await db.query(
        `SELECT c.habit_id, to_char(c.day, 'YYYY-MM-DD') AS day
         FROM habit_checkins c JOIN habits h ON h.id = c.habit_id
         WHERE h.user_id = $1 AND c.day BETWEEN $2 AND $3`,
        [req.user.id, from, to],
      );
      const byHabit = new Map(habits.map((h) => [h.id, []]));
      for (const c of checkins) byHabit.get(c.habit_id)?.push(c.day);
      res.json({
        from,
        to,
        habits: habits.map((h) => ({
          id: h.id,
          name: h.name,
          targetPerWeek: h.target_per_week,
          checkins: byHabit.get(h.id).sort(),
        })),
      });
    }),
  );

  router.post(
    '/',
    validate({ body: createBody }),
    wrap(async (req, res) => {
      const { count } = (
        await db.query('SELECT count(*)::int AS count FROM habits WHERE user_id = $1 AND archived_at IS NULL', [
          req.user.id,
        ])
      ).rows[0];
      if (count >= 12) throw new HttpError(409, 'Twelve habits is plenty. Archive one first.');
      const { rows } = await db.query(
        'INSERT INTO habits (user_id, name, target_per_week) VALUES ($1, $2, $3) RETURNING *',
        [req.user.id, req.valid.body.name, req.valid.body.targetPerWeek],
      );
      res.status(201).json({ habit: { id: rows[0].id, name: rows[0].name, targetPerWeek: rows[0].target_per_week, checkins: [] } });
    }),
  );

  router.patch(
    '/:id',
    validate({ params: idParam, body: updateBody }),
    wrap(async (req, res) => {
      const { rows } = await db.query(
        `UPDATE habits SET name = COALESCE($1, name), target_per_week = COALESCE($2, target_per_week)
         WHERE id = $3 AND user_id = $4 AND archived_at IS NULL RETURNING *`,
        [req.valid.body.name ?? null, req.valid.body.targetPerWeek ?? null, req.valid.params.id, req.user.id],
      );
      if (!rows[0]) throw new HttpError(404, 'Habit not found.');
      res.json({ habit: { id: rows[0].id, name: rows[0].name, targetPerWeek: rows[0].target_per_week } });
    }),
  );

  router.delete(
    '/:id',
    validate({ params: idParam }),
    wrap(async (req, res) => {
      // Archive rather than delete, so past check-ins (and the rewards they earned) stay explainable.
      const { rows } = await db.query(
        'UPDATE habits SET archived_at = now() WHERE id = $1 AND user_id = $2 AND archived_at IS NULL RETURNING id',
        [req.valid.params.id, req.user.id],
      );
      if (!rows[0]) throw new HttpError(404, 'Habit not found.');
      res.status(204).end();
    }),
  );

  router.put(
    '/:id/checkins/:day',
    validate({ params: checkinParams }),
    wrap(async (req, res) => {
      const { id, day: date } = req.valid.params;
      assertCheckinDay(date);
      const result = await db.tx(async (q) => {
        const owned = await q('SELECT 1 FROM habits WHERE id = $1 AND user_id = $2 AND archived_at IS NULL', [
          id,
          req.user.id,
        ]);
        if (!owned.rows[0]) throw new HttpError(404, 'Habit not found.');
        await q('INSERT INTO habit_checkins (habit_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, date]);
        // Un-checking and re-checking the same day never pays twice.
        const reward = REWARDS.habitCheckin();
        const applied = await applyProgress(q, {
          userId: req.user.id,
          kind: 'habit_checkin',
          ref: `${id}:${date}`,
          ...reward,
        });
        return { reward: applied.granted ? reward : null, progress: applied.progress };
      });
      res.json(result);
    }),
  );

  router.delete(
    '/:id/checkins/:day',
    validate({ params: checkinParams }),
    wrap(async (req, res) => {
      const { id, day: date } = req.valid.params;
      await db.query(
        `DELETE FROM habit_checkins c USING habits h
         WHERE c.habit_id = h.id AND h.user_id = $1 AND c.habit_id = $2 AND c.day = $3`,
        [req.user.id, id, date],
      );
      res.status(204).end();
    }),
  );

  return router;
}
