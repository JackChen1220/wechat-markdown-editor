# wechat-markdown-editor

一个本地优先的微信公众号 Markdown 编辑器。

这次版本把 `gzh-design-skill` 的核心能力整合进来了，但不是把你的项目“替换掉”，而是把职责拆清楚：

- 你的本地 HTML 工作台负责编辑体验、离线存储、图片资产、导入导出、复制链路
- 上游仓库负责主题规范、微信公众号兼容红线、canonical HTML 校验标准

当前实现遵循的原则是：预览、复制、导出三条链路共用同一份 canonical HTML。

## 当前能力

- 8 套原版经典配色：翡翠绿、经典蓝、科技紫、中国红、活力橙、清新青、玫瑰粉、黑金
- 6 套上游特色版式：摸鱼绿、红白色系、石墨极简、留白禅意、摸鱼票据、橄榄手记
- 双阶段编辑：`原始内容` 用来粘贴散稿，`排版稿` 用来继续编辑生成后的 Markdown
- AI 智能排版：理解原文结构并生成受编辑器约束的 Markdown，不直接生成或替换 canonical HTML
- 本地 autosave：Markdown、主题与编辑状态保存到 localStorage
- 本地图片资产：优先用 IndexedDB 持久化，失败时退化为当前会话内存
- 导出 3 种结果：
  - Markdown 原稿
  - 公众号正文 HTML
  - 带复制按钮的预览页
- canonical 渲染器：
  - `app/gzh-renderer.js`
  - 生成全内联、无 `div/class/id` 的公众号正文 HTML
  - 所有中文文本用 `<span leaf="">` 包裹
- 上游校验器：
  - `scripts/validate_gzh_html.py`

## 目录

- [index.html](index.html)
- [app/editor-app.js](app/editor-app.js)
- [app/gzh-themes.js](app/gzh-themes.js)
- [app/gzh-renderer.js](app/gzh-renderer.js)
- [scripts/validate_gzh_html.py](scripts/validate_gzh_html.py)
- [UPSTREAM.md](UPSTREAM.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## 运行方式

直接用浏览器打开 [index.html](index.html) 即可。

建议：

- 日常编辑可直接双击打开
- 要验证复制、下载、存储行为时，优先用本地 HTTP 服务打开

例如：

```bash
python3 -m http.server 8765
```

然后访问：

```text
http://localhost:8765
```

如果要连同后端一起启动，先基于 `.env.example` 生成 `.env`，再执行：

```bash
cp .env.example .env
npm start
```

`npm start` 会通过 `node --env-file=.env server.mjs` 读取本地 `.env`。项目没有第三方 Node 运行依赖，无需先执行 `npm install`。

如果要用容器跑服务端，继续执行：

```bash
docker compose up --build
```

说明：

- 当前仓库已经包含 `server.mjs`、`package.json` 和最小 Node API
- `GET /api/health` 为公共健康检查
- `GET /api/ai/config` 为配置探针；仅在可写的本机模式下额外返回 `baseUrl`
- `PUT /api/ai/config` 只允许本机开发环境同源调用，用于更新当前项目的 `.env`
- `POST /api/ai/layout` 在配置了 `APP_ACCESS_TOKEN` 时要求 `Authorization: Bearer <token>`
- `file://` 直接打开时仍可完成大部分本地编辑，但浏览器可能限制剪贴板、下载与 IndexedDB 持久化

## AI 与安全边界

- 当前编辑器仍是本地优先；就算 AI 未配置，基础编辑、预览、导出也应继续可用
- 本地模式可从页面“AI 模型”一次性提交 `LLM_API_KEY`；它只写入服务端 `.env`，不会进入前端静态文件、localStorage 或接口响应
- `LLM_API_STYLE` 目前支持 `chat-completions` 和 `responses`
- `GET /api/ai/config` 绝不回传密钥或 token；生产环境也不会返回上游 URL
- 页面写配置仅在非生产环境、服务监听回环地址、请求来自回环客户端且 Origin 同源时开放；生产环境必须通过服务器环境变量管理
- `POST /api/ai/layout` 在设置了 `APP_ACCESS_TOKEN` 时必须带 Bearer token；`NODE_ENV=production` 时服务端强制要求配置 `APP_ACCESS_TOKEN`
- `LLM_BASE_URL`、`LLM_MODEL`、`LLM_TIMEOUT_MS`、`MAX_SOURCE_CHARS` 这类参数只应由服务端读取和裁剪

最小模型配置示例：

```dotenv
LLM_API_KEY=<由本地页面或服务器环境注入，勿提交仓库>
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_STYLE=responses
LLM_MODEL=gpt-4.1-mini
APP_ACCESS_TOKEN=<自行生成的编辑器访问令牌>
```

- 使用 OpenAI 官方接口时可选 `responses`
- 使用其他 OpenAI-compatible 网关时，若只兼容传统接口则选 `chat-completions`
- 本地启动后，可在页面顶部“AI 模型”里填写 Base URL、接口类型、模型名和供应商 API Key；保存成功后立即生效，不需要重启
- `APP_ACCESS_TOKEN` 不是模型 API Key；它用于保护你自己的 `/api/ai/layout`，需要时在“AI 模型”中按会话填写

## 验证

已落地的最小验证包括：

- `node tests/gzh-renderer.test.js`
- `python3 scripts/validate_gzh_html.py <rendered.html>`
- `docker compose config`
- `npm start`
- `curl -fsS http://127.0.0.1:3000/api/health`
- `curl -fsS http://127.0.0.1:3000/api/ai/config`
- `curl -fsS -X POST http://127.0.0.1:3000/api/ai/layout -H 'content-type: application/json' -H 'authorization: Bearer <APP_ACCESS_TOKEN>' --data '{\"source\":\"# 标题\"}'`

当前 14 个主题都纳入 JavaScript 回归测试，并逐个通过上游 Python 校验器，结果为 0 ERROR。

## 上游优先级

如果本地历史实现与 `gzh-design-skill` 冲突，以它的规则为准。具体记录见：

- [UPSTREAM.md](UPSTREAM.md)

## 许可

当前仓库按 AGPL-3.0-or-later 交付，原因是已经引入并改造了 `gzh-design-skill` 的受保护逻辑与校验器。

详见：

- [LICENSE](LICENSE)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
