# Montich Bot

Stage 4 adds a real PostgreSQL integration layer and the initial migration flow.

## Included in this stage

- Real `pg` connection adapter
- Database health initialization on app startup
- Migration scripts for the initial schema
- Domain schema for users, vocabulary, progress, custom sentences, FAQ, and files

## Project structure

```text
src/
  app/
  bot/
  config/
  database/
    migrations/
  scripts/
```

## Commands

```bash
npm install
npm run build
npm run dev
npm run db:check
npm run db:migrate
```

## Environment

Copy `.env.example` to `.env` and fill in at least `BOT_TOKEN`.

`DATABASE_URL` is optional while the database is not ready yet. Once PostgreSQL is available, set for example:

```env
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/montich_bot
```

Then run:

```bash
npm run db:check
npm run db:migrate
```
