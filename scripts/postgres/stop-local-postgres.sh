#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

if [ ! -f "$POSTGRES_DATA_DIR/PG_VERSION" ]; then
  printf 'PostgreSQL data directory is not initialized. Nothing to stop.\n'
  exit 0
fi

if "$POSTGRES_BIN_DIR/pg_ctl" -D "$POSTGRES_DATA_DIR" status >/dev/null 2>&1; then
  "$POSTGRES_BIN_DIR/pg_ctl" -D "$POSTGRES_DATA_DIR" stop >/dev/null
  printf 'PostgreSQL stopped.\n'
else
  printf 'PostgreSQL is not running.\n'
fi
