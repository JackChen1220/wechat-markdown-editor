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
- 单管理员登录：未登录仍可使用基础编辑器，登录后才能配置或调用 AI
- 多供应商模型台：OpenAI、DeepSeek、Claude、Gemini、Moonshot、通义千问、智谱、MiniMax 与自定义供应商
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
- `GET /api/auth/session` 用于读取管理员会话状态
- 登录后的“AI 模型”可以管理多个供应商、模型和智能排版默认路由
- `GET/PUT /api/ai/config`、连接测试、模型刷新与 `POST /api/ai/layout` 均受管理员会话保护
- `file://` 直接打开时仍可完成大部分本地编辑，但浏览器可能限制剪贴板、下载与 IndexedDB 持久化

## AI 与安全边界

- 当前编辑器仍是本地优先；就算 AI 未配置，基础编辑、预览、导出也应继续可用
- 管理员会话使用 HttpOnly、SameSite=Strict Cookie，并叠加精确 Origin 与 CSRF 校验；前端 JavaScript 读不到会话 Cookie
- 管理员密码只以 scrypt 哈希存在于运行环境；模型 API Key 使用 AES-256-GCM 加密后写入独立数据卷
- 页面和接口只显示“已配置/未配置”，不会回传、回填或写入浏览器存储中的旧 API Key
- 支持 OpenAI Compatible、Anthropic Compatible 与 Gemini Native 三种调用协议；OpenAI 兼容协议还支持 `responses` 与 `chat-completions`
- 生产环境只允许内置供应商主机；自定义供应商必须额外加入 `MODEL_PROVIDER_ALLOWED_HOSTS`，所有上游请求拒绝重定向
- 模型配置保存后立即生效并持久化，容器重启后会从加密数据卷恢复，不再把供应商密钥写入 `.env`

最小运行安全配置示例：

```dotenv
ADMIN_PASSWORD_HASH=<scrypt 哈希，勿填明文密码>
CONFIG_ENCRYPTION_KEY=<32 字节 Base64 或 64 位十六进制密钥>
PUBLIC_ORIGIN=https://article.example.com
DATA_DIR=/app/data
TRUST_PROXY=true
```

- 首次部署只需要建立管理员密码哈希和加密主密钥；此后供应商、Base URL、协议、模型与 API Key 都在登录后的网页中管理
- 默认会话空闲 30 分钟失效，最长 8 小时；登录失败默认按来源地址限速
- 自定义供应商示例：`MODEL_PROVIDER_ALLOWED_HOSTS=api.example.com,gateway.example.net`

## 验证

已落地的最小验证包括：

- `node tests/gzh-renderer.test.js`
- `python3 scripts/validate_gzh_html.py <rendered.html>`
- `docker compose config`
- `npm start`
- `curl -fsS http://127.0.0.1:3000/api/health`
- 管理员登录、会话过期、CSRF、加密持久化、篡改检测、供应商连接与三协议调用均纳入 `npm test`

当前 14 个主题都纳入 JavaScript 回归测试，并逐个通过上游 Python 校验器，结果为 0 ERROR。

## 上游优先级

如果本地历史实现与 `gzh-design-skill` 冲突，以它的规则为准。具体记录见：

- [UPSTREAM.md](UPSTREAM.md)

## 许可

当前仓库按 AGPL-3.0-or-later 交付，原因是已经引入并改造了 `gzh-design-skill` 的受保护逻辑与校验器。

详见：

- [LICENSE](LICENSE)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
