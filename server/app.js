import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { ROOT } from './config.js';
import { readSession } from './middleware/auth.js';
import { errorHandler, notFound, sameOriginWrites } from './middleware/http.js';
import { authRoutes } from './routes/auth.js';
import { assignmentRoutes } from './routes/assignments.js';
import { officialRoutes } from './routes/official.js';
import { habitRoutes } from './routes/habits.js';
import { focusRoutes } from './routes/focus.js';
import { companionRoutes } from './routes/companion.js';
import { roomRoutes } from './routes/rooms.js';

export function createLimiters(config) {
  const off = config.env === 'test';
  const make = (windowMs, limit) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => off,
      message: { error: 'Too many requests. Take a breath and try again in a minute.' },
    });
  return {
    auth: make(15 * 60_000, 20), // sign-in / sign-up attempts per IP
    writes: make(60_000, 30),
    api: make(60_000, 300),
  };
}

/** Builds the Express app. Kept free of listen() so tests can drive it directly. */
export function createApp({ db, config, log = console, now }) {
  const app = express();
  const limiters = createLimiters(config);

  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null, // HSTS covers HTTPS deployments; this would break plain-HTTP localhost
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(readSession(config));

  const api = express.Router();
  api.use(limiters.api, sameOriginWrites);
  api.get('/health', (_req, res) => res.json({ status: 'ok', database: db.kind }));
  api.use('/auth', authRoutes({ db, config, limiters }));
  api.use('/assignments', assignmentRoutes({ db }));
  api.use('/official', officialRoutes({ db }));
  api.use('/habits', habitRoutes({ db }));
  api.use('/focus', focusRoutes({ db, now }));
  api.use('/companion', companionRoutes({ db }));
  api.use('/rooms', roomRoutes({ db, limiters }));
  api.use(notFound);
  app.use('/api', api);

  // The built frontend (vite build → dist/). Only that folder is public;
  // server code is never reachable over HTTP.
  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: 'index.html', extensions: ['html'], maxAge: config.production ? '1h' : 0 }));
  }

  app.use(notFound);
  app.use(errorHandler(log));
  return app;
}
