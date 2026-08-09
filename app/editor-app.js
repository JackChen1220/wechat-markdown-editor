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

  function parseAiConfig(payload) {
    const config = payload && typeof payload === 'object' ? payload : {};
    const maxSourceChars = Number(config.maxSourceChars);
    return {
      configured: Boolean(config.configured),
      hasApiKey: Boolean(config.hasApiKey),
      localConfigWritable: Boolean(config.localConfigWritable),
      baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : '',
      apiStyle: config.apiStyle === 'chat-completions' ? 'chat-completions' : 'responses',
      model: typeof config.model === 'string' ? config.model : '',
      maxSourceChars: Number.isFinite(maxSourceChars) && maxSourceChars > 0 ? Math.floor(maxSourceChars) : 0,
      authRequired: Boolean(config.authRequired)
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
    countAiSourceChars,
    normalizeDocument,
    normalizeEditorMode,
    parseAiConfig,
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
  const aiBaseUrlInput = document.getElementById('ai-base-url-input');
  const aiApiStyleSelect = document.getElementById('ai-api-style-select');
  const aiModelInput = document.getElementById('ai-model-input');
  const aiProviderKeyInput = document.getElementById('ai-provider-key-input');
  const aiConfigSaveBtn = document.getElementById('ai-config-save-btn');
  const aiConfigClearKeyBtn = document.getElementById('ai-config-clear-key-btn');
  const aiLocalConfigHint = document.getElementById('ai-local-config-hint');
  const aiTokenSection = document.getElementById('ai-token-section');
  const aiTokenModeNote = document.getElementById('ai-token-mode-note');
  const aiTokenInput = document.getElementById('ai-token-input');
  const aiTokenSaveBtn = document.getElementById('ai-token-save-btn');
  const aiTokenClearBtn = document.getElementById('ai-token-clear-btn');
  const aiTokenHint = document.getElementById('ai-token-hint');
  const defaultMarkdownContent = input.value;
  const defaultRawContent = rawInput.value;

  const DOCUMENT_KEY = 'gzh-editor-document-v2';
  const LEGACY_CONTENT_KEY = 'md-content';
  const LEGACY_THEME_KEY = 'editor-theme';
  const SESSION_TOKEN_KEY = 'gzh-editor-ai-access-token';
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
    accessToken: '',
    aiConfig: parseAiConfig(null),
    aiConfigLoaded: false,
    aiConfigError: '',
    aiBusy: false,
    aiConfigSaving: false,
    aiConfigFormDirty: false,
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

  function readSessionValue(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }

  function writeSessionValue(key, value) {
    try {
      if (value) {
        sessionStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
      }
      return true;
    } catch (error) {
      return false;
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

  function buildAiHeaders(includeContentType) {
    const headers = {};
    if (includeContentType) headers['Content-Type'] = 'application/json';
    if (state.accessToken) headers.Authorization = 'Bearer ' + state.accessToken;
    return headers;
  }

  async function extractErrorMessage(response, fallback) {
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
      if (data && typeof data.message === 'string' && data.message.trim()) return data.message.trim();
    } catch (error) {}
    try {
      const text = await response.text();
      if (text) return text.trim().slice(0, 200);
    } catch (error) {}
    return fallback;
  }

  function aiMetaLine() {
    const parts = [];
    if (state.aiConfig.baseUrl) parts.push(state.aiConfig.baseUrl.replace(/^https?:\/\//, ''));
    if (state.aiConfig.apiStyle) parts.push(state.aiConfig.apiStyle);
    if (state.aiConfig.model) parts.push(`模型：${state.aiConfig.model}`);
    if (state.aiConfig.maxSourceChars) parts.push(`上限 ${state.aiConfig.maxSourceChars.toLocaleString('zh-CN')} 字`);
    parts.push(state.aiConfig.hasApiKey ? '已保存供应商密钥' : '未保存供应商密钥');
    parts.push(state.aiConfig.authRequired ? '需要访问令牌' : '无需访问令牌');
    return parts.join(' · ');
  }

  function getAiAvailability() {
    const rawValue = rawInput.value.trim();

    if (state.isFileProtocol) {
      return {
        tone: 'warning',
        badge: '需从服务端打开',
        inline: '当前通过 file:// 打开，AI 接口不可用',
        meta: '请从本地或部署后的 HTTP 服务打开本页',
        note: 'AI 接口依赖 /api/ai/config 与 /api/ai/layout，file:// 模式下不会发起请求。',
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
          inline: '先在“AI 模型”里填写本地大模型配置',
          meta: '需要 Base URL、接口类型、模型名和供应商密钥',
          note: '保存本地模型配置后，左侧原始内容就可以一键生成 Markdown。',
          buttonLabel: 'AI 智能排版',
          disabled: true
        };
      }
      return {
        tone: 'warning',
        badge: '未配置',
        inline: 'AI 服务尚未完成配置',
        meta: '当前由服务端管理模型配置',
        note: '后端模型或供应商密钥未就绪时，编辑器不会尝试生成 Markdown。',
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

    if (state.aiConfig.authRequired && !state.accessToken) {
      return {
        tone: 'warning',
        badge: '需要令牌',
        inline: '请先在“AI 模型”里保存访问令牌',
        meta: aiMetaLine(),
        note: '访问令牌仅写入 sessionStorage，关闭标签页后会失效。',
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

  function syncTokenControls() {
    aiTokenInput.value = state.accessToken;
    aiTokenClearBtn.disabled = !state.accessToken;
    aiTokenHint.textContent = state.accessToken
      ? '当前会话已保存访问令牌。请求会自动携带 Authorization: Bearer。'
      : '仅写入 sessionStorage，不会保存到 localStorage。';
  }

  function populateAiLocalConfigFields(force) {
    if (state.aiConfigFormDirty && !force) return;
    aiBaseUrlInput.value = state.aiConfig.baseUrl || 'https://api.openai.com/v1';
    aiApiStyleSelect.value = state.aiConfig.apiStyle || 'responses';
    aiModelInput.value = state.aiConfig.model || '';
    aiProviderKeyInput.value = '';
    state.aiConfigFormDirty = false;
  }

  function syncAiLocalConfigControls() {
    const localWritable = state.aiConfig.localConfigWritable;
    aiLocalConfigSection.hidden = !localWritable;
    aiLocalManagedNote.hidden = localWritable;
    aiTokenSection.hidden = !state.aiConfig.authRequired;
    aiTokenModeNote.hidden = state.aiConfig.authRequired;

    aiConfigSaveBtn.disabled = !localWritable || state.aiConfigSaving;
    aiConfigClearKeyBtn.disabled = !localWritable || !state.aiConfig.hasApiKey || state.aiConfigSaving;

    if (localWritable) {
      delete aiLocalConfigHint.dataset.tone;
      aiLocalConfigHint.textContent = state.aiConfig.hasApiKey
        ? '供应商密钥已保存在本机 .env。留空保存时会保留当前密钥。'
        : '当前还没有供应商密钥。填写后会写入本机 .env。';
    } else {
      aiLocalManagedNote.textContent = '当前环境不允许在页面内修改本地模型配置，请改用服务端环境变量。';
    }

    aiTokenModeNote.textContent = state.aiConfig.localConfigWritable
      ? '本地模式当前无需访问令牌。'
      : '当前服务未启用访问令牌。';
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
      const response = await fetch('/api/ai/config', {
        headers: buildAiHeaders(false)
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, `AI 服务状态读取失败（HTTP ${response.status}）`));
      }
      state.aiConfig = parseAiConfig(await response.json());
      state.aiConfigLoaded = true;
      state.aiConfigError = '';
      populateAiLocalConfigFields(false);
    } catch (error) {
      state.aiConfig = parseAiConfig(null);
      state.aiConfigLoaded = true;
      state.aiConfigError = error.message || 'AI 服务状态读取失败';
    }
    updateAiUi();
  }

  async function saveLocalAiConfig(clearApiKey) {
    if (!state.aiConfig.localConfigWritable) {
      setStatus('当前环境不允许在页面内修改模型配置', 'warning');
      return;
    }

    if (state.aiConfig.authRequired && !state.accessToken) {
      setStatus('保存模型配置前，请先在“AI 模型”中保存访问令牌', 'warning');
      aiTokenInput.focus();
      return;
    }

    if (clearApiKey) {
      const confirmed = window.confirm('这会清除本机 .env 中的供应商密钥。是否继续？');
      if (!confirmed) return;
    }

    const payload = buildAiLocalConfigPayload({
      baseUrl: aiBaseUrlInput.value,
      apiStyle: aiApiStyleSelect.value,
      model: aiModelInput.value,
      apiKey: clearApiKey ? '' : aiProviderKeyInput.value,
      clearApiKey
    });

    state.aiConfigSaving = true;
    syncAiLocalConfigControls();
    setStatus(clearApiKey ? '正在清除供应商密钥…' : '正在保存本地模型配置…', 'warning');
    let saveErrorMessage = '';

    try {
      const response = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: buildAiHeaders(true),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response, `本地模型配置保存失败（HTTP ${response.status}）`));
      }

      state.aiConfig = parseAiConfig(await response.json());
      state.aiConfigLoaded = true;
      state.aiConfigError = '';
      populateAiLocalConfigFields(true);
      updateAiUi();
      setStatus(clearApiKey ? '供应商密钥已清除' : '本地模型配置已保存', 'success');
    } catch (error) {
      saveErrorMessage = error.message || '未知错误';
      setStatus('本地模型配置保存失败：' + saveErrorMessage, 'error');
    } finally {
      state.aiConfigSaving = false;
      updateAiUi();
      if (saveErrorMessage) {
        aiLocalConfigHint.dataset.tone = 'error';
        aiLocalConfigHint.textContent = '保存失败：' + saveErrorMessage;
      }
    }
  }

  async function saveAccessToken() {
    const token = aiTokenInput.value.trim();
    if (!writeSessionValue(SESSION_TOKEN_KEY, token)) {
      setStatus('访问令牌写入失败，请检查浏览器 sessionStorage 权限', 'error');
      return;
    }
    state.accessToken = token;
    syncTokenControls();
    updateAiUi();
    setStatus(token ? '访问令牌已保存到当前会话' : '访问令牌已清空', token ? 'success' : 'warning');
    await loadAiConfig();
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

    if (state.aiConfig.authRequired && !state.accessToken) {
      setStatus('AI 服务需要访问令牌，请先在“AI 模型”中保存', 'warning');
      aiTokenInput.focus();
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
      const response = await fetch('/api/ai/layout', {
        method: 'POST',
        headers: buildAiHeaders(true),
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
      if (settingsMenu.open && window.matchMedia('(max-width: 560px)').matches) {
        window.requestAnimationFrame(() => settingsPopover.focus({ preventScroll: true }));
      }
    });

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
    [aiBaseUrlInput, aiModelInput, aiProviderKeyInput].forEach((control) => {
      control.addEventListener('input', () => {
        state.aiConfigFormDirty = true;
      });
    });
    aiApiStyleSelect.addEventListener('change', () => {
      state.aiConfigFormDirty = true;
    });
    aiConfigSaveBtn.addEventListener('click', () => {
      saveLocalAiConfig(false);
    });
    aiConfigClearKeyBtn.addEventListener('click', () => {
      saveLocalAiConfig(true);
    });
    aiTokenSaveBtn.addEventListener('click', () => {
      saveAccessToken();
    });
    aiTokenClearBtn.addEventListener('click', () => {
      aiTokenInput.value = '';
      saveAccessToken();
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
    state.accessToken = readSessionValue(SESSION_TOKEN_KEY);
    syncTokenControls();
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
