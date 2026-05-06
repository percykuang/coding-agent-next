# Coding Agent Next 生产部署手册

本文档记录 `coding-agent-next` 按照 `percy-site` 同款方式上线到共享服务器的约定。目标形态不是“把源码拷到服务器再手动跑”，而是：

- 代码推到 GitHub
- GitHub Actions 自动构建镜像并推送到镜像仓库
- GitHub Actions 通过 SSH 触发服务器上的 `deploy.sh`
- 服务器只保留部署目录、`.env.prod` 和运行中的容器

当前线上域名为 `coding.percy.ren`，并且与 `percy-site` 共用同一个公共 `edge-proxy`。

## 部署架构

```txt
DNS
  coding.percy.ren -> server ip

edge-proxy
  coding.percy.ren -> coding-agent-web:3000

coding-agent-next-prod
  server    apps/server Express + LangGraph
  web       apps/web Next.js
```

这里有两个关键点：

1. `deploy/compose.prod.yml` 不负责启动 Caddy / Nginx / Traefik。
2. 统一入口代理通过外部 Docker 网络 `edge` 访问 `coding-agent-web:3000`。

也就是说，这个仓库只部署自己的 `web` 和 `server`，不自己抢占 `80` / `443`。

## 当前仓库里的自动部署文件

已经补好的生产部署文件如下：

- [`.github/workflows/ci.yml`](/Users/percy/Desktop/coding-agent-next/.github/workflows/ci.yml)
- [`.github/workflows/deploy.yml`](/Users/percy/Desktop/coding-agent-next/.github/workflows/deploy.yml)
- [`deploy/compose.prod.yml`](/Users/percy/Desktop/coding-agent-next/deploy/compose.prod.yml)
- [`deploy/scripts/deploy.sh`](/Users/percy/Desktop/coding-agent-next/deploy/scripts/deploy.sh)
- [`deploy/scripts/rollback.sh`](/Users/percy/Desktop/coding-agent-next/deploy/scripts/rollback.sh)
- [`deploy/.env.prod.example`](/Users/percy/Desktop/coding-agent-next/deploy/.env.prod.example)

工作流逻辑是：

1. `CI` 在 `main` / PR 上执行 `pnpm check` 和 `pnpm build`。
2. `Deploy` 在 `main` 分支 CI 成功后自动触发，也支持手动触发。
3. `Deploy` 会构建并推送两个镜像：
   - `coding-agent-next-web`
   - `coding-agent-next-server`
4. 推送完成后，工作流通过 SSH 登录服务器，同步 `compose.prod.yml` 和脚本，再执行远程部署。

## 服务器前置条件

服务器需要满足这些条件：

- 已安装 Docker。
- 已安装 Docker Compose plugin。
- 已经有一个独立维护的公共 `edge-proxy`。
- `edge-proxy` 和本项目都可以加入同一个外部 Docker 网络 `edge`。

首次部署前，在服务器创建部署目录：

```bash
mkdir -p /opt/coding-agent-next/scripts
```

部署脚本会自动检查并创建外部网络：

```bash
docker network create edge
```

如果网络已存在，会直接复用。

## 生产环境变量

在服务器部署目录创建 `.env.prod`，不要提交到 Git。

首次上线前，`.env.prod` 需要你先手动创建，因为远程 `deploy.sh` 启动前就会检查它是否存在。建议做法是：本地打开 [`deploy/.env.prod.example`](/Users/percy/Desktop/coding-agent-next/deploy/.env.prod.example)，然后在服务器 `/opt/coding-agent-next/.env.prod` 手动写入对应内容。

后续每次发布时，`Deploy` workflow 也会把 `.env.prod.example` 同步到服务器部署目录，便于你在线上对照更新。

最少要确认这些值：

```env
IMAGE_NAMESPACE=registry.example.com/percy
IMAGE_TAG=main-latest
EDGE_NETWORK=edge

CORS_ORIGIN=https://coding.percy.ren
ENABLE_FIGMA_ROUTE=false
NEXT_PUBLIC_API_BASE_PATH=/api
NEXT_PUBLIC_ASSET_ORIGIN=
NEXT_PUBLIC_ENABLE_FIGMA_ROUTE=false

MAIN_MODEL_PROVIDER=mimo
VISION_MODEL_PROVIDER=mimo

MIMO_API_KEY=你的真实模型密钥
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.5-pro
MIMO_REASONER_MODEL=mimo-v2.5-pro
MIMO_VISION_MODEL=mimo-v2-omni
```

说明：

- `IMAGE_NAMESPACE` 是镜像仓库命名空间，例如 `ghcr.io/<your-name>` 或私有仓库路径。
- `IMAGE_TAG` 手动部署时有用；自动部署时会被 GitHub Actions 的 commit SHA 覆盖。
- `CORS_ORIGIN` 必须填最终公网域名。
- `ENABLE_FIGMA_ROUTE=false` 是后端真实开关。
- `NEXT_PUBLIC_ENABLE_FIGMA_ROUTE=false` 是前端提示开关。
- 模型相关密钥要填“真实密钥”，也就是你在线上实际要调用的供应商 API Key，不是示例值。

## Figma Beta 策略

当前线上 Beta 固定策略是：

