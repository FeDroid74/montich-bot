# Montich Bot

Stage 10 adds smarter session planning and the reminder foundation.

## Included in this stage

- Smarter word selection inside mini-sessions
- No repeated cards inside the same session
- Daily goal settings that control session size
- Reminder settings commands
- One-off reminder worker for cron-based scheduling

## New commands

```text
/settings
/goal 5
/goal 10
/reminder 20:00
/reminder_off
```

## Reminder worker

Run once manually:

```bash
npm run reminders:run-once
```

Later this command can be executed by cron every minute on the VPS.
