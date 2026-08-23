import { HttpError } from './ai-layout.mjs';

const LOOPBACK_REQUEST_HOST_RX = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i;

export function ensureLoopbackRequestHost(request) {
  const host = typeof request.headers.host === 'string' ? request.headers.host.trim() : '';
  const match = LOOPBACK_REQUEST_HOST_RX.exec(host);
  const port = match?.[1] ? Number.parseInt(match[1], 10) : null;
  if (!match || (port != null && (port < 1 || port > 65_535))) {
    throw new HttpError(403, 'A loopback Host header is required.');
  }
  return host;
}

function expectedRequestOrigin(request) {
  const host = ensureLoopbackRequestHost(request);

  try {
    const protocol = request.socket?.encrypted ? 'https:' : 'http:';
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    throw new HttpError(403, 'A same-origin request is required.');
  }
}

export function ensureSameOrigin(request) {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin.trim() : '';
  if (!origin) throw new HttpError(403, 'A same-origin request is required.');

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, 'A same-origin request is required.');
  }

  if (origin !== parsed.origin || origin !== expectedRequestOrigin(request)) {
    throw new HttpError(403, 'A same-origin request is required.');
  }

  const fetchSite = request.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && !['same-origin', 'none'].includes(fetchSite.trim().toLowerCase())) {
    throw new HttpError(403, 'A same-origin request is required.');
  }
}

export function ensureJsonRequest(request) {
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
}