```env
ENABLE_FIGMA_ROUTE=false
NEXT_PUBLIC_ENABLE_FIGMA_ROUTE=false
```

效果：

- 前端用户输入 Figma 链接时，会直接收到“不支持 Figma 直连转码”的提示。
- 后端不会进入 figma graph。

现在的生产工作流也会把 web 镜像按这个策略构建，所以线上不会误开 Figma。

## edge-proxy 配置要求

`edge-proxy` 只需要把域名转发到 `web` 容器，不需要直接代理 `server:7001`。

upstream 规则保持这一条就够了：

- `coding.percy.ren -> coding-agent-web:3000`

原因是 `apps/web` 已经通过 Next rewrite 把 `/api/:path*` 转发到内部 `server` 服务。

另外要确保代理层支持 SSE 长连接，不要对 `/api/chat` 做响应缓冲。

## GitHub Environments 和 Secrets

先在 GitHub 仓库创建生产环境：

```txt
Settings -> Environments -> New environment -> production
```

然后配置以下 secrets：

```txt
PROD_SSH_HOST
PROD_SSH_PORT
PROD_SSH_USER
PROD_SSH_PRIVATE_KEY
PROD_DEPLOY_PATH
REGISTRY_HOST
REGISTRY_NAMESPACE
REGISTRY_USERNAME
REGISTRY_PASSWORD
```

含义：

- `PROD_DEPLOY_PATH`：服务器部署目录，例如 `/opt/coding-agent-next`
- `REGISTRY_HOST`：镜像仓库域名，例如 `ghcr.io`
- `REGISTRY_NAMESPACE`：镜像命名空间
- `REGISTRY_USERNAME` / `REGISTRY_PASSWORD`：镜像仓库登录凭证
- `PROD_SSH_PRIVATE_KEY`：GitHub Actions 用来 SSH 到服务器的私钥

## 第一次上线，按这个顺序做

### 1. 把代码推到 GitHub

保证当前仓库已经有：

- `Dockerfile`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `deploy/compose.prod.yml`

然后把代码推到 `main`。

### 2. 准备镜像仓库凭证

你需要一个可从 GitHub Actions 推镜像的仓库。可以是：

- GitHub Container Registry
- 阿里云 ACR
- Docker Hub
- 其他私有 registry

把对应地址、用户名、密码填到上面的 GitHub secrets。

### 3. 在服务器准备部署目录

在服务器执行：

```bash
mkdir -p /opt/coding-agent-next/scripts
```

### 4. 在服务器创建 `.env.prod`

首次上线前，在服务器直接创建：

```txt
/opt/coding-agent-next/.env.prod
```

内容参考 [`deploy/.env.prod.example`](/Users/percy/Desktop/coding-agent-next/deploy/.env.prod.example)，然后把真实值填进去，尤其是：

- 模型 API Key
- `CORS_ORIGIN=https://coding.percy.ren`
- `ENABLE_FIGMA_ROUTE=false`
- `NEXT_PUBLIC_ENABLE_FIGMA_ROUTE=false`

### 5. 在 edge-proxy 里加域名路由

把：

```txt
coding.percy.ren -> coding-agent-web:3000
```

接到共享 `edge` 网络里的容器别名 `coding-agent-web`。

### 6. 触发部署

有两种方式：

- 推送到 `main`，让 `CI` 成功后自动触发 `Deploy`
- 在 GitHub Actions 页面手动执行 `Deploy`

### 7. 验证上线结果

发布后检查：

```bash
docker compose --project-name coding-agent-next-prod --env-file .env.prod -f compose.prod.yml ps
curl -I https://coding.percy.ren
curl http://127.0.0.1:7001/healthz
```

浏览器再验证这些能力：

- 首页可正常打开
- `react-ts` 模板能正常加载
- 文本生成网页正常
- 图片上传正常
- 输入 Figma 链接会收到 Beta 不支持提示

## 手动部署

如果你想在服务器上手动切换某个镜像 tag：

```bash
cd /opt/coding-agent-next
IMAGE_NAMESPACE=registry.example.com/percy IMAGE_TAG=<git-sha> bash scripts/deploy.sh
```

脚本会执行：

1. 拉取 `server` 和 `web` 镜像。
2. 等待 `server` 健康。
3. 启动 `web`。
4. 输出 compose 状态。

## 回滚

回滚到某个已经推送过的 tag：

```bash
cd /opt/coding-agent-next
bash scripts/rollback.sh <image-tag>
```

本质上就是把 `IMAGE_TAG` 切回旧值，再重新执行部署。

## 验收清单

最低验收项：

- `CI` 通过
- `Deploy` 通过
- `docker compose ps` 中 `web` 和 `server` 都是 healthy / running
- `https://coding.percy.ren` 正常访问
- `/api/template/react-ts` 正常返回
- `/api/chat` 流式返回正常
- `/api/upload/image` 正常
- Figma 路由在线上明确禁用

## 这次我已经本地验证过的内容

本次部署骨架改完后，我已经在本地跑过：

```bash
pnpm typecheck
pnpm build
```

两项都已通过。当前可以继续往前做 GitHub secrets、服务器 `.env.prod` 和 `edge-proxy` 配置。
