/**
 * Thin JSON client for the UStudy API. The session lives in an httpOnly
 * cookie, so there's no token to store or attach: same-origin fetches
 * carry it automatically.
 */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `Request failed (${status})`);
    this.status = status;
    this.fields = body?.fields ?? [];
  }
  /** Field-level messages keyed by field name, for inline form errors. */
  get fieldErrors() {
    return Object.fromEntries(this.fields.map((f) => [f.field, f.message]));
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'Can’t reach UStudy. Check that the server is running.' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      const back = encodeURIComponent(location.pathname + location.search);
      location.assign(`/?next=${back}`);
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};
