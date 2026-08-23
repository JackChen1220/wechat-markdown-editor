# wechat-markdown-editor

一个面向本地单用户的微信公众号 Markdown 编辑器。

项目保留了原始 HTML 工作台的编辑体验，并整合 `gzh-design-skill` 的主题规范、微信公众号兼容规则与 canonical HTML 校验标准。预览、复制和导出始终共用同一份 renderer 输出。

## 当前能力

- 8 套原版经典配色：翡翠绿、经典蓝、科技紫、中国红、活力橙、清新青、玫瑰粉、黑金
- 6 套 `gzh-design` 特色版式：摸鱼绿、红白色系、石墨极简、留白禅意、摸鱼票据、橄榄手记
- 双阶段编辑：在“原始内容”中粘贴素材，由 AI 生成 Markdown；在“排版稿”中继续修改
- 两种 AI 排版方式：
  - `公众号改写`（默认）：理解素材后重组为适合公众号阅读的文章
  - `忠实整理`：尽量保留原文表达，只梳理层级与版式
- 多供应商模型配置：OpenAI、DeepSeek、Claude、Gemini、Moonshot、通义千问、智谱、MiniMax 与自定义供应商
- 本地 autosave：Markdown、原始内容、主题和编辑状态保存到浏览器本地存储
- 本地图片资产：优先用 IndexedDB 持久化，不可用时退化为当前会话内存
- 导出 Markdown、公众号正文 HTML、带复制按钮的预览页
- canonical 渲染器生成全内联、无 `div/class/id` 的公众号正文 HTML

## 本地启动

需要 Node.js 20 或更高版本。

推荐方式：在 Finder 中双击项目根目录的 `启动编辑器.command`。它会自动启动本地服务并打开浏览器；重复双击不会重复启动。

也可以在终端运行：

```bash
npm start
```

打开：

```text
http://127.0.0.1:3000
```

这是推荐且完整的使用方式。不需要登录，不需要预先创建 `.env`，当前仓库也没有需要先安装的第三方 Node 运行依赖。

当前版本只维护这条本地单机运行路径，不提供一键公网部署脚本。

也可以直接打开 `index.html`，但 `file://` 模式只提供基础编辑、预览和导出，不能配置或调用 AI；剪贴板、下载和 IndexedDB 还可能受到浏览器限制。

## 配置 AI 模型

启动本地服务后：

1. 点击页面顶部的“AI 模型”。
2. 选择供应商、接口协议、Base URL 和模型。
3. 填入 API Key，启用供应商并保存。
4. 选择“智能排版默认模型”；配置保存后立即生效。

模型配置加密保存在本机 `data/` 目录，不写入浏览器存储：

- `data/ai-config.enc.json`：加密后的供应商与模型配置
- `data/config.key`：本机自动生成的解密密钥

页面不会读取或回显真实 API Key。已配置时，输入框只显示圆点占位符：

- 输入框留空后保存：保留原 Key
- 输入新 Key 后保存：替换原 Key
- 点击“清除供应商密钥”并确认：显式清除

备份或迁移时必须将 `data/ai-config.enc.json` 和 `data/config.key` 成对备份；缺少任意一个都无法恢复配置。不要删除现有 `data/`，也不要把其中的文件提交到 Git 或同步到不可信位置。

## AI 排版链路

AI 只负责理解内容并生成编辑器支持的 Markdown 组件，不直接生成最终 HTML。

- `公众号改写`使用中文排版合同，根据内容选择 `HERO`、`PART`、`CHAPTER`、`FLOW`、`CASE`、`SUMMARY` 等组件
- `忠实整理`优先保留原文事实、措辞与顺序，避免无依据扩写
- 模型输出会先经过组件白名单、闭合关系和提示词泄漏检查
- 对可修复的格式错误最多自动修复一次，避免把模型分析过程或非法标签直接写入排版稿
- 最终公众号 HTML 始终由 `app/gzh-renderer.js` 生成，预览、复制和导出共用该结果

这些保护可以提高不同模型的稳定性，但不能保证所有供应商或模型都产生相同质量。仓库测试使用模拟响应，不代表真实供应商、账号额度、网络或具体模型已完成验证。

## 高级环境覆盖（可选）

日常使用不需要 `.env`。如需修改端口、数据目录、超时或输入长度，可参考 `.env.example`。

`npm start` 只执行 `node server.mjs`，不会自动加载 `.env`。需要显式加载时使用：

```bash
node --env-file=.env server.mjs
```

默认本地模式会自动生成 `data/config.key`。如果人为设置 `NODE_ENV=production`，则必须同时通过 `CONFIG_ENCRYPTION_KEY` 显式提供一个 32 字节密钥，否则服务会拒绝启动。`MODEL_PROVIDER_ALLOWED_HOSTS` 也只在该模式下生效。

本项目按本地单用户边界设计：服务只接受回环地址访问，并校验同源写请求。不要通过反向代理、端口映射或其他方式将它暴露到公网。

## 主要目录

- [index.html](index.html)：应用壳与页面结构
- [app/editor-app.js](app/editor-app.js)：编辑器交互、本地存储与 AI 配置 UI
- [app/gzh-themes.js](app/gzh-themes.js)：主题定义
- [app/gzh-renderer.js](app/gzh-renderer.js)：canonical WeChat HTML 渲染器
- [server.mjs](server.mjs)：本地 HTTP 服务与 API
- [server/ai-layout.mjs](server/ai-layout.mjs)：AI 排版合同、校验与模型调用
- [server/model-providers.mjs](server/model-providers.mjs)：多供应商协议与模型配置
- [server/local-config.mjs](server/local-config.mjs)：本机加密配置存储
- [scripts/validate_gzh_html.py](scripts/validate_gzh_html.py)：上游确定性 HTML 校验器
- [UPSTREAM.md](UPSTREAM.md)：上游整合记录

## 验证

```bash
npm test
python3 scripts/validate_gzh_html.py <rendered.html>
curl -fsS http://127.0.0.1:3000/api/health
```

当前 14 个主题均纳入 renderer 回归测试。真实微信公众号后台粘贴效果以及真实模型连接仍需使用者按自己的账号与网络环境人工验证。

## 上游优先级与许可

如果本地历史实现与 [`gzh-design-skill`](https://github.com/isjiamu/gzh-design-skill) 冲突，以上游规则为准。详见 [UPSTREAM.md](UPSTREAM.md)。

当前仓库按 AGPL-3.0-or-later 交付，详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
