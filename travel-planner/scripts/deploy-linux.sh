#!/usr/bin/env bash
# Isolated deployment: existing yeohaengit-web and its data are left in place.
set -euo pipefail
PORT="${1:-8001}"
ENV_FILE="${2:-/etc/yeohaengit/server.env}"
APP_URL="${3:-}"
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT >= 1024 && PORT <= 65535)) || { echo 'Port must be between 1024 and 65535.' >&2; exit 1; }
cd "$(dirname "$0")/.."
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
"${DOCKER[@]}" info >/dev/null
IMAGE="my-ai-lab:$(date -u +%Y%m%d%H%M%S)"
"${DOCKER[@]}" build -t "$IMAGE" .
NAME=my-ai-lab-web
BACKUP="${NAME}-previous-$(date -u +%Y%m%d%H%M%S)"
HAD_PREVIOUS=false
if "${DOCKER[@]}" inspect "$NAME" >/dev/null 2>&1; then
  "${DOCKER[@]}" stop "$NAME" >/dev/null
  "${DOCKER[@]}" rename "$NAME" "$BACKUP"
  HAD_PREVIOUS=true
fi
rollback(){
  "${DOCKER[@]}" rm -f "$NAME" >/dev/null 2>&1 || true
  if $HAD_PREVIOUS; then "${DOCKER[@]}" rename "$BACKUP" "$NAME"; "${DOCKER[@]}" start "$NAME" >/dev/null; fi
  echo 'Deployment failed; previous MY-AI-LAB container restored when present.' >&2
}
trap rollback ERR
ARGS=(run -d --name "$NAME" --restart unless-stopped -p "$PORT:8080" -v my-ai-lab-data:/data -e APP_DB_PATH=/data/app.sqlite -e APP_BACKUP_DIR=/data/backups)
if [[ -f "$ENV_FILE" ]] || sudo -n test -f "$ENV_FILE" 2>/dev/null; then ARGS+=(--env-file "$ENV_FILE"); fi
if [[ -n "$APP_URL" ]]; then ARGS+=(-e "PUBLIC_APP_URL=$APP_URL"); fi
"${DOCKER[@]}" "${ARGS[@]}" "$IMAGE" >/dev/null
READY=false
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/" | grep -q 'nationalRegion'; then READY=true; break; fi
  sleep 1
done
$READY || { echo 'Startup check failed.' >&2; false; }
trap - ERR
echo "MY-AI-LAB ready on port $PORT"
echo "Logs: sudo -n docker logs --tail 100 $NAME"
if $HAD_PREVIOUS; then echo "Previous container retained: $BACKUP"; fi
