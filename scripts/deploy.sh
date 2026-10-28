#!/usr/bin/env bash
# Pull main, fetch the image GitHub Actions built for that commit, and replace the running app container.
# Building on this server ran it out of memory and took down the other services, so it only pulls
# (.github/workflows/docker-image.yml builds and pushes ghcr.io/duchae/file-size:<sha>).
# Rollback: IMAGE_TAG=<previous full sha> docker compose -f compose.prod.yaml up -d app
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=ghcr.io/duchae/file-size

git pull --ff-only
export IMAGE_TAG="$(git rev-parse HEAD)"

# Right after a merge the Actions build may still be running (a few minutes), so wait for it.
for attempt in $(seq 1 30); do
  if out="$(docker pull -q "${IMAGE}:${IMAGE_TAG}" 2>&1)"; then
    break
  fi
  if grep -qiE "denied|unauthorized" <<<"$out"; then
    echo "$out" >&2
    echo "Log in once with a read:packages token: docker login ghcr.io -u DUChae" >&2
    exit 1
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "${IMAGE}:${IMAGE_TAG} not found after 10 minutes." >&2
    echo "Check https://github.com/DUChae/file-size/actions/workflows/docker-image.yml" >&2
    exit 1
  fi
  echo "waiting for the GitHub Actions build of ${IMAGE_TAG:0:7}... (${attempt}/30)"
  sleep 20
done

docker tag "${IMAGE}:${IMAGE_TAG}" "${IMAGE}:local"   # so a plain `up -d` without IMAGE_TAG still runs the latest deploy
docker compose -f compose.prod.yaml up -d

# Every deploy leaves a ~400MB image behind and they filled the shared server's disk.
# Keep this deploy and the one before it for rollback and drop the rest. Newest first in `docker images`.
docker images "${IMAGE}" --format '{{.Tag}}' \
  | grep -vxE "local|latest|${IMAGE_TAG}" \
  | tail -n +2 \
  | xargs -r -I{} docker rmi "${IMAGE}:{}" || true
docker image prune -f

docker compose -f compose.prod.yaml ps
echo "deployed ${IMAGE}:${IMAGE_TAG}"
