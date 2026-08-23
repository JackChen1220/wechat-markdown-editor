import { performance } from 'node:perf_hooks';
import { HttpError } from './ai-layout.mjs';

export const MODEL_PROVIDER_IDS = [
  'openai',
  'deepseek',
  'anthropic',
  'gemini',
  'moonshot',
  'qwen',
  'zhipu',
  'minimax',
  'custom'
];

export const MODEL_API_FORMATS = ['openai', 'anthropic', 'gemini'];
const OPENAI_API_STYLES = ['chat-completions', 'responses'];
const MODEL_ID_RX = /^[A-Za-z0-9._:/-]{1,200}$/;
const MAX_MODELS_PER_PROVIDER = 100;

function builtInModel(id, name, capability = '') {
  return { id, name, capability, editable: false };
}

export const MODEL_PROVIDER_PRESETS = {
  openai: {
    id: 'openai', name: 'OpenAI', apiBase: 'https://api.openai.com/v1', apiFormat: 'openai',
    allowedApiFormats: ['openai'],
    models: [
      builtInModel('gpt-5.5', 'GPT-5.5', 'latest'),
      builtInModel('gpt-5.4', 'GPT-5.4', 'balanced'),
      builtInModel('gpt-5.4-mini', 'GPT-5.4 mini', 'mini'),
      builtInModel('gpt-5.4-nano', 'GPT-5.4 nano', 'low cost')
    ]
  },
  deepseek: {
    id: 'deepseek', name: 'DeepSeek', apiBase: 'https://api.deepseek.com/v1', apiFormat: 'openai',
    allowedApiFormats: ['anthropic', 'openai'],
    apiBaseByFormat: { openai: 'https://api.deepseek.com/v1', anthropic: 'https://api.deepseek.com/anthropic' },
    models: [
      builtInModel('deepseek-v4-flash', 'DeepSeek V4 Flash', '1M context'),
      builtInModel('deepseek-v4-pro', 'DeepSeek V4 Pro', '1M context'),
      builtInModel('deepseek-chat', 'DeepSeek Chat', 'compat alias'),
      builtInModel('deepseek-reasoner', 'DeepSeek Reasoner', 'compat alias')
    ]
  },
  anthropic: {
    id: 'anthropic', name: 'Claude', apiBase: 'https://api.anthropic.com/v1', apiFormat: 'anthropic',
    allowedApiFormats: ['anthropic'],
    models: [
      builtInModel('claude-fable-5', 'Claude Fable 5', 'highest capability'),
      builtInModel('claude-opus-4-8', 'Claude Opus 4.8', 'opus'),
      builtInModel('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'balanced'),
      builtInModel('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'fast')
    ]
  },
  gemini: {
    id: 'gemini', name: 'Google Gemini', apiBase: 'https://generativelanguage.googleapis.com/v1beta', apiFormat: 'gemini',
    allowedApiFormats: ['gemini'],
    models: [
      builtInModel('gemini-3.5-flash', 'Gemini 3.5 Flash', 'stable'),
      builtInModel('gemini-3.1-pro', 'Gemini 3.1 Pro', 'preview'),
      builtInModel('gemini-3-flash', 'Gemini 3 Flash', 'preview'),
      builtInModel('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 'stable'),
      builtInModel('gemini-2.5-pro', 'Gemini 2.5 Pro', 'stable'),
      builtInModel('gemini-2.5-flash', 'Gemini 2.5 Flash', 'stable'),
      builtInModel('gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 'stable')
    ]
  },
  moonshot: {
    id: 'moonshot', name: 'Moonshot', apiBase: 'https://api.moonshot.cn/v1', apiFormat: 'openai',
    allowedApiFormats: ['anthropic', 'openai'],
    apiBaseByFormat: { openai: 'https://api.moonshot.cn/v1', anthropic: 'https://api.moonshot.cn/anthropic' },
    models: [
      builtInModel('kimi-k2.7-code', 'Kimi K2.7 Code', 'coding'),
      builtInModel('kimi-k2.6', 'Kimi K2.6', 'multimodal'),
      builtInModel('kimi-k2.5', 'Kimi K2.5', 'multimodal'),
      builtInModel('kimi-k2-thinking', 'Kimi K2 Thinking', 'reasoning'),
      builtInModel('kimi-k2-thinking-turbo', 'Kimi K2 Thinking Turbo', 'reasoning'),
      builtInModel('moonshot-v1-128k', 'Moonshot V1 128K', 'legacy'),
      builtInModel('moonshot-v1-32k', 'Moonshot V1 32K', 'legacy')
    ]
  },
  qwen: {
    id: 'qwen', name: 'Qwen', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiFormat: 'openai',
    allowedApiFormats: ['anthropic', 'openai'],
    apiBaseByFormat: { openai: 'https://dashscope.aliyuncs.com/compatible-mode/v1', anthropic: 'https://dashscope.aliyuncs.com/apps/anthropic' },
    models: [
      builtInModel('qwen3.7-max', 'Qwen3.7 Max', 'flagship'),
      builtInModel('qwen3.7-max-2026-06-08', 'Qwen3.7 Max 2026-06-08', 'snapshot'),
      builtInModel('qwen3.7-plus', 'Qwen3.7 Plus', 'balanced'),
      builtInModel('qwen3.7-plus-2026-05-26', 'Qwen3.7 Plus 2026-05-26', 'snapshot'),
      builtInModel('qwen3.6-flash', 'Qwen3.6 Flash', 'fast')
    ]
  },
  zhipu: {
    id: 'zhipu', name: 'Zhipu', apiBase: 'https://open.bigmodel.cn/api/paas/v4', apiFormat: 'openai',
    allowedApiFormats: ['anthropic', 'openai'],
    apiBaseByFormat: { openai: 'https://open.bigmodel.cn/api/paas/v4', anthropic: 'https://open.bigmodel.cn/api/anthropic' },
    models: [
      builtInModel('glm-5.1', 'GLM 5.1', 'flagship'),
      builtInModel('glm-5', 'GLM 5', 'agentic'),
      builtInModel('glm-5-turbo', 'GLM 5 Turbo', 'long task'),
      builtInModel('glm-4.7', 'GLM 4.7', 'reasoning'),
      builtInModel('glm-4.7-flashx', 'GLM 4.7 FlashX', 'fast'),
      builtInModel('glm-4.6', 'GLM 4.6', 'long context'),
      builtInModel('glm-4.5-air', 'GLM 4.5 Air', 'cost effective')
    ]
  },
  minimax: {
    id: 'minimax', name: 'MiniMax', apiBase: 'https://api.minimaxi.com/v1', apiFormat: 'openai',
    allowedApiFormats: ['anthropic', 'openai'],
    apiBaseByFormat: { openai: 'https://api.minimaxi.com/v1', anthropic: 'https://api.minimaxi.com/anthropic' },
    models: [
      builtInModel('MiniMax-M3', 'MiniMax M3', '1M context'),
      builtInModel('MiniMax-M2.7', 'MiniMax M2.7', 'agentic'),
      builtInModel('MiniMax-M2.7-highspeed', 'MiniMax M2.7 highspeed', 'fast'),
      builtInModel('MiniMax-M2.5', 'MiniMax M2.5', 'legacy'),
      builtInModel('MiniMax-M2.5-highspeed', 'MiniMax M2.5 highspeed', 'legacy fast')
    ]
  },
  custom: {
    id: 'custom', name: '自定义', apiBase: '', apiFormat: 'openai',
    allowedApiFormats: ['anthropic', 'openai', 'gemini'], models: []
  }
};

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isProviderId(value) {
  return typeof value === 'string' && MODEL_PROVIDER_IDS.includes(value);
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function ensureModelId(value, label = 'model') {
  const normalized = stringValue(value);
  if (!MODEL_ID_RX.test(normalized)) {
    throw new HttpError(400, `${label} must be a valid model identifier.`);
  }
  return normalized;
}

function allowedHostsFromEnv(env) {
  return new Set(String(env.MODEL_PROVIDER_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function presetHosts(providerId) {
  const preset = MODEL_PROVIDER_PRESETS[providerId];
  const urls = [preset.apiBase, ...Object.values(preset.apiBaseByFormat || {})].filter(Boolean);
  return new Set(urls.map((value) => new URL(value).hostname.toLowerCase()));
}

export function normalizeProviderBaseUrl(providerId, rawValue, env = process.env) {
  const value = stringValue(rawValue);
  if (!value) {
    if (providerId === 'custom') return '';
    throw new HttpError(400, `baseUrl is required for provider ${providerId}.`);
  }
  if (/[\r\n\0]/.test(value)) throw new HttpError(400, 'baseUrl must be a single-line string.');

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, 'baseUrl must be a valid URL.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new HttpError(400, 'baseUrl must not contain credentials, query, or hash.');
  }

  const production = String(env.NODE_ENV || '').trim() === 'production';
  const hostname = parsed.hostname.toLowerCase();
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback && !production)) {
    throw new HttpError(400, 'baseUrl must use https; local development may use loopback http.');
  }
  if (production) {
    const envHosts = allowedHostsFromEnv(env);
    const allowed = providerId === 'custom'
      ? envHosts
      : new Set([...presetHosts(providerId), ...envHosts]);
    if (!allowed.has(hostname)) {
      throw new HttpError(400, `baseUrl host is not allowed for provider ${providerId}.`);
    }
  }
  return parsed.toString().replace(/\/+$/, '');
}

function normalizeApiFormat(providerId, value) {
  const preset = MODEL_PROVIDER_PRESETS[providerId];
  const normalized = stringValue(value, preset.apiFormat);
  if (!preset.allowedApiFormats.includes(normalized)) {
    throw new HttpError(400, `apiFormat is not allowed for provider ${providerId}.`);
  }
  return normalized;
}

function normalizeApiStyle(value) {
  const normalized = stringValue(value, 'chat-completions');
  if (!OPENAI_API_STYLES.includes(normalized)) {
    throw new HttpError(400, 'apiStyle must be chat-completions or responses.');
  }
  return normalized;
}

function normalizeModels(providerId, value) {
  const builtIns = MODEL_PROVIDER_PRESETS[providerId].models.map((model) => ({ ...model }));
  if (value == null) return builtIns;
  if (!Array.isArray(value)) throw new HttpError(400, 'models must be an array.');

  const builtInIds = new Set(builtIns.map((model) => model.id));
  const userModels = [];
  for (const item of value) {
    const row = typeof item === 'string' ? { id: item, name: item } : item;
    if (!isRecord(row)) throw new HttpError(400, 'models entries must be strings or objects.');
    const id = ensureModelId(row.id, 'models[].id');
    if (builtInIds.has(id)) continue;
    const name = stringValue(row.name, id).slice(0, 200);
    const capability = stringValue(row.capability).slice(0, 200);
    userModels.push({ id, name, capability, editable: true });
  }
  const deduped = new Map();
  for (const model of [...builtIns, ...userModels]) deduped.set(model.id, model);
  if (deduped.size > MAX_MODELS_PER_PROVIDER) throw new HttpError(400, 'Too many models configured.');
  return [...deduped.values()];
}

export function createDefaultProviderState(runtimeConfig = null) {
  const providers = {};
  for (const id of MODEL_PROVIDER_IDS) {
    const preset = MODEL_PROVIDER_PRESETS[id];
    providers[id] = {
      id,
      name: preset.name,
      builtIn: id !== 'custom',
      enabled: false,
      baseUrl: preset.apiBase,
      apiFormat: preset.apiFormat,
      apiStyle: 'chat-completions',
      apiKey: '',
      models: normalizeModels(id),
      defaultModel: preset.models[0]?.id || ''
    };
  }

  if (runtimeConfig?.apiKey) {
    providers.openai = {
      ...providers.openai,
      enabled: true,
      baseUrl: runtimeConfig.baseUrl,
      apiStyle: runtimeConfig.apiStyle,
      apiKey: runtimeConfig.apiKey,
      defaultModel: runtimeConfig.model
    };
    if (!providers.openai.models.some((model) => model.id === runtimeConfig.model)) {
      providers.openai.models.push({ id: runtimeConfig.model, name: runtimeConfig.model, capability: '', editable: true });
    }
  }

  return {
    version: 2,
    providers,
    activeRoute: {
      providerId: 'openai',
      modelId: runtimeConfig?.model || providers.openai.defaultModel
    }
  };
}

function normalizeApiKeyAction(input) {
  if (input.apiKeyAction != null) {
    if (!['keep', 'replace', 'clear'].includes(input.apiKeyAction)) {
      throw new HttpError(400, 'apiKeyAction must be keep, replace, or clear.');
    }
    return input.apiKeyAction;
  }
  if (input.clearApiKey === true) return 'clear';
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) return 'replace';
  return 'keep';
}

function normalizeApiKey(input, existingKey) {
  const action = normalizeApiKeyAction(input);
  if (action === 'clear') return '';
  if (action === 'keep') return existingKey || '';
  if (typeof input.apiKey !== 'string') throw new HttpError(400, 'apiKey is required when apiKeyAction is replace.');
  const apiKey = input.apiKey.trim();
  if (!apiKey || apiKey.length > 4096 || /[\r\n\0]/.test(apiKey)) {
    throw new HttpError(400, 'apiKey must be a non-empty single-line string up to 4096 characters.');
  }
  return apiKey;
}

function normalizeProviderInput(providerId, input, existing, env) {
  if (!isRecord(input)) throw new HttpError(400, `Provider ${providerId} must be an object.`);
  const apiFormat = normalizeApiFormat(providerId, input.apiFormat ?? existing.apiFormat);
  let requestedBase = input.baseUrl ?? existing.baseUrl;
  if (input.apiFormat && input.apiFormat !== existing.apiFormat && input.baseUrl == null) {
    requestedBase = MODEL_PROVIDER_PRESETS[providerId].apiBaseByFormat?.[apiFormat] || requestedBase;
  }
  const models = input.models == null ? existing.models : normalizeModels(providerId, input.models);
  const submittedDefaultModel = input.defaultModel == null ? null : stringValue(input.defaultModel);
  const defaultModel = submittedDefaultModel == null
    ? existing.defaultModel
    : (submittedDefaultModel ? ensureModelId(submittedDefaultModel, 'defaultModel') : '');
  if (defaultModel && !models.some((model) => model.id === defaultModel)) {
    throw new HttpError(400, `defaultModel is not configured for provider ${providerId}.`);
  }

  return {
    ...existing,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : existing.enabled,
    baseUrl: normalizeProviderBaseUrl(providerId, requestedBase, env),
    apiFormat,
    apiStyle: normalizeApiStyle(input.apiStyle ?? existing.apiStyle),
    apiKey: normalizeApiKey(input, existing.apiKey),
    models,
    defaultModel
  };
}

export function normalizeProviderConsolePayload(payload, currentState, env = process.env) {
  if (!isRecord(payload)) throw new HttpError(400, 'Request body must be a JSON object.');
  const next = structuredClone(currentState || createDefaultProviderState());

  if (Array.isArray(payload.providers)) {
    const seen = new Set();
    for (const input of payload.providers) {
      if (!isRecord(input) || !isProviderId(input.id)) throw new HttpError(400, 'providers[].id is invalid.');
      if (seen.has(input.id)) throw new HttpError(400, `Provider ${input.id} is duplicated.`);
      seen.add(input.id);
      next.providers[input.id] = normalizeProviderInput(input.id, input, next.providers[input.id], env);
    }
  } else if ('baseUrl' in payload || 'model' in payload || 'apiKey' in payload || 'clearApiKey' in payload) {
    const id = next.activeRoute.providerId || 'openai';
    const existing = next.providers[id];
    const model = ensureModelId(payload.model, 'model');
    const models = existing.models.some((item) => item.id === model)
      ? existing.models
      : [...existing.models, { id: model, name: model, capability: '', editable: true }];
    next.providers[id] = normalizeProviderInput(id, {
      enabled: true,
      baseUrl: payload.baseUrl,
      apiFormat: existing.apiFormat,
      apiStyle: payload.apiStyle,
      apiKey: payload.apiKey,
      clearApiKey: payload.clearApiKey,
      models,
      defaultModel: model
    }, existing, env);
    next.activeRoute = { providerId: id, modelId: model };
  } else if (!Array.isArray(payload.providers)) {
    throw new HttpError(400, 'providers must be an array.');
  }

  if (payload.activeRoute != null) {
    if (!isRecord(payload.activeRoute) || !isProviderId(payload.activeRoute.providerId)) {
      throw new HttpError(400, 'activeRoute.providerId is invalid.');
    }
    const modelId = ensureModelId(payload.activeRoute.modelId, 'activeRoute.modelId');
    next.activeRoute = { providerId: payload.activeRoute.providerId, modelId };
  }

  const active = next.providers[next.activeRoute.providerId];
  if (!active.enabled) throw new HttpError(400, 'The active provider must be enabled.');
  if (!active.baseUrl) throw new HttpError(400, 'The active provider must have a baseUrl.');
  if (!active.apiKey) throw new HttpError(400, 'The active provider must have an API key.');
  if (!active.models.some((model) => model.id === next.activeRoute.modelId)) {
    throw new HttpError(400, 'The active model is not configured for the active provider.');
  }
  return next;
}

export function validatePersistedProviderState(value, runtimeConfig, env = process.env) {
  if (!isRecord(value)) throw new Error('invalid provider state');
  if (value.version === 1 && isRecord(value.active)) {
    const migrated = createDefaultProviderState(runtimeConfig);
    return normalizeProviderConsolePayload({
      baseUrl: value.active.baseUrl,
      apiStyle: value.active.apiStyle,
      model: value.active.model,
      apiKey: value.active.apiKey
    }, migrated, env);
  }
  if (value.version !== 2 || !isRecord(value.providers) || !isRecord(value.activeRoute)) {
    throw new Error('invalid provider state');
  }
  const base = createDefaultProviderState();
  const providerRows = MODEL_PROVIDER_IDS.map((id) => {
    const provider = value.providers[id];
    if (!isRecord(provider)) throw new Error('invalid provider state');
    return {
      id,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      apiFormat: provider.apiFormat,
      apiStyle: provider.apiStyle,
      apiKeyAction: provider.apiKey ? 'replace' : 'clear',
      ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
      models: provider.models,
      defaultModel: provider.defaultModel
    };
  });
  return normalizeProviderConsolePayload({ providers: providerRows, activeRoute: value.activeRoute }, base, env);
}

export function activeProviderRuntime(state) {
  const provider = state.providers[state.activeRoute.providerId];
  return {
    providerId: provider.id,
    providerName: provider.name,
    apiFormat: provider.apiFormat,
    apiStyle: provider.apiStyle,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: state.activeRoute.modelId,
    configured: Boolean(provider.enabled && provider.baseUrl && provider.apiKey && state.activeRoute.modelId)
  };
}

export function publicProviderState(state, runtimeConfig) {
  const active = activeProviderRuntime(state);
  return {
    configured: active.configured,
    hasApiKey: Boolean(active.apiKey),
    localConfigWritable: true,
    authRequired: false,
    maxSourceChars: runtimeConfig.maxSourceChars,
    baseUrl: active.baseUrl,
    apiStyle: active.apiStyle,
    model: active.model,
    activeRoute: { ...state.activeRoute },
    providers: MODEL_PROVIDER_IDS.map((id) => {
      const provider = state.providers[id];
      return {
        id: provider.id,
        name: provider.name,
        builtIn: provider.builtIn,
        enabled: provider.enabled,
        baseUrl: provider.baseUrl,
        apiFormat: provider.apiFormat,
        apiStyle: provider.apiStyle,
        allowedApiFormats: [...MODEL_PROVIDER_PRESETS[id].allowedApiFormats],
        baseUrlByFormat: { ...(MODEL_PROVIDER_PRESETS[id].apiBaseByFormat || {}) },
        models: provider.models.map((model) => ({ ...model })),
        defaultModel: provider.defaultModel,
        hasApiKey: Boolean(provider.apiKey)
      };
    })
  };
}

function providerHeaders(provider) {
  if (provider.apiFormat === 'anthropic') {
    return { 'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' };
  }
  if (provider.apiFormat === 'gemini') {
    return { 'content-type': 'application/json', 'x-goog-api-key': provider.apiKey };
  }
  return { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` };
}

function anthropicUrl(baseUrl, resource) {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? `${normalized}/${resource}` : `${normalized}/v1/${resource}`;
}

function geminiModelId(value) {
  return String(value || '').replace(/^models\//, '').trim();
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = 20_000) {
  try {
    return await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new HttpError(502, 'Model provider request failed.');
  }
}

function requireProvider(state, providerId) {
  if (!isProviderId(providerId)) throw new HttpError(400, 'providerId is invalid.');
  const provider = state.providers[providerId];
  if (!provider.enabled) throw new HttpError(400, 'Provider is not enabled.');
  if (!provider.apiKey) throw new HttpError(400, 'Provider API key is not configured.');
  if (!provider.baseUrl) throw new HttpError(400, 'Provider baseUrl is not configured.');
  return provider;
}

export async function fetchProviderModels(state, providerId, options = {}) {
  const provider = requireProvider(state, providerId);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let url = provider.apiFormat === 'anthropic'
    ? anthropicUrl(provider.baseUrl, 'models')
    : `${provider.baseUrl}/models`;
  const response = await fetchWithTimeout(fetchImpl, url, { headers: providerHeaders(provider) }, options.timeoutMs);
  if (!response.ok) throw new HttpError(502, `Model provider returned HTTP ${response.status}.`);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new HttpError(502, 'Model provider returned an invalid response.');
  }
  const rows = provider.apiFormat === 'gemini'
    ? (Array.isArray(data.models) ? data.models.filter((item) => !item.supportedGenerationMethods || item.supportedGenerationMethods.includes('generateContent')) : [])
    : (Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []));
  const models = rows.map((item) => {
    const id = provider.apiFormat === 'gemini'
      ? geminiModelId(item.name)
      : stringValue(item.id || item.name);
    return { id, name: stringValue(item.display_name || item.displayName || item.name || item.id, id) };
  }).filter((model) => MODEL_ID_RX.test(model.id)).slice(0, MAX_MODELS_PER_PROVIDER);
  return { providerId, models };
}

export async function testProviderConnection(state, providerId, requestedModelId, options = {}) {
  const provider = requireProvider(state, providerId);
  const modelId = ensureModelId(requestedModelId || provider.defaultModel, 'modelId');
  if (!provider.models.some((model) => model.id === modelId)) {
    throw new HttpError(400, 'modelId is not configured for this provider.');
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const startedAt = performance.now();
  let url;
  let body;
  if (provider.apiFormat === 'gemini') {
    url = `${provider.baseUrl}/models/${encodeURIComponent(geminiModelId(modelId))}:generateContent`;
    body = { contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 16 } };
  } else if (provider.apiFormat === 'anthropic') {
    url = anthropicUrl(provider.baseUrl, 'messages');
    body = { model: modelId, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] };
  } else if (provider.apiStyle === 'responses') {
    url = `${provider.baseUrl}/responses`;
    body = { model: modelId, input: 'ping', max_output_tokens: 16 };
  } else {
    url = `${provider.baseUrl}/chat/completions`;
    body = { model: modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 16 };
  }
  const response = await fetchWithTimeout(fetchImpl, url, {
    method: 'POST',
    headers: providerHeaders(provider),
    body: JSON.stringify(body)
  }, options.timeoutMs);
  if (!response.ok) throw new HttpError(502, `Model provider returned HTTP ${response.status}.`);
  return { ok: true, providerId, modelId, latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
}
