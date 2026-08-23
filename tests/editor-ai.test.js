const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildAiLocalConfigPayload,
  buildDocumentPayload,
  buildProviderConfigPayload,
  countAiSourceChars,
  normalizeDocument,
  parseAiConfig,
  shouldConfirmAiOverwrite
} = require('../app/editor-app.js');

test('browser UI is login-free and opens AI model configuration directly', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  assert.equal(/<summary[^>]*>AI 模型<\/summary>/.test(htmlSource), true);
  assert.equal(/id="ai-local-config-section"/.test(htmlSource), true);
  assert.equal(/id="ai-local-config-section"[^>]*\shidden(?:\s|>)/.test(htmlSource), false);
  assert.equal(/admin-(?:login|password|logout|session)|管理员登录|退出登录/.test(htmlSource), false);
  assert.equal(/\/api\/auth\/|parseAuthSession|buildSessionHeaders|csrfToken|X-CSRF-Token|state\.auth|loginAdmin|logoutAdmin|handleUnauthorized/.test(appSource), false);
  assert.equal(/\/api\/ai\/config/.test(appSource), true);
});

test('configured provider key is never refilled and uses only a dotted placeholder', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const keyInput = htmlSource.match(/<input[^>]+id="ai-provider-key-input"[^>]*>/)?.[0] || '';
  const valueAssignments = [...appSource.matchAll(/aiProviderKeyInput\.value\s*=\s*([^;]+);/g)]
    .map((match) => match[1].trim());

  assert.ok(keyInput, 'the AI provider key field must remain available');
  assert.match(keyInput, /type="password"/);
  assert.doesNotMatch(keyInput, /\svalue=/);
  assert.ok(valueAssignments.length > 0, 'the key field should be cleared when provider state is rendered');
  valueAssignments.forEach((expression) => assert.match(expression, /^(['"])\1$/));
  assert.equal(/aiProviderKeyInput\.placeholder\s*=/.test(appSource), true);
  assert.equal(/[•●·]{8,}/.test(appSource), true);
  assert.equal(/hasApiKey/.test(appSource), true);
});

test('countAiSourceChars matches the server Unicode and trim semantics', () => {
  assert.equal(countAiSourceChars('  正文  '), 2);
  assert.equal(countAiSourceChars('😀😀'), 2);
  assert.equal(countAiSourceChars('  😀 正文\n'), 4);
});

test('buildDocumentPayload stores raw content, editor mode, markdown, and AI baseline', () => {
  const payload = buildDocumentPayload({
    rawContent: '原始资料',
    editorMode: 'raw',
    markdown: '# 标题',
    themeId: 'moyu-green',
    author: 'Alice',
    bio: 'Bio',
    autoToc: true,
    appendSignature: false,
    lastGeneratedMarkdown: '# 标题',
    apiKey: 'must-never-enter-document-storage'
  });

  assert.equal(payload.version, 3);
  assert.equal(payload.rawContent, '原始资料');
  assert.equal(payload.editorMode, 'raw');
  assert.equal(payload.markdown, '# 标题');
  assert.equal(payload.themeId, 'moyu-green');
  assert.equal(payload.appendSignature, false);
  assert.equal(payload.lastGeneratedMarkdown, '# 标题');
  assert.equal('apiKey' in payload, false);
  assert.doesNotMatch(JSON.stringify(payload), /must-never-enter-document-storage/);
  assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('browser localStorage writes contain documents and preferences but never AI configuration or keys', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const storageWrites = [...appSource.matchAll(/localStorage\.setItem\(([\s\S]*?)\);/g)]
    .map((match) => match[0]);

  assert.ok(storageWrites.length > 0, 'document autosave should continue using localStorage');
  storageWrites.forEach((write) => {
    assert.doesNotMatch(write, /apiKey|aiConfig|providerConfig|modelConfig/i);
  });
});

test('normalizeDocument keeps v2 documents compatible while defaulting new fields', () => {
  const normalized = normalizeDocument(
    {
      version: 2,
      markdown: '旧版内容',
      themeId: 'blue',
      author: 'Bob',
      autoToc: false
    },
    {
      rawContent: '',
      editorMode: 'markdown',
      markdown: '默认内容',
      themeId: 'green',
      author: '',
      bio: '',
      autoToc: true,
      appendSignature: true
    }
  );

  assert.equal(normalized.version, 2);
  assert.equal(normalized.markdown, '旧版内容');
  assert.equal(normalized.rawContent, '');
  assert.equal(normalized.editorMode, 'markdown');
  assert.equal(normalized.themeId, 'blue');
  assert.equal(normalized.author, 'Bob');
  assert.equal(normalized.autoToc, false);
  assert.equal(normalized.appendSignature, true);
});

test('parseAiConfig sanitizes server values', () => {
  assert.equal(parseAiConfig(null).apiStyle, 'responses');

  const config = parseAiConfig({
    configured: 1,
    hasApiKey: 'yes',
    localConfigWritable: 1,
    baseUrl: 'https://api.example.com/v1',
    apiStyle: 'chat-completions',
    model: 'gpt-5.6',
    maxSourceChars: '3200',
    authRequired: 'yes'
  });

  assert.deepEqual(config, {
    configured: true,
    hasApiKey: true,
    localConfigWritable: true,
    baseUrl: 'https://api.example.com/v1',
    apiStyle: 'chat-completions',
    model: 'gpt-5.6',
    maxSourceChars: 3200,
    authRequired: false,
    activeRoute: {
      providerId: 'custom',
      modelId: 'gpt-5.6'
    },
    providers: [{
      id: 'custom',
      name: '自定义',
      builtIn: false,
      enabled: true,
      baseUrl: 'https://api.example.com/v1',
      apiFormat: 'openai',
      allowedApiFormats: ['openai'],
      baseUrlByFormat: {},
      apiStyle: 'chat-completions',
      models: [{ id: 'gpt-5.6', name: 'gpt-5.6' }],
      defaultModel: 'gpt-5.6',
      hasApiKey: true
    }]
  });
});

test('parseAiConfig keeps sanitized providers and never returns API keys', () => {
  const config = parseAiConfig({
    configured: true,
    localConfigWritable: true,
    activeRoute: { providerId: 'deepseek', modelId: 'deepseek-chat' },
    providers: [{
      id: 'deepseek',
      name: 'DeepSeek',
      builtIn: true,
      enabled: true,
      baseUrl: 'https://api.deepseek.com',
      apiFormat: 'openai',
      allowedApiFormats: ['openai', 'anthropic'],
      baseUrlByFormat: {
        openai: 'https://api.deepseek.com',
        anthropic: 'https://api.deepseek.com/anthropic'
      },
      apiStyle: 'chat-completions',
      apiKey: 'must-not-leak',
      hasApiKey: true,
      models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
      defaultModel: 'deepseek-chat'
    }]
  });

  assert.equal(config.activeRoute.providerId, 'deepseek');
  assert.equal(config.activeRoute.modelId, 'deepseek-chat');
  assert.equal(config.providers[0].hasApiKey, true);
  assert.deepEqual(config.providers[0].allowedApiFormats, ['openai', 'anthropic']);
  assert.equal(config.providers[0].baseUrlByFormat.anthropic, 'https://api.deepseek.com/anthropic');
  assert.equal('apiKey' in config.providers[0], false);
  assert.equal(config.model, 'deepseek-chat');
});

test('buildProviderConfigPayload supports keep, replace, and clear key semantics', () => {
  const snapshot = {
    activeRoute: { providerId: 'deepseek', modelId: 'deepseek-chat' },
    selectedProviderId: 'deepseek',
    providers: [{
      id: 'deepseek',
      enabled: true,
      baseUrl: ' https://api.deepseek.com ',
      apiFormat: 'openai',
      apiStyle: 'chat-completions',
      models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
      defaultModel: 'deepseek-chat'
    }, {
      id: 'custom',
      enabled: false,
      baseUrl: '',
      apiFormat: 'openai',
      apiStyle: 'chat-completions',
      models: [],
      defaultModel: ''
    }]
  };

  const kept = buildProviderConfigPayload({ ...snapshot, keyAction: 'keep', apiKey: 'ignored' });
  assert.equal(kept.providers[0].apiKeyAction, 'keep');
  assert.equal(kept.providers.length, 1);
  assert.equal('apiKey' in kept.providers[0], false);
  assert.equal('clearApiKey' in kept.providers[0], false);

  const replaced = buildProviderConfigPayload({ ...snapshot, keyAction: 'replace', apiKey: ' sk-new ' });
  assert.equal(replaced.providers[0].apiKeyAction, 'replace');
  assert.equal(replaced.providers[0].apiKey, 'sk-new');
  assert.equal('clearApiKey' in replaced.providers[0], false);

  const cleared = buildProviderConfigPayload({ ...snapshot, keyAction: 'clear', apiKey: 'ignored' });
  assert.equal(cleared.providers[0].apiKeyAction, 'clear');
  assert.equal('clearApiKey' in cleared.providers[0], false);
  assert.equal('apiKey' in cleared.providers[0], false);
});

test('buildAiLocalConfigPayload omits blank provider key and supports clear action', () => {
  assert.deepEqual(buildAiLocalConfigPayload({
    baseUrl: ' https://api.openai.com/v1 ',
    apiStyle: 'responses',
    model: ' gpt-4.1-mini ',
    apiKey: '   ',
    clearApiKey: false
  }), {
    baseUrl: 'https://api.openai.com/v1',
    apiStyle: 'responses',
    model: 'gpt-4.1-mini',
    clearApiKey: false
  });

  assert.deepEqual(buildAiLocalConfigPayload({
    baseUrl: 'http://localhost:11434/v1',
    apiStyle: 'chat-completions',
    model: 'qwen-plus',
    apiKey: 'sk-local',
    clearApiKey: false
  }), {
    baseUrl: 'http://localhost:11434/v1',
    apiStyle: 'chat-completions',
    model: 'qwen-plus',
    apiKey: 'sk-local',
    clearApiKey: false
  });

  assert.deepEqual(buildAiLocalConfigPayload({
    baseUrl: 'http://localhost:11434/v1',
    apiStyle: 'responses',
    model: 'gpt-4.1-mini',
    apiKey: 'ignored',
    clearApiKey: true
  }), {
    baseUrl: 'http://localhost:11434/v1',
    apiStyle: 'responses',
    model: 'gpt-4.1-mini',
    clearApiKey: true
  });
});

test('shouldConfirmAiOverwrite only warns when an edited AI draft would be replaced', () => {
  assert.equal(shouldConfirmAiOverwrite({
    currentMarkdown: '# 新稿',
    lastGeneratedMarkdown: '# 原稿'
  }), true);

  assert.equal(shouldConfirmAiOverwrite({
    currentMarkdown: '# 原稿',
    lastGeneratedMarkdown: '# 原稿'
  }), false);

  assert.equal(shouldConfirmAiOverwrite({
    currentMarkdown: '# 手写稿',
    lastGeneratedMarkdown: ''
  }), false);
});
