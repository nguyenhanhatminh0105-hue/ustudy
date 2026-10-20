import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { z } from 'zod';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Point at any Postgres (e.g. postgres://user:pass@localhost:5432/ustudy).
  // Leave unset to use the embedded PGlite database, which needs no install.
  DATABASE_URL: z.string().url().optional(),
  PGLITE_DIR: z.string().default(path.join(ROOT, '.data', 'pglite')),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  COOKIE_SECURE: bool.optional(),
  SEED_DEMO: bool.optional(),
});

/**
 * Reads and validates configuration. Fails fast on bad input rather than
 * limping along with defaults that are unsafe in production.
 */
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const cfg = parsed.data;
  const production = cfg.NODE_ENV === 'production';

  let jwtSecret = cfg.JWT_SECRET;
  if (!jwtSecret) {
    if (production) throw new Error('JWT_SECRET is required in production.');
    // Development only: a random secret per boot. Sessions reset on restart,
    // which is the honest trade-off for never shipping a hard-coded secret.
    jwtSecret = crypto.randomBytes(48).toString('hex');
    if (cfg.NODE_ENV === 'development') {
      console.warn('[config] JWT_SECRET not set; using a random per-boot secret (sessions reset on restart).');
    }
  }

  return {
    env: cfg.NODE_ENV,
    production,
    port: cfg.PORT,
    databaseUrl: cfg.DATABASE_URL,
    pgliteDir: cfg.NODE_ENV === 'test' ? null : cfg.PGLITE_DIR,
    jwtSecret,
    cookieSecure: cfg.COOKIE_SECURE ?? production,
    seedDemo: cfg.SEED_DEMO ?? !production,
  };
}
