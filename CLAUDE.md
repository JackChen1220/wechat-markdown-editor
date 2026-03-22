# CLAUDE.md

## 1. Project Overview
本项目是一个**微信公众号 Markdown 编辑器**（WeChat Markdown Editor）。

### 项目目标
- 提供 Markdown 编辑 + 实时预览的双栏编辑体验
- 通过"一键复制 HTML"将富文本内容粘贴到微信公众号后台编辑器
- 实现本地预览与微信编辑器渲染效果高度一致

### 当前阶段
- [x] MVP 开发
- [x] 功能联调
- [ ] 稳定性优化（CHAPTER 数字结构问题待解决）
- [ ] 本地自用验证

### 成功标准
- 能完成以下核心流程：
  1. 在编辑器输入 Markdown 语法（含自定义模块）
  2. 实时预览看到最终排版效果
  3. 点击"一键复制 HTML"，粘贴到微信公众号后台后样式还原度 > 90%

---

## 2. Product Context
### 这个项目解决什么问题
- 微信公众号编辑器不支持 Markdown，需要手动排版
- 直接复制 Markdown HTML 到微信后样式严重变形
- 缺乏统一的视觉风格组件（HERO、案例卡片、警示框等）

### 目标用户
- 用户类型：内容创作者、自媒体运营者
- 使用场景：微信公众号文章排版
- 高频操作：输入 Markdown → 预览 → 复制粘贴

### 非目标
以下内容暂时不做：
- 不做多人协作
- 不做服务端存储
- 不做图片上传到外部服务器（仅本地内存存储）

---

## 3. Tech Stack
### 技术栈
- Language: HTML + CSS + JavaScript（单文件，无构建工具）
- Framework: 原生 JavaScript
- Runtime: 浏览器
- Build Tool: 无
- Storage: localStorage（保存内容 + 主题偏好）
- AI/Model Provider: 无
- Other Dependencies:
  - `marked.js` (CDN: jsdelivr) — Markdown 渲染

### 环境要求
- Node: 无
- Package Manager: 无
- OS: macOS / Windows
- Browser: Chrome / Safari / Firefox

---

## 4. Repository Structure
### 目录结构说明
- `index.html` — **单文件项目**，包含所有 HTML / CSS / JavaScript 代码（约 2180 行）

> 修改代码前，先理解相关目录职责，尽量做最小改动。

---

## 5. Development Rules
### 通用开发原则
1. 先分析，再修改，避免直接大范围重构。
2. 优先做最小可行改动，除非明确要求重构。
3. 保持现有架构稳定，新增能力尽量模块化。
4. 所有自动化行为必须可开关、可配置。
5. 不要擅自删除已有能力，除非确认废弃。
6. 不要引入重量级依赖，除非收益明显。
7. 修改前先说明影响范围；修改后说明变更点。

### 代码风格
- 优先使用清晰命名，而不是炫技写法。
- 单个函数保持职责单一。
- 复杂逻辑必须加注释。
- 不要写魔法数字，常量统一抽离。

### 安全与稳健性
- 对 DOM 选择器失效要有兜底处理。
- 对图片加载失败要有容错。

---

## 6. Command Reference
直接在浏览器中打开 `index.html` 即可运行，无需任何命令。

---

## 7. 核心代码架构

### 文件结构（index.html 内）

| 区域 | 行数 | 说明 |
|------|------|------|
| CSS 变量（8种主题） | L9-L65 | 定义 `--primary`, `--primary-light` 等 |
| 编辑器布局 CSS | L66-L1037 | 双栏布局、工具栏、预览区、各模块样式 |
| HTML 页面结构 | L1039-L1323 | header + textarea + preview + footer |
| 工具栏按钮定义 | L1062-L1178 | 插入模块、Emoji、下划线等 |
| 默认示例内容 | L1181-L1311 | 包含所有模块类型的演示文章 |
| 核心 JS 变量 | L1325-L1344 | input, preview, copyBtn, snippets |
| `render()` 函数 | L1365-L1655 | 预览渲染（生成 class 样式 HTML） |
| `getTC()` 函数 | L1658-L1669 | 获取当前主题颜色 |
| `renderForWechat()` | L1672-L1920 | **核心**：生成微信兼容的内联样式 HTML |
| `copyHtml()` | L1922-L1964 | 剪贴板复制（Clipboard API + execCommand 降级） |
| 事件绑定 | L1966-L2179 | 工具栏、上传、样式切换、主题切换等 |

