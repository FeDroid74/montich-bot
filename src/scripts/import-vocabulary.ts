import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { appConfig } from "../config/app-config.js";
import { createDatabaseAdapter } from "../database/database.js";
import { parseDictionaryText } from "../vocabulary/parse-dictionary.js";

interface ExistingWordRow {
  id: number;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Usage: npm run words:import -- /absolute/path/to/dictionary.txt");
  }

  const database = createDatabaseAdapter(appConfig.database);

  if (!database.isConfigured()) {
    throw new Error("DATABASE_URL не задана. Сначала настрой подключение к PostgreSQL.");
  }

  const resolvedPath = resolve(inputPath);
  const fileContents = await readFile(resolvedPath, "utf8");
  const parsedDictionary = parseDictionaryText(fileContents);

  let insertedCount = 0;
  let duplicateCount = 0;

  try {
    await database.initialize();

    await database.transaction(async (client) => {
      for (const entry of parsedDictionary.entries) {
        const existingWord = await client.query<ExistingWordRow>(
          `
            select id
            from vocabulary_words
            where source = 'admin'
              and created_by_user_id is null
              and serbian_latin = $1
              and russian_translation = $2
            limit 1
          `,
          [entry.serbianLatin, entry.russianTranslation],
        );

        if (existingWord.rowCount && existingWord.rowCount > 0) {
          duplicateCount += 1;
          continue;
        }

        await client.query(
          `
            insert into vocabulary_words (
              source,
              created_by_user_id,
              serbian_latin,
              russian_translation,
              topic,
              example_sentence
            ) values ('admin', null, $1, $2, null, null)
          `,
          [entry.serbianLatin, entry.russianTranslation],
        );

        insertedCount += 1;
      }
    });
  } finally {
    await database.close();
  }

  console.log(`Импорт завершен: ${resolvedPath}`);
  console.log(`Добавлено слов: ${insertedCount}`);
  console.log(`Пропущено дубликатов: ${duplicateCount}`);
  console.log(`Пропущено некорректных строк: ${parsedDictionary.skippedLines.length}`);

  if (parsedDictionary.skippedLines.length > 0) {
    console.log("Некорректные строки:");

    for (const skippedLine of parsedDictionary.skippedLines.slice(0, 20)) {
      console.log(`- [${skippedLine.lineNumber}] ${skippedLine.reason}: ${skippedLine.rawLine}`);
    }

    if (parsedDictionary.skippedLines.length > 20) {
      console.log(`... и еще ${parsedDictionary.skippedLines.length - 20} строк`);
    }
  }
}

void main().catch((error) => {
  console.error("Импорт слов завершился ошибкой.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
