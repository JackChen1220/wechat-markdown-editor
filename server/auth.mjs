import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './ai-layout.mjs';

const scrypt = promisify(scryptCallback);

const PASSWORD_HASH_PREFIX = 'scrypt';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SESSION_COOKIE_NAME = 'gzh_admin_session';
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOGIN_MAX_FAILURES = 5;
const PASSWORD_MAX_LENGTH = 1024;

function parsePositiveInteger(rawValue, fallback, label) {
  if (rawValue == null || rawValue === '') return fallback;
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(500, `${label} must be a positive integer.`);
  }
  return value;
}

function decodeBase64Url(value) {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    return Buffer.alloc(0);
  }
}

function parsePasswordHash(encodedHash) {
  const parts = String(encodedHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_PREFIX) {
    throw new HttpError(500, 'ADMIN_PASSWORD_HASH is invalid.');
  }

  const n = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  const salt = decodeBase64Url(parts[4]);
  const expected = decodeBase64Url(parts[5]);

  if (
    n !== SCRYPT_N ||
    r !== SCRYPT_R ||
    p !== SCRYPT_P ||
    salt.length < 16 ||
    expected.length !== SCRYPT_KEY_LENGTH
  ) {
    throw new HttpError(500, 'ADMIN_PASSWORD_HASH is invalid.');
  }

  return { n, r, p, salt, expected };
}

async function derivePassword(password, parsedHash) {
  return await scrypt(password, parsedHash.salt, parsedHash.expected.length, {
    N: parsedHash.n,
    r: parsedHash.r,
    p: parsedHash.p,
    maxmem: SCRYPT_MAX_MEMORY
  });
}

export async function hashAdminPassword(password, options = {}) {
  if (typeof password !== 'string' || password.length < 12 || password.length > PASSWORD_MAX_LENGTH) {
    throw new HttpError(400, 'Admin password must be between 12 and 1024 characters.');
  }
  const salt = options.salt || randomBytes(16);
  if (!Buffer.isBuffer(salt) || salt.length < 16) {
    throw new HttpError(500, 'Password salt is invalid.');
  }
  const parsedHash = {
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    salt,
    expected: Buffer.alloc(SCRYPT_KEY_LENGTH)
  };
  const derived = await derivePassword(password, parsedHash);
  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    Buffer.from(derived).toString('base64url')
  ].join('$');
}

export async function verifyAdminPassword(password, encodedHash) {
  const parsedHash = parsePasswordHash(encodedHash);
  const normalizedPassword = typeof password === 'string' && password.length <= PASSWORD_MAX_LENGTH
    ? password
    : '';
  const actual = Buffer.from(await derivePassword(normalizedPassword, parsedHash));
  return timingSafeEqual(actual, parsedHash.expected) && normalizedPassword.length > 0;
}

function parseBoolean(rawValue, fallback = false) {
  if (rawValue == null || rawValue === '') return fallback;
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new HttpError(500, 'Boolean environment value is invalid.');
}

export function loadAuthConfig(env = process.env) {
  const production = String(env.NODE_ENV || '').trim() === 'production';
  const passwordHash = String(env.ADMIN_PASSWORD_HASH || '').trim();
  const publicOrigin = String(env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');

  if (production && !passwordHash) {
    throw new HttpError(500, 'ADMIN_PASSWORD_HASH is required when NODE_ENV=production.');
  }
  if (production && !publicOrigin) {
    throw new HttpError(500, 'PUBLIC_ORIGIN is required when NODE_ENV=production.');
  }
  if (passwordHash) parsePasswordHash(passwordHash);
  if (publicOrigin) {
    let parsed;
    try {
      parsed = new URL(publicOrigin);
    } catch {
      throw new HttpError(500, 'PUBLIC_ORIGIN must be a valid http(s) origin.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== publicOrigin) {
      throw new HttpError(500, 'PUBLIC_ORIGIN must be a valid http(s) origin.');
    }
  }

  return {
    passwordHash,
    publicOrigin,
    cookieName: SESSION_COOKIE_NAME,
    cookieSecure: production || parseBoolean(env.SESSION_COOKIE_SECURE, false),
    sessionTtlMs: parsePositiveInteger(env.SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_MS / 1000, 'SESSION_TTL_SECONDS') * 1000,
    sessionIdleTtlMs: parsePositiveInteger(env.SESSION_IDLE_TTL_SECONDS, DEFAULT_SESSION_IDLE_TTL_MS / 1000, 'SESSION_IDLE_TTL_SECONDS') * 1000,
    loginWindowMs: parsePositiveInteger(env.LOGIN_RATE_WINDOW_SECONDS, DEFAULT_LOGIN_WINDOW_MS / 1000, 'LOGIN_RATE_WINDOW_SECONDS') * 1000,
    loginMaxFailures: parsePositiveInteger(env.LOGIN_RATE_MAX_FAILURES, DEFAULT_LOGIN_MAX_FAILURES, 'LOGIN_RATE_MAX_FAILURES'),
    trustProxy: parseBoolean(env.TRUST_PROXY, false)
  };
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('base64url');
}

function parseCookies(request) {
  const result = new Map();
  const rawCookie = request.headers.cookie;
  if (typeof rawCookie !== 'string') return result;
  for (const pair of rawCookie.split(';')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name && !result.has(name)) result.set(name, value);
  }
  return result;
}

function normalizeAddress(address) {
  const value = String(address || '').trim();
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function getClientAddress(request, trustProxy) {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const first = normalizeAddress(forwarded.split(',')[0]);
      if (first) return first;
    }
  }
  return normalizeAddress(request.socket?.remoteAddress) || 'unknown';
}