### 关键函数详解

#### `renderForWechat()` (L1672-L1920)
这是最关键的函数。生成**纯内联样式**的 HTML，用于：
1. 复制到剪贴板
2. 粘贴到微信公众号编辑器

**与 `render()` 的本质区别**：
- `render()` 生成带 class 的 HTML，依赖 `<style>` 中的 CSS 规则
- `renderForWechat()` 生成纯内联 style 属性，微信编辑器不加载外链样式

**模块渲染顺序**（顺序很重要，后面的模块会覆盖前面的处理）：
1. `[GALLERY]` — 多图画廊
2. `[HERO]` — 顶部英雄区
3. `[PART]` — 章节导航
4. `[CHAPTER]` — 章节标题
5. `[CASE]` — 案例卡片
6. `[CALLOUT]` — 警示框
7. `[FLOW]` — 流程步骤
8. `[FEATURES]` — 特性列表
9. `[SUMMARY]` — 底部摘要
10. `[END]` — 结尾横幅
11. 彩色下划线语法 `=g=text=/g=`
12. marked.js 渲染标准 Markdown
13. 标签内联样式注入（h1-h4, p, blockquote, ul, ol, li, strong, code, pre, hr）
14. 图片内联样式注入
15. blockquote 内 p 样式覆盖

### 微信公众号 CSS 兼容性规则（已验证）

| 微信行为 | 影响 | 应对策略 |
|---------|------|---------|
| `box-shadow` 被完全剥离 | 阴影效果全部消失 | 禁止使用 box-shadow，改用有意边框 |
| `border:none` / `border:0` 简写不可靠 | 微信仍渲染默认边框 | 改用逐边声明：`border-top:0 none;...` |
| `outline:none` 无效 | outline 属性被忽略 | 删除所有 outline 声明 |
| 微信给 `<img>` 添加默认边框 | 图片出现外框 | 使用 HTML 属性 `border="0"` + CSS `border:0 none;` |
| `<section>` / `<table>` 可能有默认边框 | 容器元素出现不期望边框 | 逐边声明 border 为 0 |
| `linear-gradient` 支持不完整 | 渐变背景可能失效 | 避免在关键样式使用渐变 |
| 微信覆盖图片固定尺寸 | `width:100px;height:100px` 被改写 | 不锁定图片尺寸，让微信自适应处理（HERO/SUMMARY/GALLERY 均如此） |
| `<p>` 有不可取消的默认 margin | 段落间距失控 | 改用 `<span style="display:block;">` |
| `<td>` 的 `width` 被忽略 | 表格列等宽分配 | 用 `float:left` + `margin-left` 替代 table 布局 |
| `&#x2060;` Word Joiner 渲染为可见字符 | 零宽字符方案失效 | 不使用零宽字符，改用结构性方案 |
| `border-bottom` 厚度被归一化 | 粗细线效果相同 | 用 `background` 背景色做视觉区分 |
| `border-image` 不可靠 | 渐变边框无效 | 保持 solid border |

---

## 8. 已知问题

### CHAPTER 竖线渐变（已确认为微信限制，不修复）
- **现象**: 本地预览竖线有渐变效果（上实下虚），微信中为纯实线
- **根因**: 微信不支持 `linear-gradient` 和 `border-image`
- **状态**: 接受限制，保持实线

---

## 9. 用户偏好
- 保持简洁直接的沟通风格

---

## 10. Session Handoff

### 当前进度（2026-03-22）

已完成 `renderForWechat()` 的**大规模重构**及后续修复，所有已知微信兼容性问题均已解决。

### 已验证有效的修复（2026-03-22）

