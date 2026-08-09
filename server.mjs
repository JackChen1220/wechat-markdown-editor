import { createServer as createHttpServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HttpError,
  callLayoutModel,
  loadRuntimeConfig,
  readJsonBody,
  validateLayoutRequest
} from './server/ai-layout.mjs';
import {
  LOCAL_CONFIG_METHODS,
  createEncryptedAiConfigStore
} from './server/local-config.mjs';
import {
  createAdminAuthService,
  ensureJsonRequest,
  ensureSameOrigin,
  validateLoginPayload
} from './server/auth.mjs';
import {
  fetchProviderModels,
  testProviderConnection
} from './server/model-providers.mjs';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '': 'text/plain; charset=utf-8'
};

export function buildStaticAllowlist(rootDir = ROOT_DIR) {
  return new Map([
    ['/', path.join(rootDir, 'index.html')],
    ['/index.html', path.join(rootDir, 'index.html')],
    ['/app/editor-app.js', path.join(rootDir, 'app/editor-app.js')],
    ['/app/gzh-themes.js', path.join(rootDir, 'app/gzh-themes.js')],
    ['/app/gzh-renderer.js', path.join(rootDir, 'app/gzh-renderer.js')],
    ['/vendor/marked/marked.min.js', path.join(rootDir, 'vendor/marked/marked.min.js')],
    ['/LICENSE', path.join(rootDir, 'LICENSE')]
  ]);
}

function writeJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders
  });
  response.end(body);
}

function getErrorPayload(error) {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      body: { error: error.expose === false ? 'Internal server error.' : error.message },
      headers: error.headers || {}
    };
  }
  return {
    statusCode: 500,
    body: { error: 'Internal server error.' },
    headers: {}
  };
}

async function serveStaticFile(request, response, staticAllowlist) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const filePath = staticAllowlist.get(request.url || '');
  if (!filePath) {
    writeJson(response, 404, { error: 'Not found.' });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const body = await fs.readFile(filePath);
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': body.byteLength,
    'cache-control': 'no-store'
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  response.end(body);
}

export function createAppServer(options = {}) {
  const runtimeConfig = options.runtimeConfig || loadRuntimeConfig(options.env || process.env);
  const rootDir = options.rootDir || ROOT_DIR;
  const staticAllowlist = options.staticAllowlist || buildStaticAllowlist(rootDir);
  const fetchImpl = options.fetchImpl;
  const env = options.env || process.env;
  const authService = options.authService || createAdminAuthService(env, options.authOptions);
  const configStore = options.configStore || createEncryptedAiConfigStore({
    runtimeConfig,
    env,
    rootDir,
    dataDir: options.dataDir,
    filePath: options.configFilePath,
    keyFilePath: options.configKeyFilePath
  });
  const ready = Promise.resolve().then(() => configStore.initialize());
  ready.catch(() => {});

  const server = createHttpServer(async (request, response) => {
    try {
      const requestUrl = request.url || '/';

      if (requestUrl === '/api/health') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405, { allow: 'GET, HEAD' });
          response.end();
          return;
        }
        writeJson(response, 200, { ok: true });
        return;
      }

      if (requestUrl === '/api/auth/session') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405, { allow: 'GET, HEAD' });
          response.end();
          return;
        }
        writeJson(response, 200, authService.getSessionStatus(request));
        return;
      }

      if (requestUrl === '/api/auth/login') {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        ensureJsonRequest(request);
        ensureSameOrigin(request, authService.config.publicOrigin);
        const payload = await readJsonBody(request, { maxBytes: 16 * 1024, timeoutMs: 10_000 });
        const result = await authService.login(request, validateLoginPayload(payload));
        writeJson(response, 200, result.payload, { 'set-cookie': result.cookie });
        return;
      }

      if (requestUrl === '/api/auth/logout') {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        const session = authService.requireSession(request);
        ensureSameOrigin(request, authService.config.publicOrigin);
        authService.requireCsrf(request, session);
        const result = authService.logout(request, session);
        writeJson(response, 200, result.payload, { 'set-cookie': result.cookie });
        return;
      }

      if (requestUrl === '/api/ai/config') {
        await ready;
        const session = authService.requireSession(request);
        if (request.method === 'GET' || request.method === 'HEAD') {
          writeJson(response, 200, configStore.getPublicConfig());
          return;
        }
        if (request.method !== 'PUT' && request.method !== 'POST') {
          response.writeHead(405, { allow: LOCAL_CONFIG_METHODS });
          response.end();
          return;
        }
        ensureJsonRequest(request);
        ensureSameOrigin(request, authService.config.publicOrigin);
        authService.requireCsrf(request, session);
        const payload = await readJsonBody(request, { maxBytes: 64 * 1024, timeoutMs: 10_000 });
        const result = await configStore.save(payload);
        writeJson(response, 200, result);
        return;
      }

      if (requestUrl === '/api/ai/providers/models' || requestUrl === '/api/ai/providers/test') {
        await ready;
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        const session = authService.requireSession(request);
        ensureJsonRequest(request);
        ensureSameOrigin(request, authService.config.publicOrigin);
        authService.requireCsrf(request, session);
        const payload = await readJsonBody(request, { maxBytes: 16 * 1024, timeoutMs: 10_000 });
        const result = requestUrl.endsWith('/models')
          ? await fetchProviderModels(configStore.getProviderState(), payload?.providerId, { fetchImpl })
          : await testProviderConnection(configStore.getProviderState(), payload?.providerId, payload?.modelId, { fetchImpl });
        writeJson(response, 200, result);
        return;
      }

      if (requestUrl === '/api/ai/layout') {
        await ready;
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        const session = authService.requireSession(request);
        ensureJsonRequest(request);
        ensureSameOrigin(request, authService.config.publicOrigin);
        authService.requireCsrf(request, session);
        const maxBytes = Math.min(
          Math.max(runtimeConfig.maxSourceChars * 8, 16 * 1024),
          1024 * 1024
        );
        const payload = await readJsonBody(request, {
          maxBytes,
          timeoutMs: Math.min(runtimeConfig.timeoutMs, 15_000)
        });
        const validated = validateLayoutRequest(payload, runtimeConfig.maxSourceChars);
        const result = await callLayoutModel(validated, runtimeConfig, { fetchImpl });
        writeJson(response, 200, result.usage
          ? { markdown: result.markdown, model: result.model, usage: result.usage }
          : { markdown: result.markdown, model: result.model });
        return;
      }

      await serveStaticFile(request, response, staticAllowlist);
    } catch (error) {
      const { statusCode, body, headers } = getErrorPayload(error);
      writeJson(response, statusCode, body, headers);
    }
  });
  server.ready = ready;
  server.authService = authService;
  server.configStore = configStore;
  return server;
}

export async function startServer(options = {}) {
  const server = createAppServer(options);
  const runtimeConfig = options.runtimeConfig || loadRuntimeConfig(options.env || process.env);
  await server.ready;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(runtimeConfig.port, runtimeConfig.host, resolve);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const runtimeConfig = loadRuntimeConfig(process.env);
    const server = await startServer({ runtimeConfig });
    const address = server.address();
    if (address && typeof address === 'object') {
      process.stdout.write(`Server listening on http://${address.address}:${address.port}\n`);
    }
  } catch (error) {
    const { body } = getErrorPayload(error);
    process.stderr.write(`${body.error}\n`);
    process.exitCode = 1;
  }
}
