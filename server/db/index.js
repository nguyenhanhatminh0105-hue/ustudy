import fs from 'node:fs';

/**
 * One small database interface used by the whole server:
 *   query(sql, params) -> { rows }
 *   tx(async (q) => ...) -> runs q(sql, params) calls inside one transaction
 *   close()
 *
 * Backed by node-postgres when DATABASE_URL is set, otherwise by PGlite
 * (real Postgres compiled to WebAssembly), so the app runs with zero setup
 * and tests get a fresh in-memory database each run.
 */
export async function createDb({ databaseUrl, pgliteDir } = {}) {
  return databaseUrl ? createPgDb(databaseUrl) : createPgliteDb(pgliteDir);
}

async function createPgDb(connectionString) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString, max: 10 });
  await pool.query('SELECT 1');

  return {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn((text, params) => client.query(text, params));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPgliteDb(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;

  // PGlite runs one statement at a time; serialise transactions so a
  // concurrent request can't interleave inside another's BEGIN/COMMIT.
  let chain = Promise.resolve();
  const exclusive = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  return {
    kind: 'pglite',
    query: (text, params) => exclusive(() => db.query(text, params)),
    tx: (fn) => exclusive(() => db.transaction((t) => fn((text, params) => t.query(text, params)))),
    exec: (sql) => exclusive(() => db.exec(sql)),
    close: () => db.close(),
  };
}
