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
docker compose -f compose.prod.yaml ps
echo "deployed file-size:${IMAGE_TAG}"
