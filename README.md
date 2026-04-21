# Montich Bot

Stage 5 adds local PostgreSQL bootstrap scripts for the VPS development environment.

## Included in this stage

- Local PostgreSQL installation scripts under `scripts/postgres`
- Home-directory PostgreSQL layout for development on VPS
- Commands to initialize, start, stop, and inspect the local database

## Project structure

```text
src/
  app/
  bot/
  config/
  database/
  scripts/
scripts/
  postgres/
```

## Commands

```bash
npm install
npm run build
npm run dev
npm run db:check
npm run db:migrate
```

## Local PostgreSQL on VPS

Development PostgreSQL is installed into the home directory from Ubuntu packages and does not depend on OpenClaw paths.

```bash
./scripts/postgres/install-local-postgres.sh
./scripts/postgres/init-local-postgres.sh
./scripts/postgres/start-local-postgres.sh
npm run db:check
npm run db:migrate
```

Useful commands:

```bash
./scripts/postgres/status-local-postgres.sh
./scripts/postgres/stop-local-postgres.sh
```

## Environment

Copy `.env.example` to `.env` and fill in at least `BOT_TOKEN`.

Default local database URL:

```env
DATABASE_URL=postgresql://appuser@127.0.0.1:5433/montich_bot
```
