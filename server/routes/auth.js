import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { SESSION_COOKIE, requireAuth, sessionCookieOptions, signSession } from '../middleware/auth.js';
import { HttpError, validate, wrap } from '../middleware/http.js';
import { COMPANIONS, progressSnapshot } from '../domain/progression.js';

const BCRYPT_COST = 12;
// A real hash to compare against when the email is unknown, so a failed login
// takes the same time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_COST);

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

const signupBody = z.object({
  name: z.string().trim().min(1, 'Tell us your name.').max(80),
  email,
  password: z.string().min(10, 'Use at least 10 characters.').max(128),
  companion: z.enum(COMPANIONS).default('turtle'),
});

const loginBody = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(128),
});

const profileBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    companion: z.enum(COMPANIONS).optional(),
    companionName: z.string().trim().min(1).max(24).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    progress: progressSnapshot(row),
  };
}

const USER_COLUMNS = 'id, name, email, role, companion, companion_name, xp, coins';

export function authRoutes({ db, config, limiters }) {
  const router = Router();

  router.post(
    '/signup',
    limiters.auth,
    validate({ body: signupBody }),
    wrap(async (req, res) => {
      const { name, email: address, password, companion } = req.valid.body;
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      let row;
      try {
        ({ rows: [row] } = await db.query(
          `INSERT INTO users (name, email, password_hash, companion)
           VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
          [name, address, hash, companion],
        ));
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, 'An account with that email already exists.');
        throw err;
      }
      res.cookie(SESSION_COOKIE, signSession(config, row), sessionCookieOptions(config));
      res.status(201).json({ user: publicUser(row) });
    }),
  );

  router.post(
    '/login',
    limiters.auth,
    validate({ body: loginBody }),
    wrap(async (req, res) => {
      const { email: address, password } = req.valid.body;
      const { rows } = await db.query(
        `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE lower(email) = $1`,
        [address],
      );
      const row = rows[0];
      const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
      if (!row || !ok) throw new HttpError(401, 'That email and password don’t match.');
      res.cookie(SESSION_COOKIE, signSession(config, row), sessionCookieOptions(config));
      res.json({ user: publicUser(row) });
    }),
  );

  router.post('/logout', (_req, res) => {
    const { maxAge: _maxAge, ...opts } = sessionCookieOptions(config);
    res.clearCookie(SESSION_COOKIE, opts);
    res.status(204).end();
  });

  router.get(
    '/me',
    requireAuth,
    wrap(async (req, res) => {
      const { rows } = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.user.id]);
      if (!rows[0]) throw new HttpError(401, 'Please sign in.');
      res.json({ user: publicUser(rows[0]) });
    }),
  );

  router.patch(
    '/me',
    requireAuth,
    validate({ body: profileBody }),
    wrap(async (req, res) => {
      const { name, companion, companionName } = req.valid.body;
      const { rows } = await db.query(
        `UPDATE users SET
           name = COALESCE($1, name),
           companion = COALESCE($2, companion),
           companion_name = CASE WHEN $3::boolean THEN $4 ELSE companion_name END
         WHERE id = $5 RETURNING ${USER_COLUMNS}`,
        [name ?? null, companion ?? null, companionName !== undefined, companionName ?? null, req.user.id],
      );
      res.json({ user: publicUser(rows[0]) });
    }),
  );

  return router;
}
