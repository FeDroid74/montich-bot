#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ensure_directories

if [ ! -x "$POSTGRES_BIN_DIR/initdb" ]; then
  printf 'PostgreSQL is not installed yet. Run install-local-postgres.sh first.\n' >&2
  exit 1
fi

if [ -f "$POSTGRES_DATA_DIR/PG_VERSION" ]; then
  printf 'PostgreSQL data directory is already initialized: %s\n' "$POSTGRES_DATA_DIR"
  exit 0
fi

printf 'Initializing PostgreSQL data directory...\n'
mkdir -p "$POSTGRES_DATA_DIR"
"$POSTGRES_BIN_DIR/initdb" \
  --username="$POSTGRES_USER" \
  --auth-local=trust \
  --auth-host=trust \
  --pgdata="$POSTGRES_DATA_DIR" >/dev/null

cat >>"$POSTGRES_DATA_DIR/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $POSTGRES_PORT
unix_socket_directories = '$POSTGRES_RUN_DIR'
EOF

printf 'PostgreSQL data directory initialized.\n'
