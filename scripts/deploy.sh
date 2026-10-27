#!/usr/bin/env bash
# Pull main, build the image on this server, and replace the running app container.
# Rollback: IMAGE_TAG=<previous sha> docker compose -f compose.prod.yaml up -d app
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
export IMAGE_TAG="$(git rev-parse --short HEAD)"

docker compose -f compose.prod.yaml build app
docker tag "file-size:${IMAGE_TAG}" file-size:local   # so a plain `up -d` without IMAGE_TAG still runs the latest deploy
docker compose -f compose.prod.yaml up -d

# Every deploy leaves a ~400MB file-size:<sha> behind and they filled the shared
# server's disk. These are built here (no registry), so keep this deploy and the
# one before it for rollback and drop the rest. Newest first in `docker images`.
docker images file-size --format '{{.Tag}}' \
  | grep -vxE "local|${IMAGE_TAG}" \
  | tail -n +2 \
  | xargs -r -I{} docker rmi "file-size:{}" || true
docker image prune -f

docker compose -f compose.prod.yaml ps
echo "deployed file-size:${IMAGE_TAG}"
