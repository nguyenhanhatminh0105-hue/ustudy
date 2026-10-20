import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, validate, wrap } from '../middleware/http.js';
import { TREATS, getTreat } from '../domain/catalog.js';
import { applyProgress } from '../domain/ledger.js';
import { progressSnapshot } from '../domain/progression.js';

const giftBody = z.object({ treat: z.string().min(1).max(20) });

export function companionRoutes({ db }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    wrap(async (req, res) => {
      const { rows } = await db.query('SELECT xp, coins, companion, companion_name FROM users WHERE id = $1', [
        req.user.id,
      ]);
      if (!rows[0]) throw new HttpError(401, 'Please sign in.');
      const recent = await db.query(
        `SELECT treat, given_at FROM gifts WHERE user_id = $1 ORDER BY given_at DESC LIMIT 10`,
        [req.user.id],
      );
      res.json({ progress: progressSnapshot(rows[0]), recentGifts: recent.rows });
    }),
  );

  router.get('/treats', (_req, res) => {
    res.json({ treats: Object.values(TREATS) });
  });

  /** Spend coins on a treat for the companion. The price comes from the server's catalogue. */
  router.post(
    '/gifts',
    validate({ body: giftBody }),
    wrap(async (req, res) => {
      const treat = getTreat(req.valid.body.treat);
      if (!treat) throw new HttpError(400, 'That treat isn’t on the menu.');
      const result = await db.tx(async (q) => {
        const { rows } = await q('INSERT INTO gifts (user_id, treat, cost) VALUES ($1, $2, $3) RETURNING id', [
          req.user.id,
          treat.id,
          treat.cost,
        ]);
        const { progress } = await applyProgress(q, {
          userId: req.user.id,
          kind: 'gift',
          ref: rows[0].id,
          xp: treat.xp,
          coins: -treat.cost,
        });
        return { treat, progress };
      });
      res.status(201).json(result);
    }),
  );

  router.get(
    '/activity',
    wrap(async (req, res) => {
      const { rows } = await db.query(
        `SELECT kind, xp, coins, created_at FROM progress_events
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [req.user.id],
      );
      res.json({ events: rows });
    }),
  );

  return router;
}
