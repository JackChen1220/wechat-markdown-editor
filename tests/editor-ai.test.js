const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAiLocalConfigPayload,
  buildDocumentPayload,
  countAiSourceChars,
  normalizeDocument,
  parseAiConfig,
  shouldConfirmAiOverwrite
} = require('../app/editor-app.js');

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
    lastGeneratedMarkdown: '# 标题'
  });

  assert.equal(payload.version, 3);
  assert.equal(payload.rawContent, '原始资料');
  assert.equal(payload.editorMode, 'raw');
  assert.equal(payload.markdown, '# 标题');
  assert.equal(payload.themeId, 'moyu-green');
  assert.equal(payload.appendSignature, false);
  assert.equal(payload.lastGeneratedMarkdown, '# 标题');
  assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
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
    authRequired: true
  });
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
