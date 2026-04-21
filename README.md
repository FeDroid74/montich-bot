# Montich Bot

Stage 3 introduces the base application architecture for the Telegram bot.

## Included in this stage

- Modular app bootstrap layer
- Dedicated bot handlers and keyboards
- Centralized configuration loading and validation
- Database preparation layer with planned domain models
- `/health` output that reports runtime environment and database configuration state

## Project structure

```text
src/
  app/
  bot/
  config/
  database/
```

## Commands

```bash
npm install
npm run build
npm run dev
```

## Environment

Copy `.env.example` to `.env` and fill in at least `BOT_TOKEN`.

`DATABASE_URL` is optional at this stage. When omitted, the bot starts with the database layer marked as not configured.
