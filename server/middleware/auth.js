import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'ustudy_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function sessionCookieOptions(config) {
  return {
    httpOnly: true, // not readable from JavaScript, so an XSS bug can't steal it
    sameSite: 'strict', // never sent on cross-site requests (CSRF defence)
    secure: config.cookieSecure,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  };
}

export function signSession(config, user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_SECONDS,
  });
}

export function verifySession(config, token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return { id: Number(payload.sub), role: payload.role };
  } catch {
    return null;
  }
}

/** Attaches req.user when a valid session cookie is present. */
export function readSession(config) {
  return (req, _res, next) => {
    req.user = verifySession(config, req.cookies?.[SESSION_COOKIE]);
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    if (req.user.role !== role) return res.status(403).json({ error: 'You do not have access to this.' });
    next();
  };
}
