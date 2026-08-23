import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID
} from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HttpError, getPublicAiConfig, loadRuntimeConfig } from './ai-layout.mjs';
import {
  activeProviderRuntime,
  createDefaultProviderState,
  normalizeProviderConsolePayload,
  publicProviderState,
  validatePersistedProviderState
} from './model-providers.mjs';

const LOCAL_CONFIG_METHODS = 'GET, HEAD, PUT';
const MODEL_NAME_RX = /^[A-Za-z0-9._:/-]{1,200}$/;
const API_KEY_MAX_LENGTH = 4096;
const ENCRYPTED_FILE_VERSION = 1;
const ENCRYPTION_AAD = Buffer.from('wechat-markdown-editor:ai-config:v1');

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
  if (rawValue == null) return null;
  if (typeof rawValue !== 'string') {
    throw new HttpError(400, 'apiKey must be a string when provided.');
  }
  const value = rawValue.trim();
  ensureSingleLineValue(value, 'apiKey');
  if (value.length > API_KEY_MAX_LENGTH) {
    throw new HttpError(400, `apiKey must be at most ${API_KEY_MAX_LENGTH} characters.`);
  }
  return value;
}

function buildRuntimeEnvSnapshot(runtimeConfig, overrides = {}) {
  return {
    LLM_BASE_URL: overrides.baseUrl ?? runtimeConfig.baseUrl,
    LLM_API_FORMAT: overrides.apiFormat ?? runtimeConfig.apiFormat ?? 'openai',
    LLM_API_STYLE: overrides.apiStyle ?? runtimeConfig.apiStyle,
    LLM_MODEL: overrides.model ?? runtimeConfig.model,
    LLM_API_KEY: overrides.apiKey ?? runtimeConfig.apiKey,
    LLM_TIMEOUT_MS: String(runtimeConfig.timeoutMs),
    MAX_SOURCE_CHARS: String(runtimeConfig.maxSourceChars),
    HOST: runtimeConfig.host,
    PORT: String(runtimeConfig.port || 3000)
  };
}

export function validateLocalConfigPayload(payload, runtimeConfig) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const baseUrl = typeof payload.baseUrl === 'string' ? normalizeConfigBaseUrl(payload.baseUrl) : '';
  const apiStyle = typeof payload.apiStyle === 'string' ? payload.apiStyle.trim() : '';
  const model = typeof payload.model === 'string' ? normalizeModelName(payload.model) : '';
  const clearApiKey = payload.clearApiKey === true;
  const submittedApiKey = normalizeConfigApiKey(payload.apiKey);

  if (!baseUrl) throw new HttpError(400, 'baseUrl must be a non-empty string.');
  if (!apiStyle) throw new HttpError(400, 'apiStyle must be a non-empty string.');
  if (!model) throw new HttpError(400, 'model must be a non-empty string.');
  if (payload.clearApiKey != null && typeof payload.clearApiKey !== 'boolean') {
    throw new HttpError(400, 'clearApiKey must be a boolean when provided.');
  }
  if (clearApiKey && submittedApiKey) {
    throw new HttpError(400, 'apiKey cannot be provided when clearApiKey is true.');
  }

  const apiKey = clearApiKey
    ? ''
    : (submittedApiKey || runtimeConfig.apiKey || '');
  const loaded = loadRuntimeConfig(buildRuntimeEnvSnapshot(runtimeConfig, {
    baseUrl,
    apiStyle,
    model,
    apiKey
  }));

  return {
    baseUrl: loaded.baseUrl,
    apiStyle: loaded.apiStyle,
    model: loaded.model,
    apiKey,
    clearApiKey
  };
}

