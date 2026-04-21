#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ensure_directories
require_binary apt
require_binary dpkg-deb

if [ -x "$POSTGRES_BIN_DIR/postgres" ]; then
  printf 'Local PostgreSQL is already installed in %s\n' "$POSTGRES_INSTALL_ROOT"
  exit 0
fi

print_settings

printf 'Downloading PostgreSQL Ubuntu packages...\n'
cd "$POSTGRES_DOWNLOAD_DIR"
rm -f postgresql-${POSTGRES_VERSION}_* postgresql-client-${POSTGRES_VERSION}_* libpq5_*
apt download postgresql-${POSTGRES_VERSION} postgresql-client-${POSTGRES_VERSION} libpq5 >/dev/null

printf 'Extracting PostgreSQL packages into %s...\n' "$POSTGRES_INSTALL_ROOT"
rm -rf "$POSTGRES_INSTALL_ROOT"/*
dpkg-deb -x postgresql-${POSTGRES_VERSION}_*_amd64.deb "$POSTGRES_INSTALL_ROOT"
dpkg-deb -x postgresql-client-${POSTGRES_VERSION}_*_amd64.deb "$POSTGRES_INSTALL_ROOT"
dpkg-deb -x libpq5_*_amd64.deb "$POSTGRES_INSTALL_ROOT"

printf 'Local PostgreSQL installed successfully.\n'
