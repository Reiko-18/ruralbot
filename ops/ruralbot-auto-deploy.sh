#!/usr/bin/env bash
set -euo pipefail

if [ -n "${RURALBOT_APP_DIR:-}" ]; then
  APP_DIR="${RURALBOT_APP_DIR}"
elif [ -d /opt/ruralbot ]; then
  APP_DIR="/opt/ruralbot"
else
  APP_DIR="/var/www/ruralbot"
fi
LOCK_FILE="/tmp/ruralbot-deploy.lock"
BRANCH="main"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "$(date -Is) deployment already running"
  exit 0
fi

cd "${APP_DIR}"

echo "$(date -Is) checking origin/${BRANCH}"
git fetch origin "${BRANCH}"

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/${BRANCH}")"

if [ "${LOCAL_HEAD}" = "${REMOTE_HEAD}" ]; then
  echo "$(date -Is) no changes"
  exit 0
fi

echo "$(date -Is) updating ${LOCAL_HEAD} -> ${REMOTE_HEAD}"
git pull --ff-only origin "${BRANCH}"

npm ci
npx prisma migrate deploy
npm run build

systemctl restart ruralbot
echo "$(date -Is) deployment completed"
