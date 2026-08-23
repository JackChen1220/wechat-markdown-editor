/*
 * wechat-markdown-editor browser application
 * Copyright (C) 2026 wechat-markdown-editor contributors
 *
 * Includes behavior adapted from gzh-design-skill
 * Copyright (C) 2026 甲木 (Jiamu) × 摸鱼小李 (Moyu Xiaoli)
 * Licensed under AGPL-3.0-or-later. See LICENSE and THIRD_PARTY_NOTICES.md.
 */
(function () {
  'use strict';

  function normalizeEditorMode(value) {
    return value === 'raw' ? 'raw' : 'markdown';
  }

  const AI_PROVIDER_IDS = [
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

  function parseProviderModels(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).flatMap((item) => {
      const id = typeof item === 'string'
        ? item.trim()
        : (item && typeof item.id === 'string' ? item.id.trim() : '');
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const name = item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : id;
      return [{ id, name }];
    });
  }

  function parseProviderConfig(provider) {
    if (!provider || typeof provider !== 'object' || !AI_PROVIDER_IDS.includes(provider.id)) return null;
    const apiFormat = ['anthropic', 'gemini'].includes(provider.apiFormat) ? provider.apiFormat : 'openai';
    const allowedApiFormats = (Array.isArray(provider.allowedApiFormats) ? provider.allowedApiFormats : [apiFormat])
      .filter((format, index, values) => ['openai', 'anthropic', 'gemini'].includes(format) && values.indexOf(format) === index);
    const baseUrlByFormat = {};
    if (provider.baseUrlByFormat && typeof provider.baseUrlByFormat === 'object') {
      allowedApiFormats.forEach((format) => {
        if (typeof provider.baseUrlByFormat[format] === 'string') {
          baseUrlByFormat[format] = provider.baseUrlByFormat[format];
        }
      });
    }
    const defaultModel = typeof provider.defaultModel === 'string' ? provider.defaultModel.trim() : '';
    const models = parseProviderModels(provider.models);
    if (defaultModel && !models.some((model) => model.id === defaultModel)) {
      models.push({ id: defaultModel, name: defaultModel });
    }
    return {
      id: provider.id,
      name: typeof provider.name === 'string' && provider.name.trim() ? provider.name.trim() : provider.id,
      builtIn: provider.builtIn !== false,
      enabled: provider.enabled === true,
      baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
      apiFormat,
      allowedApiFormats: allowedApiFormats.length ? allowedApiFormats : [apiFormat],
      baseUrlByFormat,
      apiStyle: provider.apiStyle === 'responses' ? 'responses' : 'chat-completions',
      models,
      defaultModel,
      hasApiKey: provider.hasApiKey === true
    };
  }

  function parseAiConfig(payload) {
    const config = payload && typeof payload === 'object' ? payload : {};
    const maxSourceChars = Number(config.maxSourceChars);
    let providers = (Array.isArray(config.providers) ? config.providers : [])
      .map(parseProviderConfig)
      .filter(Boolean);

    if (!providers.length && (config.baseUrl || config.model || config.hasApiKey)) {
      providers = [parseProviderConfig({
        id: 'custom',
        name: '自定义',
        builtIn: false,
        enabled: Boolean(config.configured),
        baseUrl: config.baseUrl,
        apiFormat: 'openai',
        apiStyle: config.apiStyle,
        models: config.model ? [config.model] : [],
        defaultModel: config.model,
        hasApiKey: Boolean(config.hasApiKey)
      })].filter(Boolean);
    }

    const requestedProviderId = config.activeRoute && typeof config.activeRoute.providerId === 'string'
      ? config.activeRoute.providerId
      : '';
    const activeProvider = providers.find((provider) => provider.id === requestedProviderId)
      || providers.find((provider) => provider.enabled)
      || providers[0]
      || null;
    const requestedModelId = config.activeRoute && typeof config.activeRoute.modelId === 'string'
      ? config.activeRoute.modelId.trim()
      : '';
    const activeRoute = {
      providerId: activeProvider ? activeProvider.id : '',
      modelId: requestedModelId || (activeProvider ? activeProvider.defaultModel : '')
    };

    return {
      configured: Boolean(config.configured),
      hasApiKey: activeProvider ? activeProvider.hasApiKey : Boolean(config.hasApiKey),
      localConfigWritable: Boolean(config.localConfigWritable),
      baseUrl: activeProvider ? activeProvider.baseUrl : (typeof config.baseUrl === 'string' ? config.baseUrl : ''),
      apiStyle: activeProvider ? activeProvider.apiStyle : (config.apiStyle === 'chat-completions' ? 'chat-completions' : 'responses'),
      model: activeRoute.modelId || (typeof config.model === 'string' ? config.model : ''),
      maxSourceChars: Number.isFinite(maxSourceChars) && maxSourceChars > 0 ? Math.floor(maxSourceChars) : 0,
      activeRoute,
      providers
    };
  }

  function buildAiLocalConfigPayload(snapshot) {
    const payload = {
      baseUrl: typeof snapshot.baseUrl === 'string' ? snapshot.baseUrl.trim() : '',
      apiStyle: snapshot.apiStyle === 'chat-completions' ? 'chat-completions' : 'responses',
      model: typeof snapshot.model === 'string' ? snapshot.model.trim() : '',
      clearApiKey: snapshot.clearApiKey === true
    };
    const apiKey = typeof snapshot.apiKey === 'string' ? snapshot.apiKey.trim() : '';
    if (!payload.clearApiKey && apiKey) payload.apiKey = apiKey;
    return payload;
  }

  function buildProviderConfigPayload(snapshot) {
    const selectedProviderId = typeof snapshot.selectedProviderId === 'string' ? snapshot.selectedProviderId : '';
    const keyAction = ['replace', 'clear'].includes(snapshot.keyAction) ? snapshot.keyAction : 'keep';
    const apiKey = typeof snapshot.apiKey === 'string' ? snapshot.apiKey.trim() : '';
    return {
      activeRoute: {
        providerId: snapshot.activeRoute && typeof snapshot.activeRoute.providerId === 'string'
          ? snapshot.activeRoute.providerId
          : '',
        modelId: snapshot.activeRoute && typeof snapshot.activeRoute.modelId === 'string'
          ? snapshot.activeRoute.modelId.trim()
          : ''
      },
      providers: (Array.isArray(snapshot.providers) ? snapshot.providers : [])
        .filter((provider) => provider.id === selectedProviderId)
        .map((provider) => {
          const entry = {
            id: provider.id,
            enabled: provider.enabled === true,
            baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl.trim() : '',
            apiFormat: ['anthropic', 'gemini'].includes(provider.apiFormat) ? provider.apiFormat : 'openai',
            apiStyle: provider.apiStyle === 'responses' ? 'responses' : 'chat-completions',
            models: parseProviderModels(provider.models),
            defaultModel: typeof provider.defaultModel === 'string' ? provider.defaultModel.trim() : '',
            apiKeyAction: provider.id === selectedProviderId ? keyAction : 'keep'
          };
          if (provider.id === selectedProviderId && keyAction === 'replace' && apiKey) entry.apiKey = apiKey;
          return entry;
        })
    };
  }

  function countAiSourceChars(source) {
    return Array.from(String(source || '').trim()).length;
  }

  function buildDocumentPayload(snapshot) {
    return {
      version: 3,
      rawContent: typeof snapshot.rawContent === 'string' ? snapshot.rawContent : '',
      editorMode: normalizeEditorMode(snapshot.editorMode),
      markdown: typeof snapshot.markdown === 'string' ? snapshot.markdown : '',
      themeId: snapshot.themeId || 'green',
      author: typeof snapshot.author === 'string' ? snapshot.author : '',
      bio: typeof snapshot.bio === 'string' ? snapshot.bio : '',
      autoToc: snapshot.autoToc !== false,
      appendSignature: snapshot.appendSignature !== false,
      lastGeneratedMarkdown: typeof snapshot.lastGeneratedMarkdown === 'string' ? snapshot.lastGeneratedMarkdown : '',
      updatedAt: snapshot.updatedAt || new Date().toISOString()
    };
  }

  function normalizeDocument(saved, defaults) {
    const base = {
      version: 3,
      rawContent: defaults.rawContent || '',
      editorMode: normalizeEditorMode(defaults.editorMode),
      markdown: defaults.markdown || '',
      themeId: defaults.themeId || 'green',
      author: defaults.author || '',
      bio: defaults.bio || '',
      autoToc: defaults.autoToc !== false,
      appendSignature: defaults.appendSignature !== false,
      lastGeneratedMarkdown: ''
    };

    if (!saved || typeof saved !== 'object') return base;

    if (saved.version === 2) {
      return {
        version: 2,
        rawContent: typeof saved.rawContent === 'string' ? saved.rawContent : base.rawContent,
        editorMode: normalizeEditorMode(saved.editorMode || base.editorMode),
        markdown: typeof saved.markdown === 'string' ? saved.markdown : base.markdown,
        themeId: saved.themeId || base.themeId,
        author: saved.author || '',
        bio: saved.bio || '',
        autoToc: saved.autoToc !== false,
        appendSignature: saved.appendSignature !== false,
        lastGeneratedMarkdown: typeof saved.lastGeneratedMarkdown === 'string' ? saved.lastGeneratedMarkdown : ''
      };
    }

    if (saved.version >= 3) {
      return {
        version: saved.version,
        rawContent: typeof saved.rawContent === 'string' ? saved.rawContent : base.rawContent,
        editorMode: normalizeEditorMode(saved.editorMode || base.editorMode),
        markdown: typeof saved.markdown === 'string' ? saved.markdown : base.markdown,
        themeId: saved.themeId || base.themeId,
        author: saved.author || '',
        bio: saved.bio || '',
        autoToc: saved.autoToc !== false,
        appendSignature: saved.appendSignature !== false,
        lastGeneratedMarkdown: typeof saved.lastGeneratedMarkdown === 'string' ? saved.lastGeneratedMarkdown : ''
      };
    }

    return base;
  }

  function shouldConfirmAiOverwrite(snapshot) {
    const currentMarkdown = typeof snapshot.currentMarkdown === 'string' ? snapshot.currentMarkdown.trim() : '';
    const lastGeneratedMarkdown = typeof snapshot.lastGeneratedMarkdown === 'string' ? snapshot.lastGeneratedMarkdown.trim() : '';
    return Boolean(lastGeneratedMarkdown) && Boolean(currentMarkdown) && currentMarkdown !== lastGeneratedMarkdown;
  }

  const editorUtils = {
    buildDocumentPayload,
    buildAiLocalConfigPayload,
    buildProviderConfigPayload,
    countAiSourceChars,
    normalizeDocument,
    normalizeEditorMode,
    parseAiConfig,
    parseProviderModels,
    shouldConfirmAiOverwrite
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = editorUtils;
    return;
  }

  if (!window.marked || !window.GzhThemes || !window.GzhRenderer) {
    const preview = document.getElementById('preview');
    if (preview) {
      const error = document.createElement('div');
      error.className = 'render-error';
      error.textContent = '编辑器依赖加载失败。请确认 vendor/marked 与 app 目录完整。';
      preview.replaceChildren(error);
    }
    return;
  }

  marked.setOptions({ breaks: true, gfm: true });

  const editorPanel = document.querySelector('.editor-panel');
  const input = document.getElementById('markdown-input');
  const rawInput = document.getElementById('raw-input');
  const preview = document.getElementById('preview');
  const copyBtn = document.getElementById('copy-btn');
  const resetBtn = document.getElementById('reset-btn');
  const importBtn = document.getElementById('import-btn');
  const status = document.getElementById('status');
  const settingsMenu = document.getElementById('settings-menu');
  const settingsSummary = settingsMenu.querySelector('summary');
  const settingsPopover = document.getElementById('settings-popover');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  const themeToggle = document.getElementById('theme-toggle');
  const themeMenu = document.getElementById('theme-menu');
  const exportToggle = document.getElementById('export-toggle');
  const exportMenu = document.getElementById('export-menu');
  const validationStatus = document.getElementById('validation-status');
  const previewThemeName = document.getElementById('preview-theme-name');
  const wordCount = document.getElementById('word-count');
  const saveState = document.getElementById('save-state');
  const editorPanelTitle = document.getElementById('editor-panel-title');
  const editorTabs = Array.from(document.querySelectorAll('[data-editor-tab]'));
  const editorPanes = Array.from(document.querySelectorAll('.editor-pane'));
  const mdFileInput = document.getElementById('md-file-input');
  const imgFileInput = document.getElementById('img-file-input');
  const galleryFileInput = document.getElementById('gallery-file-input');
  const heroFileInput = document.getElementById('hero-file-input');
  const aiLayoutBtn = document.getElementById('ai-layout-btn');
  const aiInlineStatus = document.getElementById('ai-inline-status');
  const aiInputHint = document.getElementById('ai-input-hint');
  const aiFileWarning = document.getElementById('ai-file-warning');
  const aiServiceBadge = document.getElementById('ai-service-badge');
  const aiServiceMeta = document.getElementById('ai-service-meta');
  const aiServiceNote = document.getElementById('ai-service-note');
  const aiLocalConfigSection = document.getElementById('ai-local-config-section');
  const aiLocalManagedNote = document.getElementById('ai-local-managed-note');
  const aiProviderTabs = Array.from(document.querySelectorAll('[data-provider-id]'));
  const aiProviderPanel = document.getElementById('ai-provider-panel');
  const aiProviderName = document.getElementById('ai-provider-name');
  const aiProviderKind = document.getElementById('ai-provider-kind');
  const aiProviderEnabled = document.getElementById('ai-provider-enabled');
  const aiApiFormatSelect = document.getElementById('ai-api-format-select');
  const aiApiStyleField = document.getElementById('ai-api-style-field');
  const aiBaseUrlInput = document.getElementById('ai-base-url-input');
  const aiApiStyleSelect = document.getElementById('ai-api-style-select');
  const aiModelSelect = document.getElementById('ai-model-select');
  const aiModelInput = document.getElementById('ai-model-input');
  const aiModelAddBtn = document.getElementById('ai-model-add-btn');
  const aiProviderKeyInput = document.getElementById('ai-provider-key-input');
  const aiProviderKeyStatus = document.getElementById('ai-provider-key-status');
  const aiModelsRefreshBtn = document.getElementById('ai-models-refresh-btn');
  const aiConfigTestBtn = document.getElementById('ai-config-test-btn');
  const aiConfigSaveBtn = document.getElementById('ai-config-save-btn');
  const aiConfigClearKeyBtn = document.getElementById('ai-config-clear-key-btn');
  const aiActiveRouteSelect = document.getElementById('ai-active-route-select');
  const aiLocalConfigHint = document.getElementById('ai-local-config-hint');
  const defaultMarkdownContent = input.value;
  const defaultRawContent = rawInput.value;

  const DOCUMENT_KEY = 'gzh-editor-document-v2';
  const LEGACY_CONTENT_KEY = 'md-content';
  const LEGACY_THEME_KEY = 'editor-theme';
  const DB_NAME = 'gzh-editor-assets';
  const DB_VERSION = 1;
  const STORE_NAME = 'assets';
  const state = {
    themeId: GzhThemes.defaultId || 'green',
    autoToc: true,
    editorMode: 'markdown',
    html: '',
    meta: null,
    validation: { errors: [], warnings: [], leafCount: 0 },
    renderTimer: 0,
    saveTimer: 0,
    imageCounter: 0,
    aiConfig: parseAiConfig(null),
    aiConfigLoaded: false,
    aiConfigError: '',
    aiBusy: false,
    aiConfigSaving: false,
    aiProviderAction: '',
    aiConfigFormDirty: false,
    activeProviderId: 'openai',
    isFileProtocol: window.location.protocol === 'file:',
    lastGeneratedMarkdown: '',
    lastAiModel: '',
    lastAiUsage: null
  };
  const imageStore = new Map();

  const snippets = {
    hero: '\n[HERO]\nBREAKING | 2026.08\n主标题中文 | 主标题英文\n一句话描述\n底部横条文字 | 标签1,标签2\n[/HERO]\n',
    'part-nav': '\n[PART]\n文章导读 👉 滑动查看\n*PART 01 | 第一部分 | 核心看点\nPART 02 | 第二部分 | 核心看点\nPART 03 | 第三部分 | 核心看点\n[/PART]\n',
    h2: '\n## 章节标题\n\n正文内容…\n',
    h3: '\n### 小节标题\n\n',
    divider: '\n---\n',
    case: '\n[CASE]\nCASE | 名称\n#### 案例标题\n内容描述\n[/CASE]\n',
    callout: '\n[CALLOUT]\n提示 | 提示内容描述\n[/CALLOUT]\n',
    quote: '\n> 引用内容\n\n',
    flow: '\n[FLOW]\n步骤一 | 描述\n步骤二 | 描述\n步骤三 | 描述\n[/FLOW]\n',
    feature: '\n[FEATURES]\n标题一 | 描述内容一\n标题二 | 描述内容二\n[/FEATURES]\n',
    summary: '\n[SUMMARY]\n标题一 | 副标题\n标题二 | 副标题\n标题三 | 副标题\n[/SUMMARY]\n',
    end: '\n[END]\nTHANKS FOR READING\n[/END]\n',
    vocab: '\n[VOCAB]\nPhrase | 中文释义\n> Example sentence.\n使用说明和场景描述。\n---\nAnother Phrase | 另一个释义\n> Another example.\n说明文字。\n[/VOCAB]\n',
    refcard: '\n[REFCARD]\n使用场景 | Useful phrase | 中文释义\n---\n另一个场景 | Another phrase | 中文释义\n[/REFCARD]\n',
    video: '\n[VIDEO]\nVIDEO 01 | 视频描述文字\n[/VIDEO]\n'
  };

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function openAssetDb() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        return resolve(null);
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  const assetDb = {
    db: null,
    async init() {
      this.db = await openAssetDb();
      if (!this.db) return false;
      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const rows = await requestResult(tx.objectStore(STORE_NAME).getAll());
        rows.forEach((row) => imageStore.set(row.id, row));
        return true;
      } catch (error) {
        return false;
      }
    },
    async put(asset) {
      imageStore.set(asset.id, asset);
      if (!this.db) return false;
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        await requestResult(tx.objectStore(STORE_NAME).put(asset));
        return true;
      } catch (error) {
        return false;
      }
    },
    async clear() {
      imageStore.clear();
      if (!this.db) return;
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        await requestResult(tx.objectStore(STORE_NAME).clear());
      } catch (error) {}
    }
  };

  function setStatus(message, tone) {
    status.textContent = message;
    status.title = message;
    status.dataset.tone = tone || '';
  }

  function setTone(element, tone) {
    if (!element) return;
    if (tone) {
      element.dataset.tone = tone;
    } else {
      delete element.dataset.tone;
    }
  }

  function getTheme(themeId) {
    return GzhThemes.get(themeId) || GzhThemes.get(GzhThemes.defaultId) || {};
  }

  function getThemeLabel(themeId) {
    const theme = getTheme(themeId);
    return theme.label || theme.name || (theme.meta && theme.meta.label) || themeId;
  }

  function applyTheme(themeId) {
    if (!GzhThemes.get(themeId)) themeId = GzhThemes.defaultId || 'green';
    state.themeId = themeId;
    document.documentElement.setAttribute('data-theme', themeId);
    document.querySelectorAll('.theme-option').forEach((option) => {
      option.classList.toggle('active', option.dataset.theme === themeId);
    });
    const label = getThemeLabel(themeId);
    themeToggle.textContent = label + ' ▾';
    previewThemeName.textContent = label + ' · 微信真实输出';
  }

  function applyEditorMode(mode, options) {
    const nextMode = normalizeEditorMode(mode);
    const shouldFocus = options && options.focus;
    state.editorMode = nextMode;
    editorPanel.dataset.mode = nextMode;
    editorPanelTitle.textContent = nextMode === 'raw' ? '原始内容' : '排版稿';
    editorTabs.forEach((tab) => {
      const active = tab.dataset.editorTab === nextMode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    editorPanes.forEach((pane) => {
      const active = pane.id === `${nextMode}-pane`;
      pane.classList.toggle('is-active', active);
      pane.hidden = !active;
    });
    updateWordCount();
    if (shouldFocus) {
      (nextMode === 'raw' ? rawInput : input).focus();
    }
  }

  function focusEditorTab(nextIndex) {
    const tab = editorTabs[nextIndex];
    if (!tab) return;
    applyEditorMode(tab.dataset.editorTab);
    tab.focus();
  }

  function resolveImage(ref) {
    const asset = imageStore.get(ref);
    return asset ? asset.data : ref;
  }

  function activeTextValue() {
    return state.editorMode === 'raw' ? rawInput.value : input.value;
  }

  function updateWordCount() {
    const source = activeTextValue();
    const compact = state.editorMode === 'raw'
      ? source.replace(/\s/g, '')
      : source
        .replace(/\[[A-Z-]+\]|\[\/[A-Z-]+\]/g, '')
        .replace(/[#>*_`~=|+\-]/g, '')
        .replace(/\s/g, '');
    wordCount.textContent = compact.length.toLocaleString('zh-CN') + ' 字';
  }

  function updateValidation(result) {
    state.validation = result;
    validationStatus.classList.remove('warning', 'error');
    if (result.errors.length) {
      validationStatus.classList.add('error');
      validationStatus.textContent = result.errors.length + ' 个错误';
    } else if (result.warnings.length) {
      validationStatus.classList.add('warning');
      validationStatus.textContent = result.warnings.length + ' 个提醒';
    } else {
      validationStatus.textContent = '完全合规';
    }
    const details = result.errors.concat(result.warnings);
    validationStatus.title = details.length ? details.join('\n') : `span leaf：${result.leafCount} 处`;
  }

  function renderNow() {
    window.clearTimeout(state.renderTimer);
    try {
      const rendered = GzhRenderer.renderWithMeta
        ? GzhRenderer.renderWithMeta(input.value, {
            themeId: state.themeId,
            resolveImage,
            autoToc: state.autoToc,
            appendSignature: false
          })
        : {
            html: GzhRenderer.render(input.value, {
              themeId: state.themeId,
              resolveImage,
              autoToc: state.autoToc,
              appendSignature: false
            }),
            themeId: state.themeId,
            title: '',
            chapterCount: 0
          };
      state.html = rendered.html;
      state.meta = rendered;
      preview.innerHTML = rendered.html;
      updateValidation(GzhRenderer.validate(rendered.html));
      updateWordCount();
      return rendered.html;
    } catch (error) {
      state.html = '';
      state.validation = { errors: [error.message], warnings: [], leafCount: 0 };
      const box = document.createElement('div');
      box.className = 'render-error';
      box.textContent = '渲染失败：' + error.message;
      preview.replaceChildren(box);
      updateValidation(state.validation);
      setStatus('渲染失败', 'error');
      return '';
    }
  }

  function scheduleRender() {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = window.setTimeout(renderNow, 90);
  }

  function documentPayload() {
    return buildDocumentPayload({
      rawContent: rawInput.value,
      editorMode: state.editorMode,
      markdown: input.value,
      themeId: state.themeId,
      author: '',
      bio: '',
      autoToc: state.autoToc,
      appendSignature: false,
      lastGeneratedMarkdown: state.lastGeneratedMarkdown
    });
  }

  function saveNow(showFeedback) {
    window.clearTimeout(state.saveTimer);
    try {
      localStorage.setItem(DOCUMENT_KEY, JSON.stringify(documentPayload()));
      localStorage.setItem(LEGACY_CONTENT_KEY, input.value);
      localStorage.setItem(LEGACY_THEME_KEY, state.themeId);
      saveState.textContent = '已自动保存';
      if (showFeedback) setStatus('内容已保存', 'success');
      return true;
    } catch (error) {
      saveState.textContent = '保存失败';
      setStatus('浏览器存储空间不足，建议立即导出 Markdown', 'error');
      return false;
    }
  }

  function scheduleSave() {
    saveState.textContent = '保存中…';
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => saveNow(false), 650);
  }

  function loadDocument() {
    let saved = null;
    try {
      saved = JSON.parse(readStorage(DOCUMENT_KEY) || 'null');
    } catch (error) {}

    if (saved) {
      const normalized = normalizeDocument(saved, {
        rawContent: defaultRawContent,
        editorMode: 'markdown',
        markdown: defaultMarkdownContent,
        themeId: state.themeId,
        author: '',
        bio: '',
        autoToc: true,
        appendSignature: false
      });
      rawInput.value = normalized.rawContent;
      input.value = normalized.markdown;
      state.themeId = normalized.themeId || state.themeId;
      state.autoToc = normalized.autoToc !== false;
      state.editorMode = normalizeEditorMode(normalized.editorMode);
      state.lastGeneratedMarkdown = normalized.lastGeneratedMarkdown || '';
    } else {
      const legacyContent = readStorage(LEGACY_CONTENT_KEY);
      const legacyTheme = readStorage(LEGACY_THEME_KEY);
      rawInput.value = defaultRawContent;
      if (legacyContent) input.value = legacyContent;
      if (legacyTheme) state.themeId = legacyTheme;
      state.editorMode = 'markdown';
      state.lastGeneratedMarkdown = '';
    }

  }

  function insertAtSelection(text, selectInner) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(text, start, end, 'end');
    if (selectInner) {
      input.selectionStart = start + selectInner.start;
      input.selectionEnd = start + selectInner.end;
    }
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function createAssetId() {
    state.imageCounter += 1;
    if (window.crypto && crypto.randomUUID) return 'img-' + crypto.randomUUID();
    return 'img-' + Date.now().toString(36) + '-' + state.imageCounter.toString(36);
  }

  async function importImage(file) {
    const id = createAssetId();
    const asset = {
      id,
      name: file.name,
      type: file.type,
      data: await readFileAsDataUrl(file),
      updatedAt: new Date().toISOString()
    };
    await assetDb.put(asset);
    return asset;
  }

  async function handleImages(files, asGallery) {
    if (!files.length) return;
    setStatus('正在处理图片…');
    try {
      const assets = await Promise.all(files.map(importImage));
      const markdown = asGallery
        ? '\n[GALLERY]\n' + assets.map((asset) => asset.id).join('\n') + '\n[/GALLERY]\n'
        : '\n' + assets.map((asset) => `![${asset.name.replace(/\.[^.]+$/, '')}](${asset.id})`).join('\n') + '\n';
      insertAtSelection(markdown);
      saveNow(false);
      setStatus(`${assets.length} 张图片已保存到本地素材库`, 'success');
    } catch (error) {
      setStatus('图片导入失败：' + error.message, 'error');
    }
  }

  async function handleHeroImage(file) {
    if (!file) return;
    try {
      const match = input.value.match(/\[HERO\]([\s\S]*?)\[\/HERO\]/);
      if (!match) {
        setStatus('请先插入 HERO 模块', 'warning');
        return;
      }
      const asset = await importImage(file);
      const lines = match[1].trim().split('\n').filter((line) => line.trim());
      if (lines.length >= 6) {
        lines[5] = asset.id;
      } else if (lines.length === 5 && /^(img-|https?:\/\/|data:image\/|\.{0,2}\/|\/)/i.test(lines[4])) {
        lines[4] = asset.id;
      } else {
        lines.push(asset.id);
      }
      const next = '[HERO]\n' + lines.join('\n') + '\n[/HERO]';
      input.value = input.value.replace(match[0], next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setStatus('Hero 配图已更新', 'success');
    } catch (error) {
      setStatus('Hero 配图失败：' + error.message, 'error');
    }
  }

  function safeFileName(value) {
    return (value || '公众号文章')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || '公众号文章';
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function previewDocument(title, canonicalHtml) {
    const safeTitle = String(title || '公众号文章预览').replace(/[<>&"]/g, '');
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title><style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#eef1ee;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#1f2937}
.bar{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:rgba(255,255,255,.94);border-bottom:1px solid #dfe4df;backdrop-filter:blur(12px)}
.bar span{font-size:12px;color:#6b7280}.bar button{border:0;border-radius:8px;padding:9px 16px;background:#059669;color:#fff;font-weight:700;cursor:pointer}
#gzh-content{max-width:677px;margin:28px auto;background:#fff;box-shadow:0 18px 60px rgba(30,45,36,.12)}
@media(max-width:720px){#gzh-content{margin:0}.bar span{display:none}}
</style></head><body><header class="bar"><span>预览内容与复制内容完全一致</span><button id="copy">复制到公众号</button></header>
<main id="gzh-content">${canonicalHtml}</main><script>
document.getElementById('copy').addEventListener('click',function(){var root=document.getElementById('gzh-content');var range=document.createRange();range.selectNodeContents(root);var selection=getSelection();selection.removeAllRanges();selection.addRange(range);var ok=document.execCommand('copy');selection.removeAllRanges();this.textContent=ok?'已复制':'复制失败，请手动全选';});
<\/script></body></html>`;
  }

  function exportCurrent(kind) {
    const html = renderNow();
    if (!html) return;
    const base = safeFileName(state.meta && state.meta.title);
    const themeId = state.themeId;
    if (kind === 'markdown') {
      download(base + '.md', input.value, 'text/markdown;charset=utf-8');
    } else if (kind === 'html') {
      download(`${base}_排版_${themeId}.html`, html, 'text/html;charset=utf-8');
    } else if (kind === 'preview') {
      download(`${base}_排版_${themeId}_预览.html`, previewDocument(base, html), 'text/html;charset=utf-8');
    }
    setStatus('导出完成', 'success');
  }

  async function copyCanonicalHtml() {
    const html = renderNow();
    if (!html) return;
    if (state.validation.errors.length) {
      setStatus('存在合规错误，复制已阻止', 'error');
      validationStatus.focus();
      return;
    }
    const originalLabel = copyBtn.textContent;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([input.value], { type: 'text/plain' })
          })
        ]);
      } else {
        throw new Error('Rich clipboard unavailable');
      }
    } catch (firstError) {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      temp.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none;';
      document.body.appendChild(temp);
      const selection = window.getSelection();
      const range = document.createRange();
      try {
        range.selectNodeContents(temp);
        selection.removeAllRanges();
        selection.addRange(range);
        if (!document.execCommand('copy')) throw new Error('Copy command returned false');
      } catch (fallbackError) {
        setStatus('富文本复制失败，请导出预览页后复制', 'error');
        return;
      } finally {
        selection.removeAllRanges();
        temp.remove();
      }
    }
    copyBtn.textContent = '已复制';
    setStatus(state.validation.warnings.length ? '已复制，建议查看校验提醒' : '可直接粘贴到公众号', state.validation.warnings.length ? 'warning' : 'success');
    window.setTimeout(() => { copyBtn.textContent = originalLabel; }, 1600);
  }

  function apiFetch(path, options) {
    return fetch(path, {
      ...(options || {}),
      headers: {
        ...(options && options.body ? { 'Content-Type': 'application/json' } : {}),
        ...((options && options.headers) || {})
      }
    });
  }

  async function extractErrorMessage(response, fallback) {
    let text = '';
    try {
      text = (await response.text()).trim();
      if (!text) return fallback;
      const data = JSON.parse(text);
      if (data && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
      if (data && typeof data.message === 'string' && data.message.trim()) return data.message.trim();
    } catch (error) {}
    return text || fallback;
  }

  function aiMetaLine() {
    const parts = [];
    if (state.aiConfig.baseUrl) parts.push(state.aiConfig.baseUrl.replace(/^https?:\/\//, ''));
    if (state.aiConfig.apiStyle) parts.push(state.aiConfig.apiStyle);
    if (state.aiConfig.model) parts.push(`模型：${state.aiConfig.model}`);
    if (state.aiConfig.maxSourceChars) parts.push(`上限 ${state.aiConfig.maxSourceChars.toLocaleString('zh-CN')} 字`);
    parts.push(state.aiConfig.hasApiKey ? '已保存供应商密钥' : '未保存供应商密钥');
    parts.push('仅保存在本机');
    return parts.join(' · ');
  }

  function getAiAvailability() {
    const rawValue = rawInput.value.trim();

    if (state.isFileProtocol) {
      return {
        tone: 'warning',
        badge: '需从服务端打开',
        inline: '当前通过 file:// 打开，AI 接口不可用',
        meta: '请先运行 npm start，再打开 http://127.0.0.1:3000',
        note: 'file:// 模式仍可正常编辑，AI 配置和生成需要本地服务。',
        buttonLabel: 'AI 智能排版',
        disabled: true
      };
    }

    if (state.aiBusy) {
      return {
        tone: 'warning',
        badge: '生成中',
        inline: 'AI 正在生成 Markdown…',
        meta: state.lastAiModel ? `最近模型：${state.lastAiModel}` : (state.aiConfig.model ? `模型：${state.aiConfig.model}` : '请稍候'),
        note: '生成完成后会自动切换到排版稿，并沿用现有预览与保存链路。',
        buttonLabel: '生成中…',
        disabled: true
      };
    }

    if (!state.aiConfigLoaded) {
      return {
        tone: '',
        badge: '检测中',
        inline: '正在检测 AI 服务',
        meta: '请求 /api/ai/config 中',
        note: '正在确认模型配置、访问控制与原始内容字数上限。',
        buttonLabel: 'AI 智能排版',
        disabled: true
      };
    }

    if (state.aiConfigError) {
      return {
        tone: 'error',
        badge: '不可用',
        inline: 'AI 服务状态读取失败',
        meta: state.aiConfigError,
        note: '请确认服务端已提供 /api/ai/config，且当前页面可访问该接口。',
        buttonLabel: 'AI 智能排版',
        disabled: true
      };
    }

    if (!state.aiConfig.configured) {
      if (state.aiConfig.localConfigWritable) {
        return {
          tone: 'warning',
          badge: '待配置',
          inline: '先在“AI 模型”里填写大模型配置',
          meta: '需要 Base URL、接口类型、模型名和供应商密钥',
          note: '保存模型配置后，左侧原始内容就可以一键生成 Markdown。',
          buttonLabel: 'AI 智能排版',
          disabled: true
        };
      }
      return {
        tone: 'warning',
        badge: '未配置',
        inline: 'AI 服务尚未完成配置',
        meta: '当前服务不允许从页面修改模型配置',
        note: '模型或供应商密钥未就绪时，编辑器不会尝试生成 Markdown。',
        buttonLabel: 'AI 智能排版',
        disabled: true
      };
    }

    if (!rawValue) {
      return {
        tone: 'success',
        badge: '已配置',
        inline: '先粘贴原始内容',
        meta: aiMetaLine(),
        note: '先贴原始资料，再让 AI 输出公众号 Markdown；最终 HTML 仍由当前渲染链路生成。',
        buttonLabel: 'AI 智能排版',
        disabled: true
      };
    }

    if (state.aiConfig.maxSourceChars && countAiSourceChars(rawInput.value) > state.aiConfig.maxSourceChars) {
      return {
        tone: 'warning',
        badge: '超出上限',
        inline: `原始内容已超过 ${state.aiConfig.maxSourceChars.toLocaleString('zh-CN')} 字`,
        meta: aiMetaLine(),
        note: '请先裁剪原始内容，再发起 AI 智能排版。',
        buttonLabel: 'AI 智能排版',
        disabled: true
      };
    }

    return {
      tone: 'success',
      badge: '已配置',
      inline: state.lastAiModel ? `可生成 · 最近模型 ${state.lastAiModel}` : 'AI 已配置，可以发起生成',
      meta: aiMetaLine(),
      note: 'AI 只负责把原始内容整理为 Markdown，不会直接生成 HTML。',
      buttonLabel: 'AI 智能排版',
      disabled: false
    };
  }

  function syncSettingsPresentation() {
    const mobileOverlay = settingsMenu.open && window.matchMedia('(max-width: 560px)').matches;
    settingsBackdrop.hidden = !mobileOverlay;
    settingsPopover.setAttribute('aria-modal', String(mobileOverlay));
    document.body.classList.toggle('settings-overlay-open', mobileOverlay);
  }

  function focusSettingsDialog() {
    window.requestAnimationFrame(() => {
      const firstInteractive = settingsPopover.querySelector(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (firstInteractive || settingsPopover).focus({ preventScroll: true });
    });
  }

  function getActiveProvider() {
    return state.aiConfig.providers.find((provider) => provider.id === state.activeProviderId) || null;
  }

  function routeValue(route) {
    if (!route || !route.providerId || !route.modelId) return '';
    return `${encodeURIComponent(route.providerId)}:${encodeURIComponent(route.modelId)}`;
  }

  function parseRouteValue(value) {
    const separator = String(value || '').indexOf(':');
    if (separator < 0) return { providerId: '', modelId: '' };
    try {
      return {
        providerId: decodeURIComponent(value.slice(0, separator)),
        modelId: decodeURIComponent(value.slice(separator + 1))
      };
    } catch (error) {
      return { providerId: '', modelId: '' };
    }
  }

  function syncProviderFormToState() {
    const provider = getActiveProvider();
    if (!provider) return;
    provider.enabled = aiProviderEnabled.checked;
    provider.baseUrl = aiBaseUrlInput.value;
    provider.apiFormat = ['anthropic', 'gemini'].includes(aiApiFormatSelect.value)
      ? aiApiFormatSelect.value
      : 'openai';
    provider.apiStyle = aiApiStyleSelect.value === 'responses' ? 'responses' : 'chat-completions';
    provider.defaultModel = aiModelSelect.value || provider.defaultModel;
    const route = parseRouteValue(aiActiveRouteSelect.value);
    if (route.providerId && route.modelId) state.aiConfig.activeRoute = route;
  }

  function populateRouteOptions() {
    const selectedValue = routeValue(state.aiConfig.activeRoute);
    aiActiveRouteSelect.replaceChildren();
    state.aiConfig.providers.forEach((provider) => {
      if (!provider.enabled) return;
      provider.models.forEach((model) => {
        const option = document.createElement('option');
        option.value = routeValue({ providerId: provider.id, modelId: model.id });
        option.textContent = `${provider.name} · ${model.name}${provider.hasApiKey ? '' : '（未配置密钥）'}`;
        aiActiveRouteSelect.appendChild(option);
      });
    });
    if (!aiActiveRouteSelect.options.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '请先启用供应商并添加模型';
      aiActiveRouteSelect.appendChild(option);
    }
    aiActiveRouteSelect.value = selectedValue;
    if (!aiActiveRouteSelect.value && aiActiveRouteSelect.options.length) {
      aiActiveRouteSelect.selectedIndex = 0;
      const fallbackRoute = parseRouteValue(aiActiveRouteSelect.value);
      if (fallbackRoute.providerId) state.aiConfig.activeRoute = fallbackRoute;
    }
  }

  function populateAiLocalConfigFields(force) {
    if (state.aiConfigFormDirty && !force) return;
    const preferredId = state.aiConfig.activeRoute.providerId || state.activeProviderId;
    if (!state.aiConfig.providers.some((provider) => provider.id === state.activeProviderId)) {
      state.activeProviderId = state.aiConfig.providers.some((provider) => provider.id === preferredId)
        ? preferredId
        : (state.aiConfig.providers[0] ? state.aiConfig.providers[0].id : 'openai');
    }
    const provider = getActiveProvider();

    aiProviderTabs.forEach((tab) => {
      const tabProvider = state.aiConfig.providers.find((item) => item.id === tab.dataset.providerId);
      const selected = tab.dataset.providerId === state.activeProviderId;
      tab.disabled = !tabProvider;
      tab.dataset.enabled = String(Boolean(tabProvider && tabProvider.enabled));
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) aiProviderPanel.setAttribute('aria-labelledby', tab.id);
      if (tabProvider) tab.textContent = tabProvider.name;
    });

    if (!provider) {
      aiProviderName.textContent = '暂无供应商配置';
      aiProviderKind.textContent = '请刷新页面或检查服务端配置';
      aiProviderEnabled.checked = false;
      aiBaseUrlInput.value = '';
      aiModelSelect.replaceChildren();
      aiProviderKeyInput.value = '';
      aiProviderKeyInput.placeholder = '请输入供应商 API Key';
      populateRouteOptions();
      state.aiConfigFormDirty = false;
      return;
    }

    aiProviderName.textContent = provider.name;
    aiProviderKind.textContent = provider.builtIn ? '内置供应商' : '自定义供应商';
    aiProviderEnabled.checked = provider.enabled;
    aiBaseUrlInput.value = provider.baseUrl;
    aiApiFormatSelect.replaceChildren();
    const formatLabels = {
      openai: 'OpenAI Compatible',
      anthropic: 'Anthropic',
      gemini: 'Gemini'
    };
    provider.allowedApiFormats.forEach((format) => {
      const option = document.createElement('option');
      option.value = format;
      option.textContent = formatLabels[format] || format;
      aiApiFormatSelect.appendChild(option);
    });
    aiApiFormatSelect.value = provider.apiFormat;
    aiApiStyleSelect.value = provider.apiStyle;
    aiApiStyleField.hidden = provider.apiFormat !== 'openai';
    aiModelSelect.replaceChildren();
    provider.models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      aiModelSelect.appendChild(option);
    });
    if (!provider.models.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '暂无模型，请手动添加或刷新';
      aiModelSelect.appendChild(option);
    }
    aiModelSelect.value = provider.defaultModel;
    aiModelInput.value = '';
    aiProviderKeyInput.value = '';
    aiProviderKeyInput.placeholder = provider.hasApiKey
      ? '••••••••••••••••'
      : '请输入供应商 API Key';
    aiProviderKeyStatus.textContent = provider.hasApiKey ? '已配置' : '未配置';
    setTone(aiProviderKeyStatus, provider.hasApiKey ? 'success' : 'warning');
    populateRouteOptions();
    state.aiConfigFormDirty = false;
  }

  function syncAiLocalConfigControls() {
    const localWritable = !state.isFileProtocol && state.aiConfig.localConfigWritable;
    const provider = getActiveProvider();
    aiLocalConfigSection.hidden = false;
    aiLocalManagedNote.hidden = localWritable;

    aiConfigSaveBtn.disabled = !localWritable || state.aiConfigSaving;
    aiConfigClearKeyBtn.disabled = !localWritable || !provider || !provider.hasApiKey || state.aiConfigSaving;
    aiConfigTestBtn.disabled = !localWritable || Boolean(state.aiProviderAction);
    aiModelsRefreshBtn.disabled = !localWritable || Boolean(state.aiProviderAction);
    aiModelAddBtn.disabled = !localWritable || Boolean(state.aiProviderAction);
    aiProviderEnabled.disabled = !localWritable || state.aiConfigSaving;
    aiApiFormatSelect.disabled = !localWritable || state.aiConfigSaving;
    aiApiStyleSelect.disabled = !localWritable || state.aiConfigSaving;
    aiBaseUrlInput.disabled = !localWritable || state.aiConfigSaving;
    aiModelSelect.disabled = !localWritable || state.aiConfigSaving;
    aiModelInput.disabled = !localWritable || state.aiConfigSaving;
    aiProviderKeyInput.disabled = !localWritable || state.aiConfigSaving;
    aiActiveRouteSelect.disabled = !localWritable || state.aiConfigSaving;

    if (localWritable) {
      delete aiLocalConfigHint.dataset.tone;
      aiLocalConfigHint.textContent = provider && provider.hasApiKey
        ? '密钥已保存在本机。圆点只表示已配置，留空保存会保留原密钥。'
        : '当前供应商还没有密钥。输入后密钥只保存在本机，页面不会读取真实值。';
    } else {
      aiLocalManagedNote.textContent = state.isFileProtocol
        ? '请先运行 npm start，再从 http://127.0.0.1:3000 打开编辑器配置 AI。'
        : '当前本地服务暂不允许修改模型配置。';
    }
  }

  function updateAiUi() {
    const availability = getAiAvailability();
    aiLayoutBtn.textContent = availability.buttonLabel;
    aiLayoutBtn.disabled = availability.disabled;
    aiInlineStatus.textContent = availability.inline;
    setTone(aiInlineStatus, availability.tone);
    aiInputHint.textContent = availability.note;
    aiServiceBadge.textContent = availability.badge;
    setTone(aiServiceBadge, availability.tone);
    aiServiceMeta.textContent = availability.meta;
    aiServiceNote.textContent = availability.note;
    aiFileWarning.hidden = !state.isFileProtocol;
    syncAiLocalConfigControls();
  }

  async function loadAiConfig() {
    state.aiConfigLoaded = false;
    state.aiConfigError = '';
    updateAiUi();

    if (state.isFileProtocol) {
      state.aiConfigLoaded = true;
      updateAiUi();
      return;
    }

    try {
      const response = await apiFetch('/api/ai/config');
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, `AI 服务状态读取失败（HTTP ${response.status}）`));
      }
      state.aiConfig = parseAiConfig(await response.json());
      state.activeProviderId = state.aiConfig.activeRoute.providerId
        || (state.aiConfig.providers[0] ? state.aiConfig.providers[0].id : 'openai');
      state.aiConfigLoaded = true;
      state.aiConfigError = '';
      populateAiLocalConfigFields(false);
    } catch (error) {
      state.aiConfig = parseAiConfig(null);
      state.activeProviderId = 'openai';
      state.aiConfigFormDirty = false;
      state.aiConfigLoaded = true;
      state.aiConfigError = error.message || 'AI 服务状态读取失败';
      populateAiLocalConfigFields(false);
    }
    updateAiUi();
  }

  function selectProvider(providerId, options) {
    const provider = state.aiConfig.providers.find((item) => item.id === providerId);
    if (!provider) return;
    syncProviderFormToState();
    const discardedKey = aiProviderKeyInput.value.trim();
    state.activeProviderId = providerId;
    state.aiConfigFormDirty = false;
    populateAiLocalConfigFields(true);
    syncAiLocalConfigControls();
    if (discardedKey && !(options && options.silent)) {
      aiLocalConfigHint.dataset.tone = 'warning';
      aiLocalConfigHint.textContent = '切换供应商时已丢弃未保存的密钥；请为当前供应商重新填写。';
    }
  }

  function addManualProviderModel() {
    const provider = getActiveProvider();
    const modelId = aiModelInput.value.trim();
    if (!provider || !modelId) {
      aiLocalConfigHint.dataset.tone = 'error';
      aiLocalConfigHint.textContent = '请输入要添加的模型 ID。';
      aiModelInput.focus();
      return;
    }
    if (!provider.models.some((model) => model.id === modelId)) {
      provider.models.push({ id: modelId, name: modelId });
    }
    provider.defaultModel = modelId;
    state.aiConfigFormDirty = false;
    populateAiLocalConfigFields(true);
    aiModelSelect.value = modelId;
    state.aiConfigFormDirty = true;
    aiLocalConfigHint.dataset.tone = 'success';
    aiLocalConfigHint.textContent = `已添加模型 ${modelId}，保存当前供应商后生效。`;
  }

  async function refreshProviderModels() {
    const provider = getActiveProvider();
    if (!provider || state.aiProviderAction) return;
    if (aiProviderKeyInput.value.trim()) {
      aiLocalConfigHint.dataset.tone = 'error';
      aiLocalConfigHint.textContent = '请先保存新填写的供应商密钥，再刷新远端模型。';
      return;
    }
    syncProviderFormToState();
    state.aiProviderAction = 'models';
    updateAiUi();
    aiModelsRefreshBtn.textContent = '刷新中…';
    let feedbackTone = '';
    let feedbackText = '';

    try {
      const response = await apiFetch('/api/ai/providers/models', {
        method: 'POST',
        body: JSON.stringify({ providerId: provider.id })
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, `模型列表刷新失败（HTTP ${response.status}）`));
      }
      const payload = await response.json();
      const models = parseProviderModels(payload.models);
      if (!models.length) throw new Error('供应商未返回可用模型。');
      provider.models = models;
      if (!models.some((model) => model.id === provider.defaultModel)) provider.defaultModel = models[0].id;
      state.aiConfigFormDirty = false;
      populateAiLocalConfigFields(true);
      state.aiConfigFormDirty = true;
      feedbackTone = 'success';
      feedbackText = `已刷新 ${models.length} 个模型；保存配置后持久化列表。`;
    } catch (error) {
      feedbackTone = 'error';
      feedbackText = '刷新模型失败：' + (error.message || '未知错误');
      setStatus('刷新模型失败：' + (error.message || '未知错误'), 'error');
    } finally {
      state.aiProviderAction = '';
      aiModelsRefreshBtn.textContent = '刷新模型';
      syncAiLocalConfigControls();
      if (feedbackText) {
        aiLocalConfigHint.dataset.tone = feedbackTone;
        aiLocalConfigHint.textContent = feedbackText;
      }
    }
  }

  async function testProviderConnection() {
    const provider = getActiveProvider();
    if (!provider || state.aiProviderAction) return;
    if (aiProviderKeyInput.value.trim()) {
      aiLocalConfigHint.dataset.tone = 'error';
      aiLocalConfigHint.textContent = '请先保存新填写的供应商密钥，再测试已保存的连接。';
      return;
    }
    syncProviderFormToState();
    state.aiProviderAction = 'test';
    updateAiUi();
    aiConfigTestBtn.textContent = '测试中…';
    let feedbackTone = '';
    let feedbackText = '';

    try {
      const response = await apiFetch('/api/ai/providers/test', {
        method: 'POST',
        body: JSON.stringify({
          providerId: provider.id,
          ...(provider.defaultModel ? { modelId: provider.defaultModel } : {})
        })
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, `连接测试失败（HTTP ${response.status}）`));
      }
      const result = await response.json();
      const latency = Number.isFinite(Number(result.latencyMs)) ? ` · ${Number(result.latencyMs)} ms` : '';
      feedbackTone = 'success';
      feedbackText = `连接成功${latency}。测试不会修改已保存配置。`;
      setStatus(`${provider.name} 连接成功${latency}`, 'success');
    } catch (error) {
      feedbackTone = 'error';
      feedbackText = '连接测试失败：' + (error.message || '未知错误');
      setStatus('连接测试失败：' + (error.message || '未知错误'), 'error');
    } finally {
      state.aiProviderAction = '';
      aiConfigTestBtn.textContent = '测试连接';
      syncAiLocalConfigControls();
      if (feedbackText) {
        aiLocalConfigHint.dataset.tone = feedbackTone;
        aiLocalConfigHint.textContent = feedbackText;
      }
    }
  }

  async function saveLocalAiConfig(clearApiKey) {
    if (!state.aiConfig.localConfigWritable) {
      setStatus('当前服务不允许在页面内修改模型配置', 'warning');
      return;
    }

    const provider = getActiveProvider();
    if (!provider) {
      setStatus('没有可保存的供应商配置', 'warning');
      return;
    }

    syncProviderFormToState();
    if (clearApiKey) {
      if (state.aiConfig.activeRoute.providerId === provider.id) {
        aiLocalConfigHint.dataset.tone = 'error';
        aiLocalConfigHint.textContent = '不能清除智能排版当前默认供应商的密钥。请先把“智能排版默认模型”切换到另一个已启用且已配置密钥的供应商并保存。';
        aiActiveRouteSelect.focus();
        return;
      }
      const confirmed = window.confirm(`这会清除 ${provider.name} 在本机保存的供应商密钥。是否继续？`);
      if (!confirmed) return;
    }

    const apiKey = aiProviderKeyInput.value;
    const payload = buildProviderConfigPayload({
      activeRoute: state.aiConfig.activeRoute,
      providers: state.aiConfig.providers,
      selectedProviderId: provider.id,
      keyAction: clearApiKey ? 'clear' : (apiKey.trim() ? 'replace' : 'keep'),
      apiKey
    });

    state.aiConfigSaving = true;
    syncAiLocalConfigControls();
    setStatus(clearApiKey ? '正在清除供应商密钥…' : '正在保存模型配置…', 'warning');
    let saveErrorMessage = '';
    let saveSuccessMessage = '';

    try {
      const response = await apiFetch('/api/ai/config', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, `模型配置保存失败（HTTP ${response.status}）`));
      }

      state.aiConfig = parseAiConfig(await response.json());
      state.aiConfigLoaded = true;
      state.aiConfigError = '';
      if (!state.aiConfig.providers.some((item) => item.id === state.activeProviderId)) {
        state.activeProviderId = state.aiConfig.activeRoute.providerId || 'openai';
      }
      populateAiLocalConfigFields(true);
      updateAiUi();
      saveSuccessMessage = clearApiKey
        ? `${provider.name} 的供应商密钥已清除。`
        : `${provider.name} 配置与智能排版默认模型已保存。`;
      setStatus(clearApiKey ? `${provider.name} 密钥已清除` : `${provider.name} 配置已保存`, 'success');
    } catch (error) {
      saveErrorMessage = error.message || '未知错误';
      setStatus('模型配置保存失败：' + saveErrorMessage, 'error');
    } finally {
      state.aiConfigSaving = false;
      updateAiUi();
      if (saveErrorMessage) {
        aiLocalConfigHint.dataset.tone = 'error';
        aiLocalConfigHint.textContent = '保存失败：' + saveErrorMessage;
      } else if (saveSuccessMessage) {
        aiLocalConfigHint.dataset.tone = 'success';
        aiLocalConfigHint.textContent = saveSuccessMessage;
      }
    }
  }

  async function requestAiLayout() {
    if (state.aiBusy) return;

    const source = rawInput.value.trim();
    if (!source) {
      setStatus('请先输入原始内容，再发起 AI 智能排版', 'warning');
      rawInput.focus();
      return;
    }

    if (state.isFileProtocol) {
      setStatus('当前通过 file:// 打开，请从服务端地址访问后再使用 AI', 'warning');
      return;
    }

    if (state.aiConfig.maxSourceChars && countAiSourceChars(rawInput.value) > state.aiConfig.maxSourceChars) {
      setStatus(`原始内容超出 ${state.aiConfig.maxSourceChars.toLocaleString('zh-CN')} 字上限，请先裁剪`, 'warning');
      rawInput.focus();
      return;
    }

    if (shouldConfirmAiOverwrite({
      currentMarkdown: input.value,
      lastGeneratedMarkdown: state.lastGeneratedMarkdown
    })) {
      const confirmed = window.confirm('重新生成会覆盖当前已编辑的排版稿。是否继续？');
      if (!confirmed) return;
    }

    state.aiBusy = true;
    updateAiUi();
    setStatus('AI 正在生成 Markdown…', 'warning');

    try {
      const response = await apiFetch('/api/ai/layout', {
        method: 'POST',
        body: JSON.stringify({
          source: rawInput.value,
          themeId: state.themeId
        })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, `AI 智能排版失败（HTTP ${response.status}）`));
      }

      const result = await response.json();
      if (!result || typeof result.markdown !== 'string' || !result.markdown.trim()) {
        throw new Error('AI 返回为空，未生成 Markdown');
      }

      input.value = result.markdown;
      state.lastGeneratedMarkdown = result.markdown;
      state.lastAiModel = typeof result.model === 'string' ? result.model : (state.aiConfig.model || '');
      state.lastAiUsage = result.usage && typeof result.usage === 'object' ? result.usage : null;
      applyEditorMode('markdown', { focus: true });
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setStatus(state.lastAiModel ? `AI 排版完成 · ${state.lastAiModel}` : 'AI 排版完成', 'success');
    } catch (error) {
      setStatus('AI 排版失败：' + error.message, 'error');
    } finally {
      state.aiBusy = false;
      updateAiUi();
    }
  }

  function bindDropdowns() {
    document.querySelectorAll('.toolbar-dropdown').forEach((dropdown) => {
      const toggle = dropdown.querySelector('.toolbar-btn');
      const menu = dropdown.querySelector('.toolbar-dropdown-menu');
      if (!toggle || !menu) return;
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        document.querySelectorAll('.toolbar-dropdown-menu.show').forEach((openMenu) => {
          if (openMenu !== menu) openMenu.classList.remove('show');
        });
        menu.classList.toggle('show');
      });
      menu.addEventListener('click', (event) => event.stopPropagation());
    });
  }

  function bindEvents() {
    settingsMenu.addEventListener('toggle', () => {
      settingsSummary.setAttribute('aria-expanded', String(settingsMenu.open));
      syncSettingsPresentation();
      if (settingsMenu.open) {
        aiProviderKeyInput.value = '';
        settingsPopover.scrollTop = 0;
        focusSettingsDialog();
      }
    });
    settingsBackdrop.addEventListener('click', () => {
      settingsMenu.open = false;
      settingsSummary.focus();
    });
    window.addEventListener('resize', syncSettingsPresentation);

    editorTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => applyEditorMode(tab.dataset.editorTab, { focus: true }));
      tab.addEventListener('keydown', (event) => {
        if (!editorTabs.length) return;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          focusEditorTab((index + 1) % editorTabs.length);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          focusEditorTab((index - 1 + editorTabs.length) % editorTabs.length);
        } else if (event.key === 'Home') {
          event.preventDefault();
          focusEditorTab(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          focusEditorTab(editorTabs.length - 1);
        }
      });
    });

    rawInput.addEventListener('input', () => {
      updateWordCount();
      scheduleSave();
      updateAiUi();
    });

    input.addEventListener('input', () => {
      scheduleRender();
      scheduleSave();
    });

    document.querySelectorAll('[data-insert]').forEach((button) => {
      button.addEventListener('click', () => {
        const snippet = snippets[button.dataset.insert];
        if (snippet) insertAtSelection(snippet);
      });
    });

    document.querySelectorAll('.emoji-btn').forEach((button) => {
      button.addEventListener('click', () => {
        insertAtSelection(button.dataset.emoji || '');
        document.getElementById('emoji-menu').classList.remove('show');
      });
    });

    document.querySelectorAll('.ul-option').forEach((button) => {
      button.addEventListener('click', () => {
        const selected = input.value.slice(input.selectionStart, input.selectionEnd) || '重点文字';
        const wrapper = button.dataset.mark === 'highlight' ? ['==', '=='] : ['++', '++'];
        const text = wrapper[0] + selected + wrapper[1];
        insertAtSelection(text, { start: wrapper[0].length, end: wrapper[0].length + selected.length });
        document.getElementById('ul-menu').classList.remove('show');
      });
    });

    themeToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = themeMenu.classList.toggle('show');
      themeToggle.setAttribute('aria-expanded', String(isOpen));
    });
    themeMenu.addEventListener('click', (event) => event.stopPropagation());
    document.querySelectorAll('.theme-option').forEach((option) => {
      option.addEventListener('click', () => {
        applyTheme(option.dataset.theme);
        themeMenu.classList.remove('show');
        themeToggle.setAttribute('aria-expanded', 'false');
        renderNow();
        saveNow(false);
        setStatus('已切换为' + getThemeLabel(state.themeId), 'success');
      });
    });

    exportToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = exportMenu.classList.toggle('show');
      exportToggle.setAttribute('aria-expanded', String(isOpen));
    });
    exportMenu.addEventListener('click', (event) => event.stopPropagation());
    document.querySelectorAll('[data-export]').forEach((button) => {
      button.addEventListener('click', () => {
        exportCurrent(button.dataset.export);
        exportMenu.classList.remove('show');
      });
    });

    aiLayoutBtn.addEventListener('click', requestAiLayout);
    aiProviderTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectProvider(tab.dataset.providerId));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const availableTabs = aiProviderTabs.filter((item) => !item.disabled);
        if (!availableTabs.length) return;
        const currentIndex = availableTabs.indexOf(tab);
        let nextIndex = currentIndex;
        if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = availableTabs.length - 1;
        else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % availableTabs.length;
        else nextIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length;
        availableTabs[nextIndex].focus();
        selectProvider(availableTabs[nextIndex].dataset.providerId, { silent: true });
      });
    });
    [aiBaseUrlInput, aiModelInput, aiProviderKeyInput].forEach((control) => {
      control.addEventListener('input', () => {
        state.aiConfigFormDirty = true;
      });
    });
    aiProviderEnabled.addEventListener('change', () => {
      state.aiConfigFormDirty = true;
      syncProviderFormToState();
      populateRouteOptions();
      syncAiLocalConfigControls();
    });
    aiApiFormatSelect.addEventListener('change', () => {
      const provider = getActiveProvider();
      if (provider && provider.baseUrlByFormat[aiApiFormatSelect.value]) {
        aiBaseUrlInput.value = provider.baseUrlByFormat[aiApiFormatSelect.value];
      }
      aiApiStyleField.hidden = aiApiFormatSelect.value !== 'openai';
      state.aiConfigFormDirty = true;
    });
    aiApiStyleSelect.addEventListener('change', () => {
      state.aiConfigFormDirty = true;
    });
    aiModelSelect.addEventListener('change', () => {
      const provider = getActiveProvider();
      if (provider) provider.defaultModel = aiModelSelect.value;
      state.aiConfigFormDirty = true;
    });
    aiModelAddBtn.addEventListener('click', addManualProviderModel);
    aiModelsRefreshBtn.addEventListener('click', refreshProviderModels);
    aiConfigTestBtn.addEventListener('click', testProviderConnection);
    aiActiveRouteSelect.addEventListener('change', () => {
      state.aiConfig.activeRoute = parseRouteValue(aiActiveRouteSelect.value);
      state.aiConfigFormDirty = true;
    });
    aiConfigSaveBtn.addEventListener('click', () => {
      saveLocalAiConfig(false);
    });
    aiConfigClearKeyBtn.addEventListener('click', () => {
      saveLocalAiConfig(true);
    });
    importBtn.addEventListener('click', () => mdFileInput.click());
    mdFileInput.addEventListener('change', () => {
      const file = mdFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        input.value = String(reader.result || '');
        applyEditorMode('markdown');
        state.lastGeneratedMarkdown = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        saveNow(false);
        updateAiUi();
        setStatus('已导入 ' + file.name, 'success');
      };
      reader.onerror = () => setStatus('文件读取失败', 'error');
      reader.readAsText(file);
      mdFileInput.value = '';
    });

    document.getElementById('img-insert-btn').addEventListener('click', () => imgFileInput.click());
    document.getElementById('gallery-insert-btn').addEventListener('click', () => galleryFileInput.click());
    document.getElementById('hero-img-btn').addEventListener('click', () => heroFileInput.click());
    imgFileInput.addEventListener('change', async () => {
      await handleImages(Array.from(imgFileInput.files), false);
      imgFileInput.value = '';
    });
    galleryFileInput.addEventListener('change', async () => {
      await handleImages(Array.from(galleryFileInput.files), true);
      galleryFileInput.value = '';
    });
    heroFileInput.addEventListener('change', async () => {
      await handleHeroImage(heroFileInput.files[0]);
      heroFileInput.value = '';
    });

    copyBtn.addEventListener('click', copyCanonicalHtml);
    resetBtn.addEventListener('click', async () => {
      if (!window.confirm('恢复默认示例将覆盖当前原稿，并清空本地图片素材。是否继续？')) return;
      input.value = defaultMarkdownContent;
      rawInput.value = defaultRawContent;
      state.themeId = GzhThemes.defaultId || 'green';
      state.autoToc = true;
      state.lastGeneratedMarkdown = '';
      state.lastAiModel = '';
      state.lastAiUsage = null;
      applyTheme(state.themeId);
      applyEditorMode('markdown');
      await assetDb.clear();
      renderNow();
      saveNow(false);
      updateAiUi();
      setStatus('已恢复默认示例', 'success');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && settingsMenu.open) {
        event.preventDefault();
        settingsMenu.open = false;
        settingsSummary.focus();
      } else if (event.key === 'Tab' && settingsMenu.open && window.matchMedia('(max-width: 560px)').matches) {
        const focusable = Array.from(settingsPopover.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )).filter((element) => !element.hidden && element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copyCanonicalHtml();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNow(true);
      }
    });

    document.addEventListener('click', (event) => {
      themeMenu.classList.remove('show');
      exportMenu.classList.remove('show');
      if (settingsMenu.open && !settingsMenu.contains(event.target)) settingsMenu.open = false;
      themeToggle.setAttribute('aria-expanded', 'false');
      exportToggle.setAttribute('aria-expanded', 'false');
      document.querySelectorAll('.toolbar-dropdown-menu.show').forEach((menu) => menu.classList.remove('show'));
    });

    bindDropdowns();
  }

  async function init() {
    loadDocument();
    applyTheme(state.themeId);
    applyEditorMode(state.editorMode);
    bindEvents();
    const assetsAvailable = await assetDb.init();
    renderNow();
    saveState.textContent = '已恢复';
    updateAiUi();
    await loadAiConfig();
    setStatus(assetsAvailable ? '已就绪，内容自动保存' : '已就绪；当前浏览器仅保留本次会话图片', assetsAvailable ? 'success' : 'warning');
  }

  init();
})();
