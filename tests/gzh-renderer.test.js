const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadAsClassicScripts() {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  [
    'vendor/marked/marked.min.js',
    'app/gzh-themes.js',
    'app/gzh-renderer.js'
  ].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  });
  return sandbox;
}

const browser = loadAsClassicScripts();
const GzhThemes = browser.GzhThemes;
const GzhRenderer = browser.GzhRenderer;

assert.ok(GzhThemes, 'classic script should expose window.GzhThemes');
assert.ok(GzhRenderer, 'classic script should expose window.GzhRenderer');

const expectedThemes = [
  ['green', '翡翠绿', '#059669', 'border-bottom:2px solid #059669;font-weight:700;', 'original-classic'],
  ['blue', '经典蓝', '#2563EB', 'border-bottom:2px solid #2563EB;font-weight:700;', 'original-classic'],
  ['purple', '科技紫', '#7C3AED', 'border-bottom:2px solid #7C3AED;font-weight:700;', 'original-classic'],
  ['red', '中国红', '#DC2626', 'border-bottom:2px solid #DC2626;font-weight:700;', 'original-classic'],
  ['orange', '活力橙', '#EA580C', 'border-bottom:2px solid #EA580C;font-weight:700;', 'original-classic'],
  ['teal', '清新青', '#0891B2', 'border-bottom:2px solid #0891B2;font-weight:700;', 'original-classic'],
  ['black-gold', '黑金', '#111827', 'border-bottom:2px solid #111827;font-weight:700;', 'original-classic'],
  ['pink', '玫瑰粉', '#DB2777', 'border-bottom:2px solid #DB2777;font-weight:700;', 'original-classic'],
  ['moyu-green', '摸鱼绿', '#059669', 'border-bottom:2px solid #A7F3D0;font-weight:600;', 'magazine-green'],
  ['red-white', '红白色系', '#DC2626', 'border-bottom:2px solid #FECACA;font-weight:600;', 'classic'],
  ['graphite-minimal', '石墨极简风', '#52525B', 'border-bottom:2px solid #52525B;font-weight:600;', 'classic'],
  ['zen-whitespace', '留白禅意风', '#4A5D52', 'border-bottom:1.5px solid #B5C8BC;font-weight:500;', 'zen'],
  ['moyu-ticket', '摸鱼票据风', '#059669', 'border-bottom:2px solid #A7F3D0;font-weight:600;', 'ticket'],
  ['olive-journal', '橄榄手记', '#1e1f23', 'border-bottom:2px solid #ed7b2f;font-weight:600;', 'journal']
];

const expectedContentPadding = {
  green: '20px 16px 10px',
  blue: '20px 16px 10px',
  purple: '20px 16px 10px',
  red: '20px 16px 10px',
  orange: '20px 16px 10px',
  teal: '20px 16px 10px',
  'black-gold': '20px 16px 10px',
  pink: '20px 16px 10px',
  'moyu-green': '20px 20px 0',
  'red-white': '20px 10px 0',
  'graphite-minimal': '20px 10px 0',
  'zen-whitespace': '20px 16px 0',
  'moyu-ticket': '20px 20px 0',
  'olive-journal': '20px 8px 8px'
};

assert.deepEqual(Array.from(GzhThemes.list(), (theme) => theme.id), expectedThemes.map((row) => row[0]));
assert.equal(GzhThemes.defaultId, 'green');
expectedThemes.forEach(([id, name, primary, underlineCss, family]) => {
  const theme = GzhThemes.get(id);
  assert.equal(theme.name, name);
  assert.equal(theme.colors.primary, primary);
  assert.equal(theme.underlineCss, underlineCss);
  assert.equal(theme.skeletonFamily, family);
  assert.equal(theme.contentPadding, expectedContentPadding[id]);
  assert.ok(theme.scenes.length >= 3, `${id} should declare its upstream scenes`);
});
assert.equal(GzhThemes.resolve('not-a-theme').id, GzhThemes.defaultId);

