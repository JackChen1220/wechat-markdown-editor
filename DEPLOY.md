# 部署说明

## 1. 生产拓扑

推荐边界：

```text
article.lawyerworkbench.cloud:443
        ↓
宿主机 Nginx / TLS / 登录限速 / 安全响应头
        ↓
127.0.0.1:3000
        ↓
非 root Node 容器
        ↓
Docker 数据卷：AES-256-GCM 加密的供应商配置
```

服务器只需开放 80、443 和受限来源的 22；不要向公网开放 3000。

## 2. 首次安全配置

复制示例文件，并确保真实 `.env` 权限为 `0600`：

```bash
cp .env.example .env
chmod 600 .env
```

生产环境至少填写：

```dotenv
ADMIN_PASSWORD_HASH=<scrypt 哈希，不能填明文密码>
CONFIG_ENCRYPTION_KEY=<32 字节 Base64 或 64 位十六进制>
PUBLIC_ORIGIN=https://article.lawyerworkbench.cloud
TRUST_PROXY=true
DATA_DIR=/app/data
HOST=0.0.0.0
PORT=3000
PUBLISHED_PORT=3000
```

生成加密主密钥：

```bash
openssl rand -base64 32
```

生成管理员密码哈希时，不要把明文密码写入命令历史：

```bash
read -rsp "管理员密码: " ADMIN_PASSWORD; echo
ADMIN_PASSWORD="$ADMIN_PASSWORD" node --input-type=module -e 'import("./server/auth.mjs").then(async ({hashAdminPassword}) => process.stdout.write(await hashAdminPassword(process.env.ADMIN_PASSWORD)))'
unset ADMIN_PASSWORD
```

把输出的 `scrypt$...` 完整写入 `ADMIN_PASSWORD_HASH`。供应商 API Key 不写 `.env`；上线后登录网页，在“AI 模型”中配置。

如需自定义供应商，额外配置允许访问的 HTTPS 主机：

```dotenv
MODEL_PROVIDER_ALLOWED_HOSTS=api.example.com,gateway.example.net
```

## 3. 构建与启动

```bash
export IMAGE_TAG=<不可变版本号>
IMAGE_TAG="$IMAGE_TAG" docker compose build --pull
IMAGE_TAG="$IMAGE_TAG" docker compose up -d
docker compose ps
docker compose logs --tail=200
curl -fsS http://127.0.0.1:3000/api/health
```

Compose 会把容器端口只发布到宿主机 `127.0.0.1`，并把 `/app/data` 放在命名卷 `wechat-editor-data` 中。配置文件权限为 `0600`；加密主密钥必须独立保存在宿主机 `.env`。

## 4. Nginx 与 HTTPS

仓库提供两份生产配置：

- `deploy/nginx/article-rate-limit.conf`：放到 `/etc/nginx/conf.d/`
- `deploy/nginx/article.lawyerworkbench.cloud.conf`：放到 `/etc/nginx/sites-available/` 并链接到 `sites-enabled`

首次申请证书前，可先只启用 HTTP server block，确认 DNS 已指向服务器，然后执行：

```bash
sudo certbot --nginx -d article.lawyerworkbench.cloud
sudo nginx -t
sudo systemctl reload nginx
```

生产 Nginx 必须固定向应用传递：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
```

`PUBLIC_ORIGIN` 必须与最终 HTTPS Origin 完全一致，否则登录和所有写操作会被拒绝。

## 5. 发布对应源码包

页脚的“对应源码”下载地址是 `/source.tar.gz`。每次部署都必须从实际部署的 Git commit 生成归档，不能直接打包工作目录，否则既可能漏掉本次代码，也可能误带 `.env` 等忽略文件。

先提交发布版本，再在干净的仓库中执行：

```bash
DEPLOY_COMMIT="$(git rev-parse HEAD)"
git archive --format=tar.gz \
  --prefix=wechat-markdown-editor/ \
  --output="wechat-markdown-editor-source-${DEPLOY_COMMIT}.tar.gz" \
  "$DEPLOY_COMMIT"
```

上传归档并安装到 Nginx 配置指定的位置：

```bash
sudo install -d -m 0755 /var/www/article-source
sudo install -m 0644 \
  "wechat-markdown-editor-source-${DEPLOY_COMMIT}.tar.gz" \
  /var/www/article-source/wechat-markdown-editor-source.tar.gz
```

发布前确认归档至少包含许可证、第三方声明和本次认证/供应商源码：

```bash
tar -tzf "wechat-markdown-editor-source-${DEPLOY_COMMIT}.tar.gz" | \
  grep -E '(^|/)(LICENSE|THIRD_PARTY_NOTICES\.md|server/auth\.mjs|server/model-providers\.mjs|deploy/nginx/)'
```

## 6. 发布后验证

至少验证：

1. `GET /api/health` 返回 200。
2. 未登录的 `GET /api/ai/config` 返回 401。
3. 错误密码被拒绝，连续失败会触发 429。
4. 正确登录后可读取供应商列表，但响应中不存在完整 API Key。
5. 保存供应商后，密码框和 API Key 框不会回填旧值。
6. 容器重启后供应商配置仍存在，但登录会话失效。
7. OpenAI Compatible、Anthropic Compatible、Gemini Native 至少各有模拟测试覆盖；真实连接测试只在用户主动配置密钥后执行。
8. 基础编辑、主题切换、预览、复制和导出不依赖登录。
9. `GET /LICENSE` 和 `GET /source.tar.gz` 均返回 200，且下载的源码包可通过 `tar -tzf` 解压检查。

自动回归：

```bash
npm test
docker compose config --quiet
```

## 7. 密钥、备份与回滚

- `.env`：保存管理员密码哈希和加密主密钥，权限 `0600`，不要提交 Git。
- `wechat-editor-data`：保存加密后的供应商配置；备份必须与对应加密主密钥配套。
- 浏览器：稿件和图片主要保存在 localStorage/IndexedDB，服务器备份不能替代用户导出。
- 会话：默认空闲 30 分钟、最长 8 小时；服务重启后主动失效。

回滚时切回上一镜像 tag，不删除数据卷：

```bash
export IMAGE_TAG=<previous-good-tag>
IMAGE_TAG="$IMAGE_TAG" docker compose up -d
curl -fsS http://127.0.0.1:3000/api/health
```

不要把运行时数据卷、`.env` 或管理员密码加入源码发布包。
