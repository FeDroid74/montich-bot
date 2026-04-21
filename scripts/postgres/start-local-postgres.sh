#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ensure_directories

if [ ! -f "$POSTGRES_DATA_DIR/PG_VERSION" ]; then
  printf 'PostgreSQL data directory is not initialized. Run init-local-postgres.sh first.\n' >&2
  exit 1
fi

if "$POSTGRES_BIN_DIR/pg_ctl" -D "$POSTGRES_DATA_DIR" status >/dev/null 2>&1; then
  printf 'PostgreSQL is already running.\n'
else
  printf 'Starting PostgreSQL on port %s...\n' "$POSTGRES_PORT"
  "$POSTGRES_BIN_DIR/pg_ctl" -D "$POSTGRES_DATA_DIR" -l "$POSTGRES_LOG_FILE" start >/dev/null
fi

if ! "$POSTGRES_BIN_DIR/pg_isready" -h 127.0.0.1 -p "$POSTGRES_PORT" >/dev/null 2>&1; then
  printf 'PostgreSQL did not become ready in time.\n' >&2
  exit 1
fi

if ! "$POSTGRES_BIN_DIR/psql" -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -tAc "select 1 from pg_database where datname = '$POSTGRES_DB'" | grep -q 1; then
  printf 'Creating database %s...\n' "$POSTGRES_DB"
  "$POSTGRES_BIN_DIR/createdb" -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB"
fi

printf 'PostgreSQL is ready.\n'
