import { z } from 'zod';

/** Validates req.body / req.params / req.query against zod schemas and replaces them with the parsed values. */
export function validate({ body, params, query } = {}) {
  return (req, res, next) => {
    const errors = [];
    for (const [key, schema] of [['body', body], ['params', params], ['query', query]]) {
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (result.success) {
        // Express 5 makes req.query a getter, so store parsed values separately.
        req.valid = { ...req.valid, [key]: result.data };
      } else {
        for (const issue of result.error.issues) {
          errors.push({ field: issue.path.join('.') || key, message: issue.message });
        }
      }
    }
    if (errors.length) return res.status(400).json({ error: 'Some fields need attention.', fields: errors });
    next();
  };
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * Rejects state-changing requests whose Origin doesn't match this host.
 * Belt and braces on top of the SameSite=Strict session cookie.
 */
export function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // same-origin fetches from older browsers, and server-to-server tests
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
  if (host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked.' });
  next();
}

/** Wraps async route handlers so rejections reach the error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found.' });
}

/** Never leaks internals: unexpected errors become a generic 500 and are logged server-side. */
export function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    if (err.expose && err.status) return res.status(err.status).json({ error: err.message });
    log.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(500).json({ error: 'Something went wrong on our side.' });
  };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