| 问题 | 解决方案 | 状态 |
|------|---------|------|
| FLOW/SUMMARY/GALLERY td 堆叠 | 改用 `<section style="display:flex">` | 已解决 |
| HERO 图片消失 | 改回 `<img>` 标签，不限制宽高 | 已解决 |
| CALLOUT 图标跑出容器 | ⚠️ 图标合并到标题文字前缀 | 已解决 |
| FEATURES 内容换行 | 添加 `word-wrap:break-word` | 已解决 |
| PART 导航 td 堆叠 | 改用 flex 布局 | 已解决 |
| 多个模块 border 变形 | 全部改用 flex div + 逐边 border 声明 | 已解决 |
| 标准图片 border | `<img border="0">` | 已解决 |
| CHAPTER 数字拆字+50/50布局 | `float:left` + 零宽连接符 `&#8205;` | 已解决 |
| `</strong>` 后中文标点换行 | 将标点移入 `<strong>` 内部消除边界 | 已解决 |
| 下划线粗细无区别 | 大写改为荧光笔高亮（`background`） | 已解决 |

---

## 11. Change Log

### 2026-03-22 — 微信兼容性大规模修复

#### 架构变更
- **核心策略**：放弃 table 布局（FLOW/SUMMARY/GALLERY/CHAPTER/PART/CALLOUT），全部改为 flex div 布局
- **图片策略**：全部改回 `<img>` 标签，不使用 background-image（微信中 background 不显示）
- **标签策略**：所有模块内 `<p>` 改为 `<span style="display:block">` 避免微信默认段落 margin
- **边框策略**：统一使用逐边 border 声明 `border-top:0 none;...`，不用简写

#### `renderForWechat()` 各模块修改明细

| 模块 | 旧实现 | 新实现 | 备注 |
|------|--------|--------|------|
| HERO 图片 | `<img>` + triple-lock !important | `<img border="0">` 简版 | 去掉了 fixed width |
| FLOW | `<table><tr><td>` | `<section display:flex>` | 4步并排显示 |
| SUMMARY | `<table><tr><td>` | `<section display:flex>` | 三列并排 |
| GALLERY | `<table><tr><td><img>` | `<section display:flex><img>` | 图片画廊 |
| CHAPTER | `<table><tr><td>` | `<span display:inline-block>` | 数字+内容左右 |
| PART | `<table><tr><td>` | `<section display:flex>` | 导航项并排 |
| CALLOUT | `<table>` + ⚠️浮动 | ⚠️ 合并到标题前缀 | 图标不外溢 |
| CASE body | `<p>` | `<span display:block>` | 无段落间距 |
| FEATURES | `<p>` | `<span display:block>` | 无段落间距 |
| 标准图片 | `<img style="...">` | `<img border="0">` | 无尺寸锁定 |
| 标准 `<p>` | `<p style="...">` | 保留 `<p>` 内联样式 | 可控 |

#### `renderForWechat()` 行数变化
- 修改前：L1672-L1920（约 250 行）
- 修改后：L1672-L1921（约 250 行，结构大变但行数相当）

### 2026-03-22 — CHAPTER 布局 + 冒号换行 + 下划线修复

#### CHAPTER 布局修复
- **问题**：微信忽略 `<td>` 的 `width` 属性，两列各占 50%；数字字符被拆成上下结构
- **方案**：放弃 table/inline-block，改用 `float:left`（数字区域）+ `margin-left`（标题区域）
- 数字间插入零宽连接符 `&#8205;` 防止微信拆字
- 竖线渐变效果在微信中无法实现（不支持 linear-gradient/border-image），接受实线

#### 冒号换行修复
- **问题**：`</strong>` 后紧跟中文标点（：等）时微信强制换行
- **已失败方案**：`&#x2060;`（Word Joiner）在微信中被渲染为可见字符
- **最终方案**：将标点移入 `<strong>` 内部，消除标签边界换行点
- 代码：`html.replace(/<\/strong>(\s*[：:，,。.！!？?；;、])/g, '$1</strong>')`

#### 下划线粗细修复
- **问题**：大写 `=G=`（3px）和小写 `=g=`（2px）在微信中显示效果相同
- **方案**：大写改用 `background` 荧光笔高亮效果，小写保持 `border-bottom` 下划线

#### 新增微信兼容性规则

| 微信行为 | 应对策略 |
|---------|---------|
| `<td>` 的 `width` 被忽略，列等宽分配 | 用 `float:left` + `margin-left` 替代 table |
| `&#x2060;`（Word Joiner）渲染为可见字符 | 不使用零宽字符，改用结构性方案 |
| `border-bottom` 厚度被归一化 | 用 `background` 背景色做视觉区分 |
| `border-image` 不可靠 | 不使用，保持 solid border |

