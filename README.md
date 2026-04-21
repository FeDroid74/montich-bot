# Montich Bot

Stage 7 adds the first working learning flow from the PostgreSQL vocabulary.

## Included in this stage

- Learning card flow from the imported vocabulary
- User upsert on interaction with the bot
- Saving word progress after each answer
- Progress summary in the `Мой прогресс` section

## Commands

```bash
npm install
npm run build
npm run db:check
npm run db:migrate
npm run words:import -- /absolute/path/to/dictionary.txt
```

## Learning flow

1. Open the bot in Telegram.
2. Press `Учить сербский`.
3. Press `Показать перевод`.
4. Mark the card with `Знаю` or `Повторить`.
5. The bot sends the next card automatically.

`Мой прогресс` shows a short summary based on `user_word_progress`.
