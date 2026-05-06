#!/usr/bin/env bash

set -euo pipefail

TARGET_TAG="${1:-}"

if [[ -z "$TARGET_TAG" ]]; then
  echo "用法：bash scripts/rollback.sh <image-tag>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IMAGE_TAG="$TARGET_TAG" bash "$SCRIPT_DIR/deploy.sh"
