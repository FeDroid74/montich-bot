import type { Context, Telegraf } from "telegraf";
import type { LearningService, LearningUser } from "../../learning/service.js";
import { VocabularyService } from "../../vocabulary/service.js";

export function registerAdminDictionaryHandlers(
  bot: Telegraf,
  learningService: LearningService,
  vocabularyService: VocabularyService,
): void {
  bot.command("admin_words", async (ctx) => {
    const adminUser = await requireAdmin(ctx, learningService);

    if (!adminUser) {
      return;
    }

    await ctx.reply([
      "Команды словаря для администратора:",
      "1. Посмотреть список слов: /list_words",
      "2. Найти слово по тексту: /find_word izbor",
      "3. Посмотреть слово по ID: /word 12",
      "4. Добавить слово: /add_word Nova reč - новое слово",
      "5. Изменить слово: /edit_word 12 | Nova reč | новое слово",
      "6. Скрыть слово из обучения: /deactivate_word 12",
      "7. Вернуть слово в обучение: /activate_word 12",
      "Подсказка: сначала используй /list_words или /find_word, чтобы узнать ID слова.",
    ].join("\n"));
  });

  bot.command("list_words", async (ctx) => {
    const adminUser = await requireAdmin(ctx, learningService);

    if (!adminUser || !hasTextMessage(ctx)) {
      return;
    }

    const rawFilter = extractCommandArguments(ctx.message.text, "list_words").toLowerCase();
    const filter = rawFilter === "active" || rawFilter === "hidden" ? rawFilter : "all";
    const words = await vocabularyService.listWords(filter);

    if (words.length === 0) {
      await ctx.reply("Список слов пуст.");
      return;
    }

    const header = filter === "all"
      ? `Всего слов: ${words.length}`
      : filter === "active"
        ? `Активных слов: ${words.length}`
        : `Скрытых слов: ${words.length}`;

    const lines = words.map((word) => `${word.id}. ${word.serbianLatin} -> ${word.russianTranslation} [${word.isActive ? "активно" : "скрыто"}]`);
    const chunks = chunkLines([header, ...lines], 3300);

    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  });

  bot.command("find_word", async (ctx) => {
    const adminUser = await requireAdmin(ctx, learningService);

    if (!adminUser || !hasTextMessage(ctx)) {
      return;
    }

    const query = extractCommandArguments(ctx.message.text, "find_word");

    if (!query) {
      await ctx.reply("Использование: /find_word izbor");
      return;
    }

    const words = await vocabularyService.findWords(query);

    if (words.length === 0) {
      await ctx.reply("По запросу ничего не найдено.");
      return;
    }

    await ctx.reply([
      `Найдено слов: ${words.length}`,
      ...words.map((word) => `${word.id}. ${word.serbianLatin} -> ${word.russianTranslation} [${word.isActive ? "активно" : "скрыто"}]`),
    ].join("\n"));
  });

  bot.command("word", async (ctx) => {
    const adminUser = await requireAdmin(ctx, learningService);

    if (!adminUser || !hasTextMessage(ctx)) {
      return;
    }

    const rawId = extractCommandArguments(ctx.message.text, "word");
    const wordId = Number.parseInt(rawId, 10);

    if (!Number.isInteger(wordId)) {
      await ctx.reply("Использование: /word 12");
      return;
    }

    const word = await vocabularyService.getWordById(wordId);

    if (!word) {
      await ctx.reply("Слово с таким ID не найдено.");
      return;
    }

    await ctx.reply(formatWordDetails(word));
  });

  bot.command("add_word", async (ctx) => {
    const adminUser = await requireAdmin(ctx, learningService);

    if (!adminUser || !hasTextMessage(ctx)) {
      return;
    }

    const payload = extractCommandArguments(ctx.message.text, "add_word");
    const parsedEntry = parseWordPayload(payload);

    if (!parsedEntry) {
      await ctx.reply("Использование: /add_word Nova reč - новое слово");
      return;
    }

    const result = await vocabularyService.addAdminWord(parsedEntry.serbianLatin, parsedEntry.russianTranslation);

    if (result.status === "existing") {
      await ctx.reply([
        "Такое слово уже есть в словаре.",
        formatWordDetails(result.word),
      ].join("\n\n"));
      return;
    }

    await ctx.reply([
      "Слово добавлено.",
      formatWordDetails(result.word),
    ].join("\n\n"));
  });

  bot.command("edit_word", async (ctx) => {
    const adminUser = await requireAdmin(ctx, learningService);

    if (!adminUser || !hasTextMessage(ctx)) {
      return;
    }

    const payload = extractCommandArguments(ctx.message.text, "edit_word");
    const parsedUpdate = parseEditWordPayload(payload);

    if (!parsedUpdate) {
      await ctx.reply("Использование: /edit_word 12 | Nova reč | новое слово");
      return;
    }

    const updatedWord = await vocabularyService.updateWord(
      parsedUpdate.wordId,
      parsedUpdate.serbianLatin,
      parsedUpdate.russianTranslation,
    );

    if (!updatedWord) {
      await ctx.reply("Слово с таким ID не найдено.");
      return;
    }

    await ctx.reply([
      "Слово обновлено.",
      formatWordDetails(updatedWord),
    ].join("\n\n"));
  });

  bot.command("deactivate_word", async (ctx) => {
    await toggleWordActivity(ctx, learningService, vocabularyService, false);
  });

  bot.command("activate_word", async (ctx) => {
    await toggleWordActivity(ctx, learningService, vocabularyService, true);
  });
}

