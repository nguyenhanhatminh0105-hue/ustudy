import http from 'node:http';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { seedDemo } from './db/seed.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime/socket.js';
import { scheduleRetention } from './jobs/retention.js';

const log = console;

async function main() {
  const config = loadConfig();
  const db = await createDb(config);
  const ran = await migrate(db);
  if (ran.length) log.info(`[db] applied migrations: ${ran.join(', ')}`);
  if (config.seedDemo) await seedDemo(db, log);

  const app = createApp({ db, config, log });
  const server = http.createServer(app);
  attachRealtime(server, { db, config, log });
  const stopRetention = scheduleRetention(db, log);

  server.listen(config.port, () => {
    log.info(`[ustudy] http://localhost:${config.port}  (database: ${db.kind})`);
  });

  const shutdown = async () => {
    stopRetention();
    server.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
