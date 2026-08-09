# CLAUDE.md

## 1. 项目定位

这是一个本地优先的微信公众号 Markdown 编辑器。

目标不是做通用 CMS，而是稳定完成这条链路：

1. 写 Markdown
2. 实时看到 canonical 预览
3. 复制或导出同一份公众号正文 HTML
4. 粘贴到微信公众号后台后尽量不掉格式

## 2. 当前架构

### 关键职责分层

- `index.html`
  - 页面结构
  - 应用壳样式
  - 编辑器、工具栏、导出菜单、文件输入

- `app/editor-app.js`
  - UI 状态管理
  - autosave
  - IndexedDB 图片资产
  - 导入/导出/复制
  - 主题切换
  - 调用 `GzhRenderer`

- `app/gzh-themes.js`
  - 8 套原版经典配色 + 6 套上游特色版式
  - 主题元信息、颜色、骨架规则

- `app/gzh-renderer.js`
  - canonical WeChat HTML 渲染器
  - 预览 / 复制 / 导出共用
  - JS 侧轻量校验

- `scripts/validate_gzh_html.py`
  - 上游确定性校验器
  - 最终合规标准

## 3. 与上游仓库的关系

已对齐仓库：

- [gzh-design-skill](https://github.com/isjiamu/gzh-design-skill)

当前策略：

- 兼容冲突时以上游规则为准
- 本地项目保留“编辑器产品层”
- 上游提供“主题规范 + 微信红线 + 校验器”

记录文件：

- [UPSTREAM.md](UPSTREAM.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## 4. 当前已落地规则

### 渲染规则

- canonical HTML 禁止：
  - `<style>`
  - `<script>`
  - `<div>`
  - `class`
  - `id`
  - `float`
  - `position: fixed|absolute|sticky`
  - `display:grid`
  - CSS 变量

- 所有样式必须内联
- 中文文本必须包在 `<span leaf="">` 内
- 预览、复制、导出必须共用同一份 HTML

### 兼容性规则

- `HERO` 同时兼容旧 6 槽和当前 5 槽格式
- 图片来源允许：
  - `img-*` 本地资产 ID
  - `data:image/...`
  - `http(s)` URL
  - 相对路径
- `javascript:` 等危险地址必须被拦截

## 5. 存储策略

- 文稿与主题偏好：`localStorage`
- 图片资产：`IndexedDB`
- IndexedDB 不可用时：
  - 仍可编辑
  - 图片仅保留当前会话

## 6. 验证基线

当前最小验证命令：

```bash
node tests/gzh-renderer.test.js
python3 scripts/validate_gzh_html.py <file.html>
```

2026-08-09 这轮整合中，14 个主题都已经通过上游 Python 校验器，结果为 0 ERROR。

## 7. 修改约束

- 不要再把渲染逻辑塞回 `index.html`
- 不要让预览和复制走两套不同渲染器
- 不要引入需要构建工具的前端框架
- 不要为了“视觉更炫”破坏公众号红线
- 原版 8 配色共用 `original-classic` 骨架；不要再把纯配色切换与上游结构主题混为一类
- 如需新增主题，优先在 `app/gzh-themes.js` 扩展，并让 `app/gzh-renderer.js` 复用现有骨架

## 8. 已知剩余风险

- 真实微信公众号后台粘贴体验仍应做一次人工验证
- `file://` 场景下，部分浏览器对剪贴板与 IndexedDB 的限制可能更严格
- 当前 canonical renderer 已通过脚本校验，但还不是上游仓库 1:1 像素级复刻

## 9. 本地启动与降级

- 纯前端模式：
  - 可直接打开 `index.html`
  - 需要验证复制、下载、持久化时，优先用 `python3 -m http.server 8765`

- 服务端模式：
  - 本地入口是 `npm start`
  - `npm start` 实际执行 `node --env-file=.env server.mjs`
  - Docker 启动方式是 `docker compose up --build`
  - 公共接口至少包括 `GET /api/health` 与 `GET /api/ai/config`
  - `POST /api/ai/layout` 在配置了 `APP_ACCESS_TOKEN` 时要求 Bearer token

- `file://` 降级：
  - 编辑与基础预览应尽量可用
  - 剪贴板、IndexedDB、下载能力可能受浏览器策略限制

## 10. AI 安全边界

- 本仓库的基础编辑器不应依赖 LLM 才能打开或导出
- `LLM_API_KEY` 只能持久化在服务端环境变量或本机 `.env`，不应注入前端静态资源、localStorage 或接口响应
- 本地页面配置入口只能在非生产、回环监听、回环客户端且同源请求时写入 `.env`；生产环境必须禁用页面写配置
- AI 相关请求应由服务端读取 `LLM_BASE_URL`、`LLM_API_STYLE`、`LLM_MODEL`、`LLM_TIMEOUT_MS`、`MAX_SOURCE_CHARS`
- `LLM_API_STYLE` 当前支持 `chat-completions` 与 `responses`
- `GET /api/ai/config` 只能返回 `configured`、`apiStyle`、`model`、`maxSourceChars`、`authRequired`
- 配置了 `APP_ACCESS_TOKEN` 后，`POST /api/ai/layout` 必须校验 `Authorization: Bearer <token>`
- `NODE_ENV=production` 时必须配置非空 `APP_ACCESS_TOKEN`
- 无服务端时，AI 能力应降级为不可用，而不是让静态页泄漏密钥或报致命错误

## 11. 部署验证补充

在保留现有测试基线之外，服务端验证补充：

```bash
docker compose config
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/ai/config
curl -X POST http://127.0.0.1:3000/api/ai/layout \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <APP_ACCESS_TOKEN>' \
  --data '{"source":"# 标题"}'
```
