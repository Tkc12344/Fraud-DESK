#!/bin/sh
set -eu
mkdir -p /app/data
if [ "$(id -u)" -eq 0 ]; then
  chown node:node /app/data
  exec runuser -u node -- node src/index.js
fi
exec node src/index.js
