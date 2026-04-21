# Montich Bot

Stage 6 adds vocabulary import from a plain text dictionary file.

## Included in this stage

- TXT dictionary parser for `сербское слово - русский перевод`
- PostgreSQL import script for admin vocabulary
- Import report with inserted, duplicated, and skipped rows

## Commands

```bash
npm install
npm run build
npm run db:check
npm run db:migrate
npm run words:import -- /absolute/path/to/dictionary.txt
```

## Supported TXT format

Each non-empty line should contain a Serbian entry and a Russian translation separated by `-`, `–`, or `—`.

Examples:

```text
Izbor - выбор
Izvinite sta kasnim - извините за опоздание
Razlika (!) - отличие/разница
Zahtevani [hardver] - нужное/необходимое [оборудование]
```

Blank lines are ignored.

Lines without a translation are skipped and reported.
