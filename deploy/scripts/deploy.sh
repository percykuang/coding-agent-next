#!/usr/bin/env bash

set -euo pipefail

PROJECT_NAME="coding-agent-next-prod"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$DEPLOY_ROOT/compose.prod.yml"
ENV_FILE="$DEPLOY_ROOT/.env.prod"
IMAGE_TAG_VALUE="${1:-${IMAGE_TAG:-}}"
EDGE_NETWORK="${EDGE_NETWORK:-edge}"

if [[ -z "$IMAGE_TAG_VALUE" ]]; then
  echo "缺少 IMAGE_TAG。用法：IMAGE_TAG=<git_sha> bash scripts/deploy.sh" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE，请先在服务器上创建生产环境文件。" >&2
  exit 1
fi

export IMAGE_TAG="$IMAGE_TAG_VALUE"
if [[ -n "${IMAGE_NAMESPACE:-}" ]]; then
  export IMAGE_NAMESPACE
fi

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

if ! docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1; then
  echo "[deploy] 创建共享入口网络：$EDGE_NETWORK"
  docker network create "$EDGE_NETWORK"
fi

echo "[deploy] 拉取镜像..."
compose pull server web

echo "[deploy] 启动 server..."
compose up -d --wait server

echo "[deploy] 启动 web..."
compose up -d --remove-orphans --wait web

echo "[deploy] 当前状态："
compose ps

echo "[deploy] 发布完成，IMAGE_TAG=$IMAGE_TAG"
