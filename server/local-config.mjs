import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HttpError, getPublicAiConfig, loadRuntimeConfig } from './ai-layout.mjs';

const LOCAL_CONFIG_METHODS = 'GET, HEAD, PUT, POST';
const MANAGED_ENV_KEYS = ['LLM_BASE_URL', 'LLM_API_STYLE', 'LLM_MODEL', 'LLM_API_KEY'];
const ENV_LINE_RX = /^([A-Z0-9_]+)\s*=(.*)$/;
const MODEL_NAME_RX = /^[A-Za-z0-9._:/-]{1,200}$/;
const API_KEY_MAX_LENGTH = 4096;

function isLoopbackHost(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function normalizeRemoteAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}

export function isLoopbackAddress(address) {
  const normalized = normalizeRemoteAddress(address);
  return normalized === '127.0.0.1' || normalized === '::1';
}

function getRequestOrigin(request) {
  const raw = request.headers.origin;
  return typeof raw === 'string' ? raw.trim() : '';
}

function getRequestHost(request) {
  const raw = request.headers.host;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new HttpError(400, 'Missing Host header.');
  }
  return raw.trim();
}

function ensureLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) {
    throw new HttpError(403, 'Local AI config writes are allowed only from loopback clients.');
  }
}

function ensureLocalConfigRuntime(runtimeConfig, env = process.env) {
  if ((env.NODE_ENV || '').trim() === 'production') {
    throw new HttpError(403, 'Local AI config writes are disabled in production.');
  }
  if (!isLoopbackHost(runtimeConfig.host)) {
    throw new HttpError(403, 'Local AI config writes require a loopback server host.');
  }
}

function ensureSameOrigin(request) {
  const origin = getRequestOrigin(request);
  if (!origin) {
    throw new HttpError(403, 'Origin header is required for local AI config writes.');
  }
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new HttpError(403, 'Origin header is invalid.');
  }
  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new HttpError(403, 'Origin header is invalid.');
  }
  const hostHeader = getRequestHost(request);
  if (parsedOrigin.host !== hostHeader) {
    throw new HttpError(403, 'Origin must match the current host.');
  }
}

function ensureJsonRequest(request) {
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
}

function normalizeApiKeyInput(rawValue) {
  if (rawValue == null) return null;
  if (typeof rawValue !== 'string') {
    throw new HttpError(400, 'apiKey must be a string when provided.');
  }
  return rawValue.trim();
}

function ensureSingleLineValue(value, label) {
  if (/[\r\n\0]/.test(value)) {
    throw new HttpError(400, `${label} must be a single-line string.`);
  }
}

function normalizeConfigBaseUrl(rawValue) {
  const value = String(rawValue || '').trim();
  ensureSingleLineValue(value, 'baseUrl');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, 'baseUrl must be a valid URL.');
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (protocol !== 'https:' && !(protocol === 'http:' && isLoopback)) {
    throw new HttpError(400, 'baseUrl must use https, or http only for localhost/loopback.');
  }
  if (parsed.username || parsed.password) {
    throw new HttpError(400, 'baseUrl must not include username or password.');
  }
  if (parsed.search || parsed.hash) {
    throw new HttpError(400, 'baseUrl must not include query or hash.');
  }

  return parsed.toString().replace(/\/+$/, '');
}

function normalizeModelName(rawValue) {
  const value = String(rawValue || '').trim();
  ensureSingleLineValue(value, 'model');
  if (!MODEL_NAME_RX.test(value)) {
    throw new HttpError(400, 'model must be a single-line identifier up to 200 chars using letters, numbers, ., _, :, /, or -.');
  }
  return value;
}

function normalizeConfigApiKey(rawValue) {
  const value = normalizeApiKeyInput(rawValue);
  if (value == null) return null;
  ensureSingleLineValue(value, 'apiKey');
  if (value.length > API_KEY_MAX_LENGTH) {
    throw new HttpError(400, `apiKey must be at most ${API_KEY_MAX_LENGTH} characters.`);
  }
  return value;
}

function buildRuntimeEnvSnapshot(runtimeConfig, env = process.env) {
  return {
    ...env,
    LLM_BASE_URL: env.LLM_BASE_URL ?? runtimeConfig.baseUrl,
    LLM_API_STYLE: env.LLM_API_STYLE ?? runtimeConfig.apiStyle,
    LLM_MODEL: env.LLM_MODEL ?? runtimeConfig.model,
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS ?? String(runtimeConfig.timeoutMs),
    MAX_SOURCE_CHARS: env.MAX_SOURCE_CHARS ?? String(runtimeConfig.maxSourceChars),
    APP_ACCESS_TOKEN: env.APP_ACCESS_TOKEN ?? runtimeConfig.appAccessToken,
    HOST: env.HOST ?? runtimeConfig.host,
    PORT: env.PORT ?? String(runtimeConfig.port || 3000)
  };
}

