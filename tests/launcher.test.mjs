import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { constants as fsConstants, existsSync } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat
} from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER_PATH = path.join(ROOT_DIR, '启动编辑器.command');
const LAUNCHER_EXISTS = existsSync(LAUNCHER_PATH);
const LAUNCH_TIMEOUT_MS = 15_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'wechat-editor-launcher-'));
  const logDir = path.join(rootDir, 'logs');
  const runtimeDir = path.join(rootDir, 'runtime');
  const dataDir = path.join(rootDir, 'data');
  const configFile = path.join(dataDir, 'ai-config.enc.json');
  const keyFile = path.join(dataDir, 'config.key');
  return {
    rootDir,
    logDir,
    runtimeDir,
    dataDir,
    envFor(port) {
      return {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3000',
        DATA_DIR: dataDir,
        AI_CONFIG_FILE: configFile,
        CONFIG_ENCRYPTION_KEY_FILE: keyFile,
        CONFIG_ENCRYPTION_KEY: '',
        LLM_API_KEY: '',
        WECHAT_EDITOR_PORT: String(port),
        WECHAT_EDITOR_LOG_DIR: logDir,
        WECHAT_EDITOR_RUNTIME_DIR: runtimeDir,
        WECHAT_EDITOR_SKIP_OPEN: '1'
      };
    },
    async cleanup() {
      await rm(rootDir, { recursive: true, force: true });
    }
  };
}

async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function reserveFreePort() {
  const server = createHttpServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

async function runLauncher(env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(LAUNCHER_PATH, [], {
      cwd: tmpdir(),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Launcher did not exit within ${LAUNCH_TIMEOUT_MS}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, LAUNCH_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, output: `${stdout}\n${stderr}` });
    });
  });
}

async function waitForEditor(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (healthResponse.ok) {
        const payload = await healthResponse.json();
        if (payload?.ok === true) {
          const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
          const page = await pageResponse.text();
          if (pageResponse.ok && page.includes('<title>微信公众号 Markdown 编辑器</title>')) return;
        }
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Editor did not become healthy on port ${port}: ${lastError?.message || 'identity check failed'}`);
}

async function readLauncherPid(runtimeDir) {
  const entries = await readdir(runtimeDir, { withFileTypes: true });
  const pidFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.pid'));
  assert.equal(pidFiles.length, 1, 'launcher must create exactly one PID file in the configured runtime directory');
  const pidFile = path.join(runtimeDir, pidFiles[0].name);
  const rawPid = (await readFile(pidFile, 'utf8')).trim();
  assert.match(rawPid, /^\d+$/, 'PID file must contain a numeric process ID');
  const pid = Number.parseInt(rawPid, 10);
  assert.ok(pid > 1, 'PID file must identify a real child process');
  return { pid, pidFile };
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function terminateOwnedProcess(pid) {
  if (!pid || !isProcessAlive(pid)) return;
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return;
    await delay(50);
  }
  if (isProcessAlive(pid)) process.kill(pid, 'SIGKILL');
}

test('macOS launcher exists at the project root', () => {
  assert.equal(
    LAUNCHER_EXISTS,
    true,
    `expected one-click launcher at ${LAUNCHER_PATH}`
  );
});

test('macOS launcher is owner-executable', { skip: !LAUNCHER_EXISTS }, async () => {
  await access(LAUNCHER_PATH, fsConstants.X_OK);
  const fileStat = await stat(LAUNCHER_PATH);
  assert.notEqual(fileStat.mode & 0o100, 0, 'owner executable bit must be set');
});

test('macOS launcher starts with a zsh or bash shebang', { skip: !LAUNCHER_EXISTS }, async () => {
  const firstLine = (await readFile(LAUNCHER_PATH, 'utf8')).split(/\r?\n/, 1)[0];
  assert.match(firstLine, /^#!.*\b(?:zsh|bash)(?:\s|$)/);
});

test('macOS launcher passes zsh syntax validation', { skip: !LAUNCHER_EXISTS }, () => {
  const result = spawnSync('zsh', ['-n', LAUNCHER_PATH], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('launcher starts the real editor on an isolated temporary port', { skip: !LAUNCHER_EXISTS }, async () => {
  const fixture = await makeFixture();
  const port = await reserveFreePort();
  let ownedPid;
  try {
    const result = await runLauncher(fixture.envFor(port));
    assert.equal(result.code, 0, result.output);
    assert.equal(result.signal, null);
    await waitForEditor(port);
    const { pid } = await readLauncherPid(fixture.runtimeDir);
    ownedPid = pid;
    assert.equal(isProcessAlive(pid), true, 'PID file must point to the running editor server');
  } finally {
    await terminateOwnedProcess(ownedPid);
    await fixture.cleanup();
  }
});

test('running the launcher twice reuses the same editor process', { skip: !LAUNCHER_EXISTS }, async () => {
  const fixture = await makeFixture();
  const port = await reserveFreePort();
  let ownedPid;
  try {
    const firstRun = await runLauncher(fixture.envFor(port));
    assert.equal(firstRun.code, 0, firstRun.output);
    await waitForEditor(port);
    const first = await readLauncherPid(fixture.runtimeDir);
    ownedPid = first.pid;

    const secondRun = await runLauncher(fixture.envFor(port));
    assert.equal(secondRun.code, 0, secondRun.output);
    const second = await readLauncherPid(fixture.runtimeDir);

    assert.equal(second.pid, first.pid, 'repeat launch must not replace the listening editor process');
    assert.equal(second.pidFile, first.pidFile, 'repeat launch must reuse the existing PID file');
    assert.equal(isProcessAlive(first.pid), true, 'original editor process must remain alive');
    await waitForEditor(port);
  } finally {
    await terminateOwnedProcess(ownedPid);
    await fixture.cleanup();
  }
});

test('launcher refuses a foreign process occupying the requested port', { skip: !LAUNCHER_EXISTS }, async () => {
  const fixture = await makeFixture();
  const foreignServer = createHttpServer((request, response) => {
    if (request.url === '/api/health') {
      const body = JSON.stringify({ ok: true });
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      });
      response.end(body);
      return;
    }
    const body = '<!doctype html><title>Unrelated local service</title>';
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(body)
    });
    response.end(body);
  });
  const port = await listen(foreignServer);
  try {
    const result = await runLauncher(fixture.envFor(port));
    assert.notEqual(result.code, 0, 'foreign port occupancy must be reported as a launcher failure');
    assert.match(result.output, /(?:端口[^\n]*占用|占用[^\n]*端口)/, '应明确提示端口已被占用');

    assert.equal(foreignServer.listening, true, 'launcher must not terminate the foreign server');
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Unrelated local service/);
  } finally {
    await closeServer(foreignServer);
    await fixture.cleanup();
  }
});
