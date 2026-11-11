#!/bin/sh
set -eu

export DATABASE_URL
DATABASE_URL=$(node -p '"postgresql://postgres:" + encodeURIComponent(process.env.PULSE_DB_PASSWORD) + "@db:5432/pulse?schema=public"')

if [ -z "${SESSION_SECRET:-}" ]; then
  umask 077
  if [ ! -s .pulse/session-secret ]; then
    openssl rand -hex 32 > .pulse/session-secret.tmp
    mv .pulse/session-secret.tmp .pulse/session-secret
  fi
  SESSION_SECRET=$(cat .pulse/session-secret)
  umask 022
fi
export SESSION_SECRET

./node_modules/.bin/prisma migrate deploy
if [ "$DEMO_MODE" = true ]; then
  ./node_modules/.bin/tsx prisma/seed.ts --if-empty
fi

exec ./node_modules/.bin/next start --hostname 0.0.0.0
