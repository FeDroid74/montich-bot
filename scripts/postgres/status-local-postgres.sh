#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

print_settings

if [ ! -f "$POSTGRES_DATA_DIR/PG_VERSION" ]; then
  printf 'Data directory is not initialized.\n'
  exit 0
fi

if "$POSTGRES_BIN_DIR/pg_ctl" -D "$POSTGRES_DATA_DIR" status >/dev/null 2>&1; then
  printf 'Server status: running\n'
  "$POSTGRES_BIN_DIR/pg_isready" -h 127.0.0.1 -p "$POSTGRES_PORT"
else
  printf 'Server status: stopped\n'
fi