function decodeEncryptionKey(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  let decoded;
  if (/^[a-f0-9]{64}$/i.test(value)) {
    decoded = Buffer.from(value, 'hex');
  } else {
    decoded = Buffer.from(value, 'base64');
  }
  if (decoded.length !== 32) {
    throw new HttpError(500, 'CONFIG_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return decoded;
}

async function readDevelopmentKeyFile(keyFilePath) {
  try {
    const raw = await fs.readFile(keyFilePath, 'utf8');
    const key = decodeEncryptionKey(raw);
    if (!key) throw new Error('empty key file');
    await fs.chmod(keyFilePath, 0o600);
    return key;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new HttpError(500, 'Unable to load the local config encryption key.', { expose: false });
    }
  }

  await fs.mkdir(path.dirname(keyFilePath), { recursive: true, mode: 0o700 });
  const generated = randomBytes(32);
  try {
    await fs.writeFile(keyFilePath, `${generated.toString('base64')}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
    await fs.chmod(keyFilePath, 0o600);
    return generated;
  } catch (error) {
    if (error?.code === 'EEXIST') return await readDevelopmentKeyFile(keyFilePath);
    throw new HttpError(500, 'Unable to create the local config encryption key.', { expose: false });
  }
}

export async function loadConfigEncryptionKey({ env = process.env, keyFilePath }) {
  const fromEnvironment = decodeEncryptionKey(env.CONFIG_ENCRYPTION_KEY);
  if (fromEnvironment) return fromEnvironment;
  if (String(env.NODE_ENV || '').trim() === 'production') {
    throw new HttpError(500, 'CONFIG_ENCRYPTION_KEY is required when NODE_ENV=production.');
  }
  return await readDevelopmentKeyFile(keyFilePath);
}

function encryptConfig(config, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(ENCRYPTION_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(config), 'utf8'),
    cipher.final()
  ]);
  return {
    version: ENCRYPTED_FILE_VERSION,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptConfig(envelope, key) {
  if (
    !envelope ||
    envelope.version !== ENCRYPTED_FILE_VERSION ||
    envelope.algorithm !== 'aes-256-gcm' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('invalid encrypted envelope');
  }

  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('invalid encrypted envelope');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(ENCRYPTION_AAD);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

async function writeAtomic(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.chmod(tempPath, 0o600);
    await fs.rename(tempPath, filePath);
    await fs.chmod(filePath, 0o600);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function applyProviderState(runtimeConfig, state) {
  const config = activeProviderRuntime(state);
  const refreshed = loadRuntimeConfig(buildRuntimeEnvSnapshot(runtimeConfig, config));
  Object.assign(runtimeConfig, refreshed, {
    apiKey: config.apiKey,
    apiFormat: config.apiFormat,
    providerId: config.providerId,
    configured: config.configured,
    authRequired: false,
    localConfigWritable: true
  });
}

export class EncryptedAiConfigStore {
  constructor({ runtimeConfig, env = process.env, rootDir = process.cwd(), dataDir, filePath, keyFilePath } = {}) {
    this.runtimeConfig = runtimeConfig;
    this.env = env;
    this.dataDir = dataDir || env.DATA_DIR || path.join(rootDir, 'data');
    this.filePath = filePath || env.AI_CONFIG_FILE || path.join(this.dataDir, 'ai-config.enc.json');
    this.keyFilePath = keyFilePath || env.CONFIG_ENCRYPTION_KEY_FILE || path.join(this.dataDir, 'config.key');
    this.key = null;
    this.state = createDefaultProviderState(runtimeConfig);
    this.initialized = false;
    this.initialization = null;
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    if (this.initialized) return;
    if (this.initialization) return await this.initialization;
    this.initialization = this.#initializeInternal();
    return await this.initialization;
  }

  async #initializeInternal() {
    this.key = await loadConfigEncryptionKey({ env: this.env, keyFilePath: this.keyFilePath });
    let raw;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.initialized = true;
        this.runtimeConfig.authRequired = false;
        this.runtimeConfig.localConfigWritable = true;
        applyProviderState(this.runtimeConfig, this.state);
        return;
      }
      throw new HttpError(500, 'Unable to load AI configuration.', { expose: false });
    }

    try {
      this.state = validatePersistedProviderState(
        decryptConfig(JSON.parse(raw), this.key),
        this.runtimeConfig,
        this.env
      );
      applyProviderState(this.runtimeConfig, this.state);
      this.initialized = true;
    } catch {
      throw new HttpError(500, 'Encrypted AI configuration failed integrity validation.', { expose: false });
    }
  }

  getPublicConfig() {
    if (!this.initialized) throw new HttpError(503, 'AI configuration is not ready.');
    return publicProviderState(this.state, this.runtimeConfig);
  }

  getProviderState() {
    if (!this.initialized) throw new HttpError(503, 'AI configuration is not ready.');
    return this.state;
  }

  async save(payload) {
    await this.initialize();
    const operation = async () => {
      const next = normalizeProviderConsolePayload(payload, this.state, this.env);
      const envelope = encryptConfig(next, this.key);
      await writeAtomic(this.filePath, `${JSON.stringify(envelope)}\n`);
      this.state = next;
      applyProviderState(this.runtimeConfig, next);
      return this.getPublicConfig();
    };
    this.writeQueue = this.writeQueue.then(operation, operation);
    return await this.writeQueue;
  }
}

export function createEncryptedAiConfigStore(options) {
  return new EncryptedAiConfigStore(options);
}

export function getPublicAiConfigForRequest(runtimeConfig) {
  return {
    ...getPublicAiConfig(runtimeConfig),
    configured: Boolean(runtimeConfig.apiKey),
    hasApiKey: Boolean(runtimeConfig.apiKey),
    localConfigWritable: true,
    authRequired: false
  };
}

export { LOCAL_CONFIG_METHODS };