const originalGradients = {
  green: 'linear-gradient(135deg,#059669,#10B981)',
  blue: 'linear-gradient(135deg,#2563EB,#3B82F6)',
  purple: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  red: 'linear-gradient(135deg,#DC2626,#EF4444)',
  orange: 'linear-gradient(135deg,#EA580C,#F97316)',
  teal: 'linear-gradient(135deg,#0891B2,#06B6D4)',
  'black-gold': 'linear-gradient(135deg,#111827,#1F2937)',
  pink: 'linear-gradient(135deg,#DB2777,#EC4899)'
};
Object.entries(originalGradients).forEach(([id, gradient]) => {
  assert.equal(GzhThemes.get(id).colors.gradient, gradient);
});

function validateWithPython(html, themeId) {
  const result = spawnSync(
    process.env.PYTHON || 'python3',
    [path.join(root, 'scripts/validate_gzh_html.py'), '--stdin'],
    { input: html, encoding: 'utf8' }
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${themeId} failed Python validation:\n${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /WARNING/i, `${themeId} should have no Python validator warnings`);
}

const standardMarkdown = `# Skills 时代的排版器

> 一句开场导语，说明这篇文章要解决什么问题。

从"Prompt工程"到=g=关系构建=/g=,这是=Y=正在发生的现实=/Y=!
这是内容的**"关系年"**，需要行内兜底。
这是 **重点**,然后继续。
这是 ++关键词++ 与 ==高亮==。

## 第一章

### 一个小节

=r=误区一=/r=,不给上下文; =b=误区二=/b=,只用一次? =o=误区三=/o=,没有边界感!

- 列表一
- 列表二

![结构示意图](img-1)

\`OpenAI's API\` 保留英文专名。

\`\`\`js
const message = "中文,ok!";
const marker = "=g=literal=/g=";
\`\`\`

## 第二章

| 维度 | 结论 |
| --- | --- |
| 速度 | 更快 |

原始 HTML 必须转义：<script>alert("x")</script>

## 写在最后

这是结尾。`;

const signatures = {
  'moyu-green': ['MAGAZINE BRIEF', '本文导读', '/// LAST'],
  'red-white': ['border-left:4px solid #DC2626', '本文看点', 'THE END'],
  'graphite-minimal': ['font-size:48px', 'CONTENTS', 'THE END'],
  'zen-whitespace': ["'Songti SC'", 'POSTSCRIPT', 'border-top:1px solid #B5C8BC'],
  'moyu-ticket': ['ADMIT ONE', 'box-shadow:6px 6px 0 #A7F3D0', '/ THANKS FOR READING /'],
  'olive-journal': ['EDITORIAL JOURNAL', 'FIELD NOTE', '/// END']
};

for (const theme of GzhThemes.list()) {
  const rendered = GzhRenderer.renderWithMeta(standardMarkdown, {
    themeId: theme.id,
    resolveImage: (ref) => ref === 'img-1' ? 'data:image/png;base64,AA==' : ref
  });
  const html = rendered.html;
  const validation = GzhRenderer.validate(html);

  assert.equal(rendered.themeId, theme.id);
  assert.equal(rendered.title, 'Skills 时代的排版器');
  assert.equal(rendered.chapterCount, 3);
  assert.deepEqual(Array.from(validation.errors), [], `${theme.id} should have no validation errors`);
  assert.deepEqual(Array.from(validation.warnings), [], `${theme.id} should have no validation warnings`);
  assert.ok(validation.leafCount > 20, `${theme.id} should wrap its text leaves`);
  validateWithPython(html, theme.id);

  assert.doesNotMatch(html, /<\/?(?:div|style|script)[\s>]/i);
  assert.doesNotMatch(html, /\s(?:class|id)\s*=/i);
  assert.doesNotMatch(html, /(?:float\s*:|display\s*:\s*grid|var\s*\(\s*--)/i);
  assert.doesNotMatch(html, /=[Yrbo]=|=\/[Yrbo]=/);
  assert.equal((html.match(/=g=/g) || []).length, 1, 'only fenced code may retain =g=');
  assert.equal((html.match(/=\/g=/g) || []).length, 1, 'only fenced code may retain =/g=');
  assert.match(html, /border-bottom:[^;]+;font-weight:(?:500|600|700);color:/, `${theme.id} should use its keyword underline`);
  assert.match(html, /background:[^;]+;color:[^;]+;padding:2px 5px/, `${theme.id} should use its highlight`);
  assert.match(html, /data:image\/png;base64,AA==/);
  assert.match(html, theme.skeletonFamily === 'original-classic' ? /max-width:100%;height:auto;display:block;margin:18px auto/ : /max-width:100%;height:auto;display:block;margin:0 auto/);
  assert.match(html, /&lt;script&gt;/);
  if (theme.skeleton.renderH1) {
    assert.match(html, /<h1\b/i, `${theme.id} should retain the original visible H1`);
  } else {
    assert.doesNotMatch(html, /<h1\b/i, `${theme.id} should keep H1 as metadata`);
  }
  if (theme.skeleton.hasSignature === false) {
    assert.doesNotMatch(html, /\{\{作者名\}\}|\{\{简介\}\}|如果你觉得这篇内容有帮助/, `${theme.id} should not append a signature`);
  } else {
    assert.doesNotMatch(html, /\{\{作者名\}\}|\{\{简介\}\}/, 'default signature must not expose template placeholders');
    assert.doesNotMatch(html, /我是\s*[，。]/, 'empty signature must not emit a malformed introduction');
    assert.match(html, /如果你觉得这篇内容有帮助/, 'default signature should retain the interaction prompt');
  }
  assert.match(html, /const message = &quot;中文,ok!&quot;;/, 'code punctuation should stay unchanged');
  assert.match(html, /=g=literal=\/g=/, 'legacy markers inside fenced code should stay literal');
  assert.doesNotMatch(html, /\*\*"关系年"\*\*/);
  assert.match(html, /<strong[^>]*><span leaf="">“关系年”<\/span><\/strong>/);
  assert.match(html, /<strong[^>]*><span leaf="">重点<\/span><\/strong><span leaf="">，然后/);
  assert.match(html, /，这是/);
  assert.match(html, /现实<\/span><\/span><span leaf="">！/);
  (signatures[theme.id] || []).forEach((needle) => assert.ok(html.includes(needle), `${theme.id} should include ${needle}`));

  const firstChapterHits = (html.match(/第一章/g) || []).length;
  if (theme.skeleton.hasToc) {
    assert.ok(firstChapterHits >= 2, `${theme.id} should repeat its first chapter in the TOC`);
  } else {
    assert.equal(firstChapterHits, 1, `${theme.id} must not render a TOC`);
  }

  if (theme.id === 'moyu-ticket' || theme.id === 'olive-journal') {
    assert.match(html, /<\/section><p style="display:none;"><mp-style-type data-value="3"><\/mp-style-type><\/p>$/, `${theme.id} hidden mark must be outside root and last`);
  } else {
    assert.doesNotMatch(html, /mp-style-type/);
  }
}

const noToc = GzhRenderer.render(standardMarkdown, {
  themeId: 'red-white',
  autoToc: false,
  appendSignature: false,
  resolveImage: () => 'data:image/png;base64,AA=='
});
assert.doesNotMatch(noToc, /本文看点/);
assert.doesNotMatch(noToc, /\{\{作者名\}\}/);

const customSignature = GzhRenderer.render('# 标题\n\n正文。', {
  themeId: 'red-white',
  author: '小李',
  bio: '内容设计师'
});
assert.match(customSignature, /小李/);
assert.match(customSignature, /内容设计师/);
assert.match(customSignature, /我是 小李，内容设计师。/);
assert.doesNotMatch(customSignature, /\{\{作者名\}\}/);

const authorOnlySignature = GzhRenderer.render('# 标题\n\n正文。', {
  themeId: 'red-white',
  author: '小李'
});
assert.match(authorOnlySignature, /我是 小李。/);
assert.doesNotMatch(authorOnlySignature, /我是 小李，/);
assert.doesNotMatch(authorOnlySignature, /\{\{简介\}\}/);

const bioOnlySignature = GzhRenderer.render('# 标题\n\n正文。', {
  themeId: 'red-white',
  bio: '专注 AI 与内容设计'
});
assert.match(bioOnlySignature, /专注 AI 与内容设计。/);
assert.doesNotMatch(bioOnlySignature, /我是 |\{\{作者名\}\}/);

const ordinaryTwoChapters = '# 普通文章\n\n## 第一章\n\n正文一。\n\n## 第二章\n\n正文二。';
const ordinaryGreen = GzhRenderer.render(ordinaryTwoChapters, {
  themeId: 'moyu-green',
  appendSignature: false
});
const ordinaryRed = GzhRenderer.render(ordinaryTwoChapters, {
  themeId: 'red-white',
  appendSignature: false
});
assert.equal((ordinaryGreen.match(/LAST/g) || []).length, 1, 'an ordinary last chapter must not duplicate the LAST footer');
assert.equal((ordinaryRed.match(/THE END/g) || []).length, 1, 'an ordinary last chapter must not duplicate the THE END footer');
assert.match(ordinaryGreen, /<span leaf="">02<\/span>/, 'the ordinary last chapter should keep its chapter number');
assert.match(ordinaryRed, /<span leaf="">02<\/span>/, 'the ordinary last chapter should keep its chapter number');

const fourChapterMarkdown = '# 四章文章\n\n## 第一章\n\n一。\n\n## 第二章\n\n二。\n\n## 第三章\n\n三。\n\n## 第四章\n\n四。';
const fourChapterToc = GzhRenderer.render(fourChapterMarkdown, {
  themeId: 'red-white',
  appendSignature: false
});
assert.equal((fourChapterToc.match(/第四章/g) || []).length, 2, 'the fourth chapter must appear in both TOC and body');
assert.match(fourChapterToc, /<span leaf="">04<\/span>/, 'the complete TOC should include the fourth chapter number');

const legacyBlocks = `[HERO]
BREAKING | 2026.08
旧版副标题
旧版主标题 | Accent
旧版描述
旧版横条 | 标签A,标签B
img-1
[/HERO]

[PART]
文章导读 👉 滑动查看
*PART 01 | 第一部分 | 核心看点
PART 02 | 第二部分 | 补充看点
PART 03 | 第三部分 | 延伸看点
PART 04 | 第四部分 | 行动建议
[/PART]

[CHAPTER]
09 | SECTION | 旧块章节 | 章节副标题
章内文本,应安全保留!
[/CHAPTER]

[CASE]
CASE | 示例
#### 案例标题
案例 =r=重点=/r= 与的**"关系年"**
[/CASE]

[CALLOUT]
提示 | 提示内容
[/CALLOUT]

[FLOW]
步骤一 | 描述一
步骤二 | 描述二
[/FLOW]

[VOCAB]
Phrase | 中文释义
> Example sentence.
使用说明
---
Another | 另一个释义
[/VOCAB]

[REFCARD]
使用场景 | Useful phrase | 中文释义
[/REFCARD]

[VIDEO]
VIDEO 01 | 视频描述
img-2
[/VIDEO]

[FEATURES]
特性一 | 描述内容一
[/FEATURES]

[SUMMARY]
总结一 | 副标题
[/SUMMARY]

[GALLERY]
img-3
[/GALLERY]

[END]
DONE
[/END]`;

const legacy = GzhRenderer.renderWithMeta(legacyBlocks, {
  themeId: 'moyu-green',
  resolveImage: (ref) => `data:image/png;base64,${ref}`,
  appendSignature: false
});
assert.equal(legacy.title, '旧版主标题 Accent');
assert.equal(legacy.chapterCount, 1);
assert.deepEqual(Array.from(GzhRenderer.validate(legacy.html).errors), []);
assert.deepEqual(Array.from(GzhRenderer.validate(legacy.html).warnings), []);
for (const tag of ['HERO', 'PART', 'CHAPTER', 'CASE', 'CALLOUT', 'FLOW', 'VOCAB', 'REFCARD', 'VIDEO', 'FEATURES', 'SUMMARY', 'GALLERY', 'END']) {
  assert.doesNotMatch(legacy.html, new RegExp(`\\[\\/?${tag}\\]`), `${tag} should be consumed`);
}
assert.match(legacy.html, /旧版副标题/);
assert.match(legacy.html, /章内文本，应安全保留！/);
assert.doesNotMatch(legacy.html, /\+\+重点\+\+|\*\*"关系年"\*\*/);
assert.match(legacy.html, /color:#111827;font-weight:700;border-bottom:2px solid #A7F3D0;padding-bottom:1px;"><span leaf="">重点/);
assert.match(legacy.html, /<strong[^>]*><span leaf="">“关系年”<\/span><\/strong>/);
assert.equal((legacy.html.match(/data:image\/png;base64,img-/g) || []).length, 3);

const originalBlocks = `[HERO]
BREAKING | 2026.08
旧版副标题
旧版主标题 | 彩色标题
旧版描述
底部横条 | 标签A,标签B
img-1
[/HERO]

[PART]
文章导读 👉 滑动查看
*PART 01 | 第一部分 | 核心看点
PART 02 | 第二部分 | 补充看点
[/PART]

[CHAPTER]
09 | SECTION | 旧块章节 | 章节副标题
章内正文。
[/CHAPTER]

[CASE]
CASE | 示例
#### 案例标题
案例正文。
[/CASE]

> 旧版引用。

[CALLOUT]
提示 | 提示内容
[/CALLOUT]

[FLOW]
步骤一 | 描述一
步骤二 | 描述二
[/FLOW]

[SUMMARY]
总结一 | 副标题一
总结二 | 副标题二
[/SUMMARY]

[GALLERY]
img-2
img-3
[/GALLERY]

[END]
DONE
[/END]`;

Object.keys(originalGradients).forEach((themeId) => {
  const rendered = GzhRenderer.renderWithMeta(originalBlocks, {
    themeId,
    resolveImage: (ref) => `data:image/png;base64,${ref}`
  });
  const html = rendered.html;
  assert.equal(rendered.themeId, themeId);
  assert.deepEqual(Array.from(GzhRenderer.validate(html).errors), []);
  assert.deepEqual(Array.from(GzhRenderer.validate(html).warnings), []);
  assert.match(html, /padding:20px 16px 10px;font-family:/, `${themeId} should keep the Hero away from the paper edge`);
  assert.ok(html.includes(`background:${originalGradients[themeId]}`), `${themeId} should use its original gradient`);
  assert.match(html, /flex:0 0 90px/, `${themeId} should use a flex Hero image rail`);
  assert.match(html, /overflow-x:auto/, `${themeId} should retain the horizontal PART rail`);
  assert.match(html, /flex:1 1 0;min-width:0;max-width:none;padding:0 4px/, `${themeId} should distribute four PART cards evenly`);
  assert.doesNotMatch(html, /flex:0 0 110px/, `${themeId} should not leave a fixed-width PART gap`);
  assert.match(html, /👉/);
  assert.match(html, /font-size:36px/, `${themeId} should retain the large explicit chapter number`);
  assert.match(html, /background:#FEF3C7;border-left:4px solid #F59E0B/);
  assert.match(html, /<span leaf="">→<\/span>/, `${themeId} should retain FLOW arrows`);
  assert.match(html, /<span leaf="">\+<\/span>/, `${themeId} should retain SUMMARY plus signs`);
  assert.match(html, /flex:0 0 49%;width:49%/, `${themeId} should size a two-image gallery as 49% columns`);
  assert.match(html, /<span leaf="">DONE<\/span>/, `${themeId} should render an explicit ending`);
  assert.doesNotMatch(html, /float\s*:|display\s*:\s*grid|var\s*\(\s*--|<div|\sclass=|\sid=/i);
  assert.doesNotMatch(html, /\{\{作者名\}\}|\{\{简介\}\}/);
});

const originalNoEnd = GzhRenderer.render('# 原版标题\n\n正文。', { themeId: 'green' });
assert.doesNotMatch(originalNoEnd, /<span leaf="">END<\/span>/, 'original-classic must not synthesize an ending');

const legacyColorMarks = GzhRenderer.render('=g=绿线=/g= =r=红线=/r= =b=蓝线=/b= =o=橙线=/o= =p=紫线=/p= =k=粉线=/k= =Y=黄底=/Y=', {
  themeId: 'green'
});
['#059669', '#DC2626', '#2563EB', '#EA580C', '#7C3AED', '#DB2777'].forEach((color) => {
  assert.match(legacyColorMarks, new RegExp(`border-bottom:2px solid ${color}`));
});
assert.match(legacyColorMarks, /background:#FDE68A/);
assert.doesNotMatch(legacyColorMarks, /=[grbopkY]=|=\/[grbopkY]=/);

const blackGoldHighlight = GzhRenderer.render('=Y=黑金高亮=/Y=', { themeId: 'black-gold' });
assert.match(blackGoldHighlight, /background:#D4A853/, 'black-gold should use its gold accent for legacy Y highlights');
assert.doesNotMatch(blackGoldHighlight, /background:#FDE68A/);

const themedLegacyMark = GzhRenderer.render('=r=主题关键词=/r=', { themeId: 'moyu-green', appendSignature: false });
assert.match(themedLegacyMark, /border-bottom:2px solid #A7F3D0/, 'upstream themes should migrate legacy colors to their own underline');

const fourBacktickFence = GzhRenderer.render('````md\n```\n=g=literal=/g=\n```\n````', { themeId: 'green' });
assert.match(fourBacktickFence, /=g=literal=\/g=/, 'a shorter inner fence must not close a longer outer fence');
assert.doesNotMatch(fourBacktickFence, /border-bottom:2px solid #059669/);

const unclosedFence = GzhRenderer.render('```md\n[HERO]\nBREAKING | 2026\n[/HERO]\n=g=literal=/g=', { themeId: 'green' });
assert.match(unclosedFence, /\[HERO\]/, 'an unclosed fence should remain code');
assert.match(unclosedFence, /=g=literal=\/g=/);
assert.doesNotMatch(unclosedFence, /linear-gradient/);

const compactHero = GzhRenderer.renderWithMeta(`[HERO]
BREAKING | 2026
正文
OPC 创业 | 爆款复写 | AI 协作
[/HERO]`, { appendSignature: false });
assert.equal(compactHero.title, 'OPC 创业 爆款复写');
assert.match(compactHero.html, /正文/);
assert.match(compactHero.html, /AI 协作/);

const unsafeRaw = GzhRenderer.render('# 标题\n\n<div class="bad" id="x"><script>危险!</script></div>', {
  appendSignature: false
});
assert.doesNotMatch(unsafeRaw, /<div|<script|class="bad"|id="x"/i);
assert.match(unsafeRaw, /&lt;div/);
assert.deepEqual(Array.from(GzhRenderer.validate(unsafeRaw).errors), []);

const invalid = '<div class="bad" id="x" style="float:left;display:grid;color:var(--x)">未包裹中文, "x"<span leaf="">已包裹</span></div>';
const invalidResult = GzhRenderer.validate(invalid);
assert.ok(invalidResult.errors.length >= 5, 'forbidden tags, attributes and styles should be errors');
assert.ok(invalidResult.warnings.length >= 2, 'unwrapped CJK and punctuation should be warnings');
assert.equal(invalidResult.leafCount, 1);

const noLeaf = GzhRenderer.validate('<p>中文</p>');
assert.ok(noLeaf.errors.some((message) => message.includes('没有任何')));

const codeOnly = GzhRenderer.validate('<section style="font-family:monospace"><span leaf="">中文, "x"</span></section>');
assert.deepEqual(Array.from(codeOnly.errors), []);
assert.deepEqual(Array.from(codeOnly.warnings), []);

console.log('gzh-renderer tests passed');
