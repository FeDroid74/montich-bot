import type { Context, Telegraf } from "telegraf";
import type { LearningService } from "../../learning/service.js";
import { PhraseService } from "../../phrases/service.js";

export function registerPhraseHandlers(
  bot: Telegraf,
  learningService: LearningService,
  phraseService: PhraseService,
): void {
  bot.command("add_phrase", async (ctx) => {
    if (!ctx.from || !hasTextMessage(ctx)) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const payload = extractCommandArguments(ctx.message.text, "add_phrase");
    const parsedPhrase = parsePhrasePayload(payload);

    if (!parsedPhrase) {
      await ctx.reply("Использование: /add_phrase Dobar dan svima | добрый день всем");
      return;
    }

    const result = await phraseService.addPhrase(user.id, parsedPhrase.originalText, parsedPhrase.russianTranslation);

    if (result.status === "existing") {
      await ctx.reply([
        "Такая фраза уже есть в твоем списке.",
        formatPhrase(result.phrase),
      ].join("\n\n"));
      return;
    }

    await ctx.reply([
      "Фраза сохранена и добавлена в повторение.",
      formatPhrase(result.phrase),
    ].join("\n\n"));
  });

  bot.command("my_phrases", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const phrases = await phraseService.listPhrases(user.id);

    if (phrases.length === 0) {
      await ctx.reply("У тебя пока нет сохраненных фраз. Добавь первую через /add_phrase");
      return;
    }

    await ctx.reply([
      `Твои фразы: ${phrases.length}`,
      ...phrases.map((phrase) => `${phrase.id}. ${phrase.originalText} -> ${phrase.russianTranslation ?? "-"}`),
    ].join("\n"));
  });
}

function hasTextMessage(ctx: Context): ctx is Context & { message: { text: string } } {
  return Boolean(ctx.message && "text" in ctx.message);
}

function extractCommandArguments(text: string, commandName: string): string {
  return text.replace(new RegExp(`^/${commandName}(?:@\\w+)?\\s*`), "").trim();
}

function parsePhrasePayload(payload: string): { originalText: string; russianTranslation: string } | null {
  const parts = payload.split("|").map((part) => part.trim());

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    originalText: parts[0],
    russianTranslation: parts[1],
  };
}

function formatPhrase(phrase: { id: number; originalText: string; russianTranslation: string | null }): string {
  return [
    `ID: ${phrase.id}`,
    `Фраза: ${phrase.originalText}`,
    `Перевод: ${phrase.russianTranslation ?? "-"}`,
  ].join("\n");
}
