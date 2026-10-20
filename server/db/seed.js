import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';

/**
 * Sample accounts and data so a reviewer can explore a lived-in app right away.
 * Only runs against an empty database, and only in development by default
 * (SEED_DEMO). Everything here is sample data.
 */
export const DEMO = {
  student: { email: 'demo@ustudy.app', password: 'study-with-mochi', name: 'Alex Rivera' },
  admin: { email: 'admin@ustudy.app', password: 'admin-garden-keeper', name: 'Course Admin' },
};

const day = 86_400_000;
const at = (offsetDays, hour = 23, minute = 59) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const dateOnly = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

export async function seedDemo(db, log = console) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return false;

  const [studentHash, adminHash] = await Promise.all([
    bcrypt.hash(DEMO.student.password, 12),
    bcrypt.hash(DEMO.admin.password, 12),
  ]);

  await db.tx(async (q) => {
    const student = (
      await q(
        `INSERT INTO users (name, email, password_hash, companion, companion_name, xp, coins)
         VALUES ($1, $2, $3, 'turtle', 'Mochi', 520, 140) RETURNING id`,
        [DEMO.student.name, DEMO.student.email, studentHash],
      )
    ).rows[0].id;
    const admin = (
      await q(
        `INSERT INTO users (name, email, password_hash, role, companion, companion_name)
         VALUES ($1, $2, $3, 'admin', 'panda', 'Bao') RETURNING id`,
        [DEMO.admin.name, DEMO.admin.email, adminHash],
      )
    ).rows[0].id;

    await q(
      `INSERT INTO progress_events (user_id, kind, ref, xp, coins) VALUES ($1, 'seed', 'sample-progress', 520, 140)`,
      [student],
    );

    const assignments = [
      ['CMPT 381', 'A3: Interaction techniques prototype', 'Build the drag-and-drop prototype and record a 2-minute demo.', at(2), 'high', 8, 3, 'in_progress'],
      ['CMPT 360', 'Midterm review: asymptotics', 'Work through practice set 4 and the recurrence questions.', at(4, 18, 0), 'medium', 4, 0, 'not_started'],
      ['STAT 245', 'Lab 6: Confidence intervals', '', at(6, 17, 0), 'low', 2, 0, 'not_started'],
      ['CMPT 381', 'Reading response: Fitts’ law', 'One page, cite two papers.', at(9), 'medium', 2, 0, 'not_started'],
      ['CMPT 360', 'A2: Divide and conquer', '', at(-3), 'high', 6, 6, 'completed'],
    ];
    for (const [course, title, description, due, priority, total, worked, status] of assignments) {
      await q(
        `INSERT INTO assignments (user_id, course, title, description, due_at, priority, total_hours, hours_worked, status, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 = 'completed' THEN now() - interval '3 days' END)`,
        [student, course, title, description, due, priority, total, worked, status],
      );
    }

    const habits = [
      ['Read 20 pages', 7, [0, -1, -2, -4, -5, -6, -8]],
      ['Morning walk', 5, [-1, -2, -3, -6, -7]],
      ['Review lecture notes', 4, [0, -2, -5, -9]],
    ];
    for (const [name, target, days] of habits) {
      const id = (
        await q('INSERT INTO habits (user_id, name, target_per_week) VALUES ($1, $2, $3) RETURNING id', [
          student,
          name,
          target,
        ])
      ).rows[0].id;
      for (const d of days) await q('INSERT INTO habit_checkins (habit_id, day) VALUES ($1, $2)', [id, dateOnly(d)]);
    }

    for (const [offset, minutes] of [[-1, 50], [-2, 25], [-3, 75], [-5, 40], [-6, 25]]) {
      const start = new Date(Date.now() + offset * day);
      start.setHours(19, 0, 0, 0);
      await q(
        `INSERT INTO focus_sessions (user_id, planned_minutes, minutes, started_at, ended_at)
         VALUES ($1, $2, $2, $3, $3::timestamptz + make_interval(mins => $2))`,
        [student, minutes, start.toISOString()],
      );
    }

    const official = [
      ['CMPT 381', 'A4: Accessibility audit', 'Audit a public site against WCAG 2.2 AA and write up five findings.', at(12), 'high', 6],
      ['CMPT 360', 'Problem set 5', 'Greedy algorithms and exchange arguments.', at(8), 'medium', 4],
    ];
    for (const [course, title, description, due, priority, hours] of official) {
      await q(
        `INSERT INTO official_assignments (course, title, description, due_at, priority, estimated_hours, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [course, title, description, due, priority, hours, admin],
      );
    }
  });

  log.info(`[seed] sample accounts ready: ${DEMO.student.email} / ${DEMO.student.password} (admin: ${DEMO.admin.email})`);
  return true;
}

// `npm run seed` runs this file directly.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { loadConfig } = await import('../config.js');
  const { createDb } = await import('./index.js');
  const { migrate } = await import('./migrate.js');
  const config = loadConfig();
  const db = await createDb(config);
  await migrate(db);
  const seeded = await seedDemo(db);
  if (!seeded) console.log('[seed] database already has users; nothing to do.');
  await db.close();
}
