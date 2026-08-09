# 部署说明

## 1. 适用边界

本文档覆盖的运行边界是：

- 单机 Linux
- Docker Engine + Docker Compose
- 一个 Node 服务进程：`node server.mjs`
- 宿主机 Nginx 做 HTTPS 终止与反向代理

当前仓库里**已确认**的事实：

- 前端静态资源存在：`index.html`、`app/`、`vendor/`
- 后端入口存在：`server.mjs`
- 运行脚本存在：`npm start`，实际执行 `node --env-file=.env server.mjs`
- 已有本地测试：`node tests/gzh-renderer.test.js`
- 服务会读取 `.env` 中的 `HOST`、`PORT`、`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_API_STYLE`、`LLM_MODEL`、`LLM_TIMEOUT_MS`、`MAX_SOURCE_CHARS`、`APP_ACCESS_TOKEN`
- `GET /api/health` 为公共健康检查
- `GET /api/ai/config` 为公共配置探针，只返回安全元数据
- `PUT /api/ai/config` 仅在非生产、回环监听、回环客户端且同源请求时开放；生产环境不可从页面写 `.env`
- `POST /api/ai/layout` 在配置了 `APP_ACCESS_TOKEN` 时要求 Bearer token
- `NODE_ENV=production` 时若未配置 `APP_ACCESS_TOKEN`，服务端会拒绝启动

## 2. 最小安全方案

选择的最小方案是：

- 用一个非 root 的 Node 容器承载应用
- 用 `docker-compose.yml` 管理启动参数与健康检查
- 容器端口只发布到宿主机 `127.0.0.1`，不直接暴露到公网
- 用宿主机 Nginx 统一处理 80/443 与证书
- 用 `IMAGE_TAG` 固定镜像版本，保留明确回滚点

这样做的原因：

- 改动面最小，不要求重写发布平台
- 回滚只需要切回上一个镜像 tag
- LLM 密钥只留在服务端 `.env`，不进入静态前端构建产物
- 生产环境借由 `APP_ACCESS_TOKEN` 保住 AI 写作入口，不把匿名调用暴露到公网

## 3. 部署前检查

1. 准备环境变量。

   以 `.env.example` 为模板生成 `.env`，至少补齐：

   - `HOST=0.0.0.0`
   - `PORT=3000`
   - `LLM_BASE_URL=...`
   - `LLM_API_KEY=...`
   - `LLM_API_STYLE=chat-completions` 或 `responses`
   - `LLM_MODEL=...`
   - `LLM_TIMEOUT_MS=...`
   - `MAX_SOURCE_CHARS=...`
   - `APP_ACCESS_TOKEN=...`

   Compose 会把容器内 `HOST` 固定为 `0.0.0.0`，同时只把发布端口绑定到宿主机回环地址。腾讯云安全组无需、也不应开放 3000 端口。

   说明：

   - 本地开发可以不设 `APP_ACCESS_TOKEN`，此时 `/api/ai/layout` 不鉴权
   - 生产部署必须提供非空 `APP_ACCESS_TOKEN`

2. 先做本地静态与功能检查。

   ```bash
   node tests/gzh-renderer.test.js
   npm start
   docker compose config
   ```

3. 确认后端契约。

   在上线前必须确认：

   - `npm start` 能正常启动并读取 `.env`
   - `GET /api/health` 返回 200
   - `GET /api/ai/config` 返回 200，且只包含安全元数据
   - `POST /api/ai/layout` 在配置 `APP_ACCESS_TOKEN` 时对缺失或错误 Bearer token 返回 401
   - 服务端是否真的会托管当前静态文件

## 4. 构建与发布

1. 选择一个不可变镜像 tag。

   示例：

   ```bash
   export IMAGE_TAG=20260809-1
   ```

2. 构建镜像。

   ```bash
   IMAGE_TAG=$IMAGE_TAG docker compose build --pull
   ```

3. 启动或更新服务。

   ```bash
   IMAGE_TAG=$IMAGE_TAG docker compose up -d
   ```

4. 检查容器状态。

   ```bash
   docker compose ps
   docker compose logs --tail=200
   ```

5. 检查健康接口。

   ```bash
   curl -fsS http://127.0.0.1:${PUBLISHED_PORT:-3000}/api/health
   curl -fsS http://127.0.0.1:${PUBLISHED_PORT:-3000}/api/ai/config
   ```

## 5. Nginx HTTPS 反向代理

在宿主机为站点放置一个独立 server block。把下面占位符替换成你的实际域名、证书路径和容器发布端口。

```nginx
server {
    listen 80;
    server_name <your-domain>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <your-domain>;

    ssl_certificate     <fullchain.pem>;
    ssl_certificate_key <privkey.pem>;

    location / {
        proxy_pass http://127.0.0.1:<published_port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

应用配置后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 6. 发布后验证

正常路径至少验证这四项：

1. `curl -I https://<your-domain>/` 返回 200 或 304
2. `curl -fsS https://<your-domain>/api/health` 返回 200
3. `curl -fsS https://<your-domain>/api/ai/config` 返回 200，且不含密钥
4. 打开页面后，基础编辑、预览、导出不报错

AI 路径额外验证：

- 确认 `POST /api/ai/layout` 在未携带或携带错误 `Authorization: Bearer <token>` 时返回 401
- 确认 `POST /api/ai/layout` 在携带正确 Bearer token 时返回 200
- 确认生产环境的 `LLM_API_KEY` 只由服务器环境变量注入，不出现在前端源码或接口响应里
- 确认 `LLM_API_STYLE` 按预期连接到 `/chat/completions` 或 `/responses`

## 7. 失败路径与回滚

### 常见失败路径

- 容器启动失败：通常是端口冲突、`.env` 缺值，或生产环境漏配 `APP_ACCESS_TOKEN`
- 健康检查失败：通常是服务未监听 `PORT`，或 Nginx/容器转发到了错误端口
- AI 接口 401：通常是 `APP_ACCESS_TOKEN` 已启用但请求未带正确 Bearer token
- 反代失败：通常是 Nginx 端口填错，或宿主机防火墙未放行 80/443

### 回滚步骤

1. 记录当前失败版本：

   ```bash
   docker compose ps
   docker compose logs --tail=200
   ```

2. 切回上一个可用镜像 tag：

   ```bash
   export IMAGE_TAG=<previous-good-tag>
   IMAGE_TAG=$IMAGE_TAG docker compose up -d
   ```

3. 重新验证：

   ```bash
   curl -fsS http://127.0.0.1:${PUBLISHED_PORT:-3000}/api/health
   curl -fsS http://127.0.0.1:${PUBLISHED_PORT:-3000}/api/ai/config
   curl -I https://<your-domain>/
   ```

回滚前不要改动数据库或持久化格式。当前仓库没有发现明确的 schema/data migration，因此默认策略是先避免引入不可逆迁移。

## 8. 仍需补齐的信息

部署前还需要用户或后端实现方提供：

- 生产域名
- 证书获取方式
- 宿主机开放端口与防火墙策略
- 是否需要日志目录、上传目录或其他持久化卷
- 生产环境的 `APP_ACCESS_TOKEN` 注入方式