async function toggleWordActivity(
  ctx: Context,
  learningService: LearningService,
  vocabularyService: VocabularyService,
  isActive: boolean,
): Promise<void> {
  const adminUser = await requireAdmin(ctx, learningService);

  if (!adminUser || !hasTextMessage(ctx)) {
    return;
  }

  const commandName = isActive ? "activate_word" : "deactivate_word";
  const rawId = extractCommandArguments(ctx.message.text, commandName);
  const wordId = Number.parseInt(rawId, 10);

  if (!Number.isInteger(wordId)) {
    await ctx.reply(`Использование: /${commandName} 12`);
    return;
  }

  const updatedWord = await vocabularyService.setWordActive(wordId, isActive);

  if (!updatedWord) {
    await ctx.reply("Слово с таким ID не найдено.");
    return;
  }

  await ctx.reply([
    isActive ? "Слово снова активно в словаре." : "Слово скрыто из активного словаря.",
    formatWordDetails(updatedWord),
  ].join("\n\n"));
}

async function requireAdmin(
  ctx: Context,
  learningService: LearningService,
): Promise<LearningUser | null> {
  if (!ctx.from) {
    return null;
  }

  const user = await learningService.ensureUser(ctx.from);

  if (user.role !== "admin") {
    await ctx.reply("Команда доступна только администратору.");
    return null;
  }

  return user;
}

function hasTextMessage(
  ctx: Context,
): ctx is Context & { message: { text: string } } {
  return Boolean(ctx.message && "text" in ctx.message);
}

function extractCommandArguments(text: string, commandName: string): string {
  return text.replace(new RegExp(`^/${commandName}(?:@\\w+)?\\s*`), "").trim();
}

function parseWordPayload(payload: string): { serbianLatin: string; russianTranslation: string } | null {
  const separatorMatch = /\s*[\-–—]\s*/.exec(payload);

  if (!separatorMatch || separatorMatch.index < 1) {
    return null;
  }

  const serbianLatin = payload.slice(0, separatorMatch.index).trim();
  const russianTranslation = payload.slice(separatorMatch.index + separatorMatch[0].length).trim();

  if (!serbianLatin || !russianTranslation) {
    return null;
  }

  return { serbianLatin, russianTranslation };
}

function parseEditWordPayload(payload: string): { wordId: number; serbianLatin: string; russianTranslation: string } | null {
  const parts = payload.split("|").map((part) => part.trim());

  if (parts.length !== 3) {
    return null;
  }

  const wordId = Number.parseInt(parts[0], 10);

  if (!Number.isInteger(wordId) || !parts[1] || !parts[2]) {
    return null;
  }

  return {
    wordId,
    serbianLatin: parts[1],
    russianTranslation: parts[2],
  };
}

function formatWordDetails(word: {
  id: number;
  source: string;
  serbianLatin: string;
  russianTranslation: string;
  isActive: boolean;
  topic: string | null;
  exampleSentence: string | null;
}): string {
  return [
    `ID: ${word.id}`,
    `Статус: ${word.isActive ? "активно" : "скрыто"}`,
    `Источник: ${word.source}`,
    `Слово: ${word.serbianLatin}`,
    `Перевод: ${word.russianTranslation}`,
    `Тема: ${word.topic ?? "-"}`,
    `Пример: ${word.exampleSentence ?? "-"}`,
  ].join("\n");
}

function chunkLines(lines: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    const nextChunk = currentChunk ? `${currentChunk}\n${line}` : line;

    if (nextChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = line;
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