function buildCookie(name, value, { secure, maxAgeSeconds }) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function sessionPayload(session) {
  return {
    authenticated: true,
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.absoluteExpiresAt).toISOString()
  };
}

export class AdminAuthService {
  constructor(config, options = {}) {
    this.config = config;
    this.now = options.now || Date.now;
    this.sessions = new Map();
    this.loginFailures = new Map();
  }

  prune(now = this.now()) {
    for (const [key, session] of this.sessions) {
      if (session.absoluteExpiresAt <= now || session.idleExpiresAt <= now) this.sessions.delete(key);
    }
    for (const [key, failure] of this.loginFailures) {
      if (failure.windowStartedAt + this.config.loginWindowMs <= now) {
        this.loginFailures.delete(key);
      }
    }
  }

  getSession(request) {
    this.prune();
    const token = parseCookies(request).get(this.config.cookieName);
    if (!token) return null;
    const session = this.sessions.get(hashSessionToken(token));
    const now = this.now();
    if (!session || session.absoluteExpiresAt <= now || session.idleExpiresAt <= now) return null;
    session.idleExpiresAt = Math.min(session.absoluteExpiresAt, now + this.config.sessionIdleTtlMs);
    return session;
  }

  getSessionStatus(request) {
    const session = this.getSession(request);
    return session ? sessionPayload(session) : { authenticated: false };
  }

  requireSession(request) {
    const session = this.getSession(request);
    if (!session) throw new HttpError(401, 'Authentication required.');
    return session;
  }

  requireCsrf(request, session) {
    const supplied = request.headers['x-csrf-token'];
    if (typeof supplied !== 'string' || supplied.length !== session.csrfToken.length) {
      throw new HttpError(403, 'Invalid CSRF token.');
    }
    const expected = Buffer.from(session.csrfToken);
    const actual = Buffer.from(supplied);
    if (!timingSafeEqual(actual, expected)) {
      throw new HttpError(403, 'Invalid CSRF token.');
    }
  }

  getLoginRetryAfter(request) {
    this.prune();
    const key = getClientAddress(request, this.config.trustProxy);
    const failure = this.loginFailures.get(key);
    if (!failure || failure.count < this.config.loginMaxFailures) return 0;
    const remainingMs = failure.windowStartedAt + this.config.loginWindowMs - this.now();
    return Math.max(1, Math.ceil(remainingMs / 1000));
  }

  recordLoginFailure(request) {
    const key = getClientAddress(request, this.config.trustProxy);
    const now = this.now();
    const existing = this.loginFailures.get(key);
    if (!existing || existing.windowStartedAt + this.config.loginWindowMs <= now) {
      this.loginFailures.set(key, { count: 1, windowStartedAt: now });
      return;
    }
    existing.count += 1;
  }

  clearLoginFailures(request) {
    this.loginFailures.delete(getClientAddress(request, this.config.trustProxy));
  }

  async login(request, password) {
    if (!this.config.passwordHash) {
      throw new HttpError(503, 'Admin login is not configured.');
    }
    const retryAfter = this.getLoginRetryAfter(request);
    if (retryAfter > 0) {
      const error = new HttpError(429, 'Too many login attempts. Try again later.');
      error.headers = { 'retry-after': String(retryAfter) };
      throw error;
    }

    const valid = await verifyAdminPassword(password, this.config.passwordHash);
    if (!valid) {
      this.recordLoginFailure(request);
      throw new HttpError(401, 'Invalid admin password.');
    }

    this.clearLoginFailures(request);
    const token = randomBytes(32).toString('base64url');
    const session = {
      csrfToken: randomBytes(32).toString('base64url'),
      absoluteExpiresAt: this.now() + this.config.sessionTtlMs,
      idleExpiresAt: this.now() + this.config.sessionIdleTtlMs
    };
    this.sessions.set(hashSessionToken(token), session);

    return {
      cookie: buildCookie(this.config.cookieName, token, {
        secure: this.config.cookieSecure,
        maxAgeSeconds: this.config.sessionTtlMs / 1000
      }),
      payload: sessionPayload(session)
    };
  }

  logout(request, session) {
    const token = parseCookies(request).get(this.config.cookieName);
    if (token) this.sessions.delete(hashSessionToken(token));
    return {
      cookie: buildCookie(this.config.cookieName, '', {
        secure: this.config.cookieSecure,
        maxAgeSeconds: 0
      }),
      payload: { authenticated: false }
    };
  }
}

export function createAdminAuthService(env = process.env, options = {}) {
  return new AdminAuthService(loadAuthConfig(env), options);
}

function getOrigin(request) {
  const value = request.headers.origin;
  return typeof value === 'string' ? value.trim() : '';
}

export function ensureSameOrigin(request, expectedOrigin = '') {
  const origin = getOrigin(request);
  const host = typeof request.headers.host === 'string' ? request.headers.host.trim() : '';
  if (!origin || !host) throw new HttpError(403, 'A same-origin request is required.');

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, 'A same-origin request is required.');
  }
  const requiredOrigin = String(expectedOrigin || '').trim().replace(/\/+$/, '');
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    (requiredOrigin ? parsed.origin !== requiredOrigin : parsed.host !== host)
  ) {
    throw new HttpError(403, 'A same-origin request is required.');
  }

  const fetchSite = request.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && !['same-origin', 'none'].includes(fetchSite.toLowerCase())) {
    throw new HttpError(403, 'A same-origin request is required.');
  }
}

export function ensureJsonRequest(request) {
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
}

export function validateLoginPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  if (typeof payload.password !== 'string' || !payload.password || payload.password.length > PASSWORD_MAX_LENGTH) {
    throw new HttpError(400, 'password must be a non-empty string.');
  }
  return payload.password;
}

export { SESSION_COOKIE_NAME };
