/**
 * Which UStudy the extension talks to.
 *
 * With no saved choice it prefers a UStudy running on this computer (your own
 * local data) and falls back to the hosted one. A saved address always wins.
 */
export const LOCAL_SERVER = 'http://localhost:3000';
export const HOSTED_SERVER = 'https://ustudy-9q3q.onrender.com';

const BUILT_IN = new Set([LOCAL_SERVER, 'http://127.0.0.1:3000', HOSTED_SERVER]);

/** The origin of an http(s) address, or null if it isn't one. */
export function normalizeServer(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** The browser permission pattern covering a server (ports are not part of a pattern). */
export function originPattern(server) {
  const url = new URL(server);
  return `${url.protocol}//${url.hostname}/*`;
}

/** Servers the extension may reach without asking for another permission. */
export const isBuiltIn = (server) => BUILT_IN.has(server);

/**
 * Local if a UStudy answers on this computer, otherwise hosted. Only a JSON
 * answer from the session endpoint counts, so another program on port 3000
 * isn't mistaken for UStudy.
 */
export async function pickDefaultServer({ fetchImpl = fetch, timeoutMs = 1500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${LOCAL_SERVER}/api/auth/session`, { credentials: 'include', signal: controller.signal });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (isJson && (res.status === 200 || res.status === 401)) return LOCAL_SERVER;
  } catch {
    // Nothing listening locally, or it took too long.
  } finally {
    clearTimeout(timer);
  }
  return HOSTED_SERVER;
}

export async function getServer({ storage = globalThis.chrome?.storage?.local, fetchImpl = fetch } = {}) {
  const saved = storage ? normalizeServer((await storage.get('server')).server) : null;
  return saved || pickDefaultServer({ fetchImpl });
}
