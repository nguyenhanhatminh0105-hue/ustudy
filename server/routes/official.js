import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, idParam, validate, wrap } from '../middleware/http.js';
import { toAssignment } from './assignments.js';

const body = z.object({
  course: z.string().trim().min(1, 'Add a course.').max(40),
  title: z.string().trim().min(1, 'Add a title.').max(160),
  description: z.string().trim().max(4000).default(''),
  dueAt: z.iso.datetime({ offset: true, message: 'Pick a due date and time.' }),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  estimatedHours: z.coerce.number().int().min(1).max(200).default(1),
});

function toOfficial(row) {
  return {
    id: row.id,
    course: row.course,
    title: row.title,
    description: row.description,
    dueAt: row.due_at instanceof Date ? row.due_at.toISOString() : row.due_at,
    priority: row.priority,
    estimatedHours: row.estimated_hours,
    added: row.added ?? undefined,
  };
}

/** Course-wide assignments: admins publish them, students add them to their own list. */
export function officialRoutes({ db }) {
  const router = Router();

  router.get(
    '/',
    requireAuth,
    wrap(async (req, res) => {
      const { rows } = await db.query(
        `SELECT o.*, EXISTS (
           SELECT 1 FROM assignments a WHERE a.official_id = o.id AND a.user_id = $1
         ) AS added
         FROM official_assignments o
         WHERE o.due_at > now() - interval '1 day'
         ORDER BY o.due_at`,
        [req.user.id],
      );
      res.json({ official: rows.map(toOfficial) });
    }),
  );

  router.post(
    '/:id/add',
    requireAuth,
    validate({ params: idParam }),
    wrap(async (req, res) => {
      const { rows } = await db.query(
        `INSERT INTO assignments (user_id, official_id, course, title, description, due_at, priority, total_hours)
         SELECT $1, o.id, o.course, o.title, o.description, o.due_at, o.priority, o.estimated_hours
         FROM official_assignments o WHERE o.id = $2
         ON CONFLICT (user_id, official_id) DO NOTHING
         RETURNING *`,
        [req.user.id, req.valid.params.id],
      );
      if (!rows[0]) {
        const exists = await db.query('SELECT 1 FROM official_assignments WHERE id = $1', [req.valid.params.id]);
        if (!exists.rows[0]) throw new HttpError(404, 'Assignment not found.');
        throw new HttpError(409, 'Already on your list.');
      }
      res.status(201).json({ assignment: toAssignment(rows[0]) });
    }),
  );

  // ── Admin ────────────────────────────────────────────────────────
  const admin = requireRole('admin');

  /** Staff view: every posted assignment, with how many students have added it. */
  router.get(
    '/manage',
    admin,
    wrap(async (_req, res) => {
      const { rows } = await db.query(
        `SELECT o.*, (SELECT count(*)::int FROM assignments a WHERE a.official_id = o.id) AS adopted
         FROM official_assignments o ORDER BY o.due_at DESC`,
      );
      res.json({ official: rows.map((r) => ({ ...toOfficial(r), adopted: r.adopted })) });
    }),
  );

  router.post(
    '/',
    admin,
    validate({ body }),
    wrap(async (req, res) => {
      const o = req.valid.body;
      const { rows } = await db.query(
        `INSERT INTO official_assignments (course, title, description, due_at, priority, estimated_hours, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [o.course, o.title, o.description, o.dueAt, o.priority, o.estimatedHours, req.user.id],
      );
      res.status(201).json({ official: toOfficial(rows[0]) });
    }),
  );

  router.put(
    '/:id',
    admin,
    validate({ params: idParam, body }),
    wrap(async (req, res) => {
      const o = req.valid.body;
      const { rows } = await db.query(
        `UPDATE official_assignments SET course = $1, title = $2, description = $3, due_at = $4,
           priority = $5, estimated_hours = $6
         WHERE id = $7 RETURNING *`,
        [o.course, o.title, o.description, o.dueAt, o.priority, o.estimatedHours, req.valid.params.id],
      );
      if (!rows[0]) throw new HttpError(404, 'Assignment not found.');
      res.json({ official: toOfficial(rows[0]) });
    }),
  );

  router.delete(
    '/:id',
    admin,
    validate({ params: idParam }),
    wrap(async (req, res) => {
      const { rows } = await db.query('DELETE FROM official_assignments WHERE id = $1 RETURNING id', [
        req.valid.params.id,
      ]);
      if (!rows[0]) throw new HttpError(404, 'Assignment not found.');
      res.status(204).end();
    }),
  );

  return router;
}
