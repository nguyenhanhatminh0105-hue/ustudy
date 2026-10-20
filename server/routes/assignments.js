import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, idParam, validate, wrap } from '../middleware/http.js';
import { REWARDS } from '../domain/progression.js';
import { applyProgress } from '../domain/ledger.js';

const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['not_started', 'in_progress', 'completed'];

const fields = {
  course: z.string().trim().min(1, 'Add a course.').max(40),
  title: z.string().trim().min(1, 'Add a title.').max(160),
  description: z.string().trim().max(4000).default(''),
  dueAt: z.iso.datetime({ offset: true, message: 'Pick a due date and time.' }),
  priority: z.enum(PRIORITIES).default('medium'),
  totalHours: z.coerce.number().int().min(1).max(200).default(1),
};

const createBody = z.object(fields);
const updateBody = z
  .object({
    course: fields.course,
    title: fields.title,
    description: z.string().trim().max(4000),
    dueAt: fields.dueAt,
    priority: z.enum(PRIORITIES),
    totalHours: z.coerce.number().int().min(1).max(200),
    status: z.enum(['not_started', 'in_progress']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

const logHoursBody = z.object({ hours: z.coerce.number().int().min(1).max(24) });

export function toAssignment(row) {
  return {
    id: row.id,
    officialId: row.official_id,
    course: row.course,
    title: row.title,
    description: row.description,
    dueAt: row.due_at instanceof Date ? row.due_at.toISOString() : row.due_at,
    priority: row.priority,
    status: row.status,
    totalHours: row.total_hours,
    hoursWorked: row.hours_worked,
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
  };
}

/** Marks an assignment complete and grants its reward once, ever. */
async function completeInTx(q, userId, assignmentId) {
  const { rows } = await q(
    `UPDATE assignments
     SET status = 'completed', hours_worked = GREATEST(hours_worked, total_hours),
         completed_at = COALESCE(completed_at, now()), updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [assignmentId, userId],
  );
  if (!rows[0]) throw new HttpError(404, 'Assignment not found.');
  const reward = REWARDS.assignmentComplete(rows[0].total_hours);
  const { granted, progress } = await applyProgress(q, {
    userId,
    kind: 'assignment_complete',
    ref: assignmentId,
    ...reward,
  });
  return { assignment: toAssignment(rows[0]), reward: granted ? reward : null, progress };
}

export function assignmentRoutes({ db }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    validate({ query: listQuery }),
    wrap(async (req, res) => {
      const { status, from, to } = req.valid.query;
      const { rows } = await db.query(
        `SELECT * FROM assignments
         WHERE user_id = $1
           AND ($2::text IS NULL OR status = $2)
           AND ($3::timestamptz IS NULL OR due_at >= $3)
           AND ($4::timestamptz IS NULL OR due_at < $4)
         ORDER BY (status = 'completed'), due_at ASC`,
        [req.user.id, status ?? null, from ?? null, to ?? null],
      );
      res.json({ assignments: rows.map(toAssignment) });
    }),
  );

  router.post(
    '/',
    validate({ body: createBody }),
    wrap(async (req, res) => {
      const a = req.valid.body;
      const { rows } = await db.query(
        `INSERT INTO assignments (user_id, course, title, description, due_at, priority, total_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, a.course, a.title, a.description, a.dueAt, a.priority, a.totalHours],
      );
      res.status(201).json({ assignment: toAssignment(rows[0]) });
    }),
  );

  router.patch(
    '/:id',
    validate({ params: idParam, body: updateBody }),
    wrap(async (req, res) => {
      const b = req.valid.body;
      const { rows } = await db.query(
        `UPDATE assignments SET
           course = COALESCE($1, course), title = COALESCE($2, title),
           description = COALESCE($3, description), due_at = COALESCE($4, due_at),
           priority = COALESCE($5, priority), total_hours = COALESCE($6, total_hours),
           status = COALESCE($7, status),
           completed_at = CASE WHEN $7 IS NOT NULL THEN NULL ELSE completed_at END,
           updated_at = now()
         WHERE id = $8 AND user_id = $9 RETURNING *`,
        [
          b.course ?? null, b.title ?? null, b.description ?? null, b.dueAt ?? null,
          b.priority ?? null, b.totalHours ?? null, b.status ?? null,
          req.valid.params.id, req.user.id,
        ],
      );
      if (!rows[0]) throw new HttpError(404, 'Assignment not found.');
      res.json({ assignment: toAssignment(rows[0]) });
    }),
  );

  router.post(
    '/:id/complete',
    validate({ params: idParam }),
    wrap(async (req, res) => {
      res.json(await db.tx((q) => completeInTx(q, req.user.id, req.valid.params.id)));
    }),
  );

  router.post(
    '/:id/log-hours',
    validate({ params: idParam, body: logHoursBody }),
    wrap(async (req, res) => {
      const result = await db.tx(async (q) => {
        const { rows } = await q(
          `UPDATE assignments
           SET hours_worked = LEAST(hours_worked + $1, total_hours),
               status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
               updated_at = now()
           WHERE id = $2 AND user_id = $3 AND status <> 'completed' RETURNING *`,
          [req.valid.body.hours, req.valid.params.id, req.user.id],
        );
        if (!rows[0]) throw new HttpError(404, 'Assignment not found or already completed.');
        if (rows[0].hours_worked >= rows[0].total_hours) return completeInTx(q, req.user.id, rows[0].id);
        return { assignment: toAssignment(rows[0]), reward: null, progress: null };
      });
      res.json(result);
    }),
  );

  router.delete(
    '/:id',
    validate({ params: idParam }),
    wrap(async (req, res) => {
      const { rows } = await db.query('DELETE FROM assignments WHERE id = $1 AND user_id = $2 RETURNING id', [
        req.valid.params.id,
        req.user.id,
      ]);
      if (!rows[0]) throw new HttpError(404, 'Assignment not found.');
      res.status(204).end();
    }),
  );

  return router;
}
