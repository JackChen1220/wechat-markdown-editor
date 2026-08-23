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

test('failed AI config loading resets stale provider state and redraws an empty form', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const start = appSource.indexOf('  async function loadAiConfig()');
  const end = appSource.indexOf('\n  function selectProvider(', start);
  const loadSource = appSource.slice(start, end);

  assert.ok(start >= 0 && end > start, 'loadAiConfig should remain present');
  assert.match(loadSource, /catch \(error\) \{[\s\S]*state\.activeProviderId = 'openai';/);
  assert.match(loadSource, /catch \(error\) \{[\s\S]*state\.aiConfigFormDirty = false;/);
  assert.match(loadSource, /catch \(error\) \{[\s\S]*populateAiLocalConfigFields\(false\);/);
});

test('AI settings move focus inside the dialog at every viewport size and Escape restores the trigger', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const start = appSource.indexOf("    settingsMenu.addEventListener('toggle'");
  const end = appSource.indexOf("    settingsBackdrop.addEventListener('click'", start);
  const toggleSource = appSource.slice(start, end);

  assert.ok(start >= 0 && end > start, 'settings toggle handler should remain present');
  assert.match(appSource, /function focusSettingsDialog\(\)[\s\S]*settingsPopover\.querySelector\([\s\S]*\.focus\(\{ preventScroll: true \}\)/);
  assert.match(toggleSource, /if \(settingsMenu\.open\) \{[\s\S]*focusSettingsDialog\(\);/);
  assert.doesNotMatch(toggleSource, /matchMedia/);
  assert.match(appSource, /event\.key === 'Escape' && settingsMenu\.open[\s\S]*settingsMenu\.open = false;[\s\S]*settingsSummary\.focus\(\);/);
});

test('file protocol keeps editing available while explaining how to start local AI', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const start = appSource.indexOf('  async function loadAiConfig()');
  const end = appSource.indexOf('\n  function selectProvider(', start);
  const loadSource = appSource.slice(start, end);

  assert.match(htmlSource, /id="ai-file-warning"[^>]*hidden[^>]*>[\s\S]*?file:\/\/[\s\S]*?npm start/);
  assert.match(loadSource, /if \(state\.isFileProtocol\) \{[\s\S]*state\.aiConfigLoaded = true;[\s\S]*return;/);
});

test('failed AI generation never writes into the existing Markdown draft', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const start = appSource.indexOf('  async function requestAiLayout()');
  const end = appSource.indexOf('\n  function bindDropdowns()', start);
  const requestSource = appSource.slice(start, end);
  const catchMatch = requestSource.match(/catch \(error\) \{([\s\S]*?)\n    \} finally/);

  assert.ok(start >= 0 && end > start, 'requestAiLayout should remain present');
  assert.ok(catchMatch, 'requestAiLayout should keep explicit failure handling');
  assert.doesNotMatch(catchMatch[1], /input\.value\s*=/);
  assert.match(requestSource, /if \(!response\.ok\) \{[\s\S]*throw new Error/);
});

test('AI layout mode selector is compact, defaults to rewrite, and sends the selected mode', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../app/editor-app.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const modeSelect = htmlSource.match(/<select[^>]+id="ai-layout-mode-select"[^>]*>[\s\S]*?<\/select>/)?.[0] || '';
  const rewriteOption = modeSelect.match(/<option[^>]+value="rewrite"[^>]*>[\s\S]*?<\/option>/)?.[0] || '';
  const faithfulOption = modeSelect.match(/<option[^>]+value="faithful"[^>]*>[\s\S]*?<\/option>/)?.[0] || '';
  const requestStart = appSource.indexOf('  async function requestAiLayout()');
  const requestEnd = appSource.indexOf('\n  function bindDropdowns()', requestStart);
  const requestSource = appSource.slice(requestStart, requestEnd);

  assert.ok(modeSelect, 'raw-content tools should include a compact AI layout mode selector');
  assert.match(rewriteOption, /selected/);
  assert.match(rewriteOption, /公众号改写/);
  assert.match(faithfulOption, /忠实整理/);
  assert.match(appSource, /aiLayoutMode:\s*'rewrite'/);
  assert.match(requestSource, /mode:\s*state\.aiLayoutMode/);
  assert.match(appSource, /aiLayoutModeSelect\.addEventListener\(['"]change['"],[\s\S]{0,500}state\.aiLayoutMode\s*=[\s\S]{0,500}saveNow\(false\)/);
  assert.match(appSource, /aiLayoutModeSelect\.value\s*=\s*state\.aiLayoutMode/);
});

test('countAiSourceChars matches the server Unicode and trim semantics', () => {
  assert.equal(countAiSourceChars('  正文  '), 2);
  assert.equal(countAiSourceChars('😀😀'), 2);
  assert.equal(countAiSourceChars('  😀 正文\n'), 4);
});

test('buildDocumentPayload stores raw content, editor mode, AI layout mode, markdown, and AI baseline', () => {
  const payload = buildDocumentPayload({
    rawContent: '原始资料',
    editorMode: 'raw',
    aiLayoutMode: 'faithful',
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
  assert.equal(payload.aiLayoutMode, 'faithful');
  assert.equal(payload.markdown, '# 标题');
  assert.equal(payload.themeId, 'moyu-green');
  assert.equal(payload.appendSignature, false);
  assert.equal(payload.lastGeneratedMarkdown, '# 标题');
  assert.equal('apiKey' in payload, false);
  assert.doesNotMatch(JSON.stringify(payload), /must-never-enter-document-storage/);
  assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('buildDocumentPayload defaults an omitted or unknown AI layout mode to rewrite', () => {
  assert.equal(buildDocumentPayload({}).aiLayoutMode, 'rewrite');
  assert.equal(buildDocumentPayload({ aiLayoutMode: 'creative' }).aiLayoutMode, 'rewrite');
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
  assert.equal(normalized.aiLayoutMode, 'rewrite');
  assert.equal(normalized.themeId, 'blue');
  assert.equal(normalized.author, 'Bob');
  assert.equal(normalized.autoToc, false);
  assert.equal(normalized.appendSignature, true);
});

test('normalizeDocument restores the saved AI layout mode and excludes model secrets', () => {
  const normalized = normalizeDocument(
    {
      version: 3,
      rawContent: '素材',
      markdown: '# 稿件',
      themeId: 'green',
      aiLayoutMode: 'faithful',
      apiKey: 'must-never-be-restored'
    },
    {
      rawContent: '',
      editorMode: 'markdown',
      aiLayoutMode: 'rewrite',
      markdown: '',
      themeId: 'green'
    }
  );

  assert.equal(normalized.aiLayoutMode, 'faithful');
  assert.equal('apiKey' in normalized, false);
  assert.doesNotMatch(JSON.stringify(normalized), /must-never-be-restored/);
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
    maxSourceChars: '3200'
  });

  assert.deepEqual(config, {
    configured: true,
    hasApiKey: true,
    localConfigWritable: true,
    baseUrl: 'https://api.example.com/v1',
    apiStyle: 'chat-completions',
      model: 'gpt-5.6',
      maxSourceChars: 3200,
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
