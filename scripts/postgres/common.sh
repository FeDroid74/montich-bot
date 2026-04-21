#!/usr/bin/env bash

set -euo pipefail

POSTGRES_VERSION="${POSTGRES_VERSION:-16}"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"
POSTGRES_USER="${POSTGRES_USER:-$(id -un)}"
POSTGRES_DB="${POSTGRES_DB:-montich_bot}"

POSTGRES_BASE_DIR="${POSTGRES_BASE_DIR:-$HOME/.local/montich/postgres}"
POSTGRES_DOWNLOAD_DIR="$POSTGRES_BASE_DIR/download"
POSTGRES_INSTALL_ROOT="$POSTGRES_BASE_DIR/extract"
POSTGRES_DATA_DIR="$POSTGRES_BASE_DIR/data"
POSTGRES_LOG_DIR="$POSTGRES_BASE_DIR/log"
POSTGRES_RUN_DIR="$POSTGRES_BASE_DIR/run"
POSTGRES_LOG_FILE="$POSTGRES_LOG_DIR/postgresql.log"
POSTGRES_MULTIARCH="$(gcc -print-multiarch 2>/dev/null || printf 'x86_64-linux-gnu')"
POSTGRES_BIN_DIR="$POSTGRES_INSTALL_ROOT/usr/lib/postgresql/$POSTGRES_VERSION/bin"
POSTGRES_LIB_DIR="$POSTGRES_INSTALL_ROOT/usr/lib/$POSTGRES_MULTIARCH"

export PATH="$POSTGRES_BIN_DIR:$PATH"
export LD_LIBRARY_PATH="$POSTGRES_LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

ensure_directories() {
  mkdir -p "$POSTGRES_DOWNLOAD_DIR" "$POSTGRES_INSTALL_ROOT" "$POSTGRES_LOG_DIR" "$POSTGRES_RUN_DIR"
}

require_binary() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf 'Required binary is missing: %s\n' "$name" >&2
    exit 1
  fi
}

print_settings() {
  printf 'PostgreSQL version: %s\n' "$POSTGRES_VERSION"
  printf 'PostgreSQL user: %s\n' "$POSTGRES_USER"
  printf 'PostgreSQL database: %s\n' "$POSTGRES_DB"
  printf 'PostgreSQL port: %s\n' "$POSTGRES_PORT"
  printf 'Base directory: %s\n' "$POSTGRES_BASE_DIR"
}