export function validateLocalConfigPayload(payload, runtimeConfig, env = process.env) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const rawBaseUrl = typeof payload.baseUrl === 'string' ? normalizeConfigBaseUrl(payload.baseUrl) : '';
  const rawApiStyle = typeof payload.apiStyle === 'string' ? payload.apiStyle.trim() : '';
  const rawModel = typeof payload.model === 'string' ? normalizeModelName(payload.model) : '';
  const clearApiKey = payload.clearApiKey === true;
  const apiKey = normalizeConfigApiKey(payload.apiKey);

  if (!rawBaseUrl) throw new HttpError(400, 'baseUrl must be a non-empty string.');
  if (!rawApiStyle) throw new HttpError(400, 'apiStyle must be a non-empty string.');
  if (!rawModel) throw new HttpError(400, 'model must be a non-empty string.');
  if (payload.clearApiKey != null && payload.clearApiKey !== true && payload.clearApiKey !== false) {
    throw new HttpError(400, 'clearApiKey must be a boolean when provided.');
  }
  if (clearApiKey && apiKey && apiKey.length > 0) {
    throw new HttpError(400, 'apiKey cannot be provided when clearApiKey is true.');
  }

  const nextEnv = {
    ...buildRuntimeEnvSnapshot(runtimeConfig, env),
    LLM_BASE_URL: rawBaseUrl,
    LLM_API_STYLE: rawApiStyle,
    LLM_MODEL: rawModel,
    LLM_API_KEY: clearApiKey
      ? ''
      : (apiKey !== null && apiKey.length > 0 ? apiKey : runtimeConfig.apiKey)
  };
  const loaded = loadRuntimeConfig(nextEnv);

  return {
    baseUrl: loaded.baseUrl,
    apiStyle: loaded.apiStyle,
    model: loaded.model,
    apiKey: clearApiKey
      ? ''
      : (apiKey !== null && apiKey.length > 0 ? apiKey : runtimeConfig.apiKey),
    hasApiKey: clearApiKey
      ? false
      : ((apiKey !== null && apiKey.length > 0) || runtimeConfig.configured),
    clearApiKey
  };
}

function buildManagedEnvMap(currentRuntimeConfig, nextConfig) {
  return new Map([
    ['LLM_BASE_URL', nextConfig.baseUrl],
    ['LLM_API_STYLE', nextConfig.apiStyle],
    ['LLM_MODEL', nextConfig.model],
    ['LLM_API_KEY', nextConfig.clearApiKey ? null : (nextConfig.apiKey || currentRuntimeConfig.apiKey || null)]
  ]);
}

function updateEnvFileContent(rawContent, managedValues) {
  const lines = rawContent === '' ? [] : rawContent.split('\n');
  const seen = new Set();
  const updatedLines = lines.map((line) => {
    const match = line.match(ENV_LINE_RX);
    if (!match) return line;
    const key = match[1];
    if (!managedValues.has(key)) return line;
    seen.add(key);
    const nextValue = managedValues.get(key);
    return nextValue == null ? null : `${key}=${nextValue}`;
  }).filter((line) => line !== null);

  for (const key of MANAGED_ENV_KEYS) {
    if (seen.has(key)) continue;
    const value = managedValues.get(key);
    if (value == null) continue;
    updatedLines.push(`${key}=${value}`);
  }

  const nextContent = updatedLines.join('\n');
  return nextContent ? `${nextContent}\n` : '';
}

export async function writeLocalAiConfigFile(envFilePath, currentRuntimeConfig, nextConfig) {
  const managedValues = buildManagedEnvMap(currentRuntimeConfig, nextConfig);
  let existing = '';
  try {
    existing = await fs.readFile(envFilePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const nextContent = updateEnvFileContent(existing, managedValues);
  await fs.mkdir(path.dirname(envFilePath), { recursive: true });
  const tempPath = path.join(path.dirname(envFilePath), `.env.tmp-${process.pid}-${randomUUID()}`);
  await fs.writeFile(tempPath, nextContent, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await fs.chmod(tempPath, 0o600);
  await fs.rename(tempPath, envFilePath);
  await fs.chmod(envFilePath, 0o600);
}

function applyManagedEnvToProcess(currentRuntimeConfig, nextConfig, env = process.env) {
  env.LLM_BASE_URL = nextConfig.baseUrl;
  env.LLM_API_STYLE = nextConfig.apiStyle;
  env.LLM_MODEL = nextConfig.model;
  if (nextConfig.clearApiKey) {
    delete env.LLM_API_KEY;
  } else {
    env.LLM_API_KEY = nextConfig.apiKey || currentRuntimeConfig.apiKey || '';
  }
}

export async function saveLocalAiConfig({
  request,
  runtimeConfig,
  payload,
  envFilePath,
  env = process.env
}) {
  ensureLocalConfigRuntime(runtimeConfig, env);
  ensureLoopbackRequest(request);
  if (runtimeConfig.authRequired) {
    const header = request.headers.authorization || '';
    if (!header.startsWith('Bearer ') || header.slice(7) !== runtimeConfig.appAccessToken) {
      throw new HttpError(401, 'Missing or invalid bearer token.');
    }
  }
  ensureJsonRequest(request);
  ensureSameOrigin(request);

  const nextConfig = validateLocalConfigPayload(payload, runtimeConfig, env);
  await writeLocalAiConfigFile(envFilePath, runtimeConfig, nextConfig);
  applyManagedEnvToProcess(runtimeConfig, nextConfig, env);
  const refreshed = loadRuntimeConfig(buildRuntimeEnvSnapshot(runtimeConfig, env));
  Object.assign(runtimeConfig, refreshed);

  return {
    ...getPublicAiConfig(runtimeConfig),
    hasApiKey: runtimeConfig.configured,
    localConfigWritable: true
  };
}

export function getPublicAiConfigForRequest(runtimeConfig, request, env = process.env) {
  let localConfigWritable = false;
  try {
    ensureLocalConfigRuntime(runtimeConfig, env);
    ensureLoopbackRequest(request);
    localConfigWritable = true;
  } catch {
    localConfigWritable = false;
  }

  const publicConfig = {
    ...getPublicAiConfig(runtimeConfig),
    hasApiKey: runtimeConfig.configured,
    localConfigWritable
  };
  if (!localConfigWritable) delete publicConfig.baseUrl;
  return publicConfig;
}

export { LOCAL_CONFIG_METHODS };
