import type { DatabaseAdapter } from "../database/database.js";
import type { CustomSentence, UserRole, WordProgressState } from "../database/models.js";

const DEFAULT_TIMEZONE = "Europe/Belgrade";

export interface TelegramIdentity {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}

export interface LearningUser {
  id: number;
  telegramId: number;
  role: UserRole;
}

export interface LearningWordItem {
  kind: "word";
  itemId: number;
  serbianLatin: string;
  russianTranslation: string;
  progressState: WordProgressState | null;
}

export interface LearningPhraseItem {
  kind: "phrase";
  itemId: number;
  serbianText: string;
  russianTranslation: string;
  correctedText: string | null;
}

export type LearningItem = LearningWordItem | LearningPhraseItem;

export interface ProgressSummary {
  totalWords: number;
  trackedWords: number;
  activeWords: number;
  masteredWords: number;
  dueWords: number;
}

export interface TranslationCheckResult {
  isCorrect: boolean;
  acceptedVariants: string[];
}

export interface LearningSettings {
  dailyGoalMinutes: number;
  reminderTime: string | null;
  reminderIntervalDays: number;
  timezone: string;
  lastRemindedAt: Date | null;
}

export interface ReminderRecipient {
  userId: number;
  telegramId: number;
  dailyGoalMinutes: number;
  reminderTime: string;
  reminderIntervalDays: number;
  timezone: string;
  lastRemindedAt: Date | null;
}

interface LearningUserRow {
  id: number;
  telegram_id: number;
  role: UserRole;
}

interface LearningWordRow {
  word_id: number;
  serbian_latin: string;
  russian_translation: string;
  progress_state: WordProgressState | null;
}

interface LearningPhraseRow {
  id: number;
  original_text: string;
  corrected_text: string | null;
  russian_translation: string;
}

interface WordProgressRow {
  state: WordProgressState;
  correct_answers: number;
  wrong_answers: number;
}

interface PhraseProgressRow {
  correct_answers: number;
  wrong_answers: number;
}

interface ProgressSummaryRow {
  total_words: number;
  tracked_words: number;
  active_words: number;
  mastered_words: number;
  due_words: number;
}

interface LearningSettingsRow {
  daily_goal_minutes: number;
  reminder_time: string | null;
  reminder_interval_days: number;
  timezone: string | null;
  last_reminded_at: Date | null;
}

interface ReminderRecipientRow {
  user_id: number;
  telegram_id: number;
  daily_goal_minutes: number;
  reminder_time: string;
  reminder_interval_days: number;
  timezone: string | null;
  last_reminded_at: Date | null;
}

export type LearningAnswer = "known" | "again";

export class LearningService {
  public constructor(
    private readonly database: DatabaseAdapter,
    private readonly adminTelegramId: number | null,
  ) {}

  public async ensureUser(identity: TelegramIdentity): Promise<LearningUser> {
    const role: UserRole = this.adminTelegramId === identity.id ? "admin" : "student";

    const result = await this.database.query<LearningUserRow>(
      `
        insert into users (
          telegram_id,
          username,
          first_name,
          last_name,
          role
        ) values ($1, $2, $3, $4, $5)
        on conflict (telegram_id)
        do update set
          username = excluded.username,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          role = excluded.role
        returning id, telegram_id, role
      `,
      [identity.id, identity.username ?? null, identity.first_name, identity.last_name ?? null, role],
    );

    const row = result.rows[0];
    await this.ensureUserSettings(row.id);

    return {
      id: row.id,
      telegramId: row.telegram_id,
      role: row.role,
    };
  }

  public async getSessionDurationMinutes(userId: number): Promise<number> {
    const settings = await this.getUserSettings(userId);
    return normalizeStudyMinutes(settings.dailyGoalMinutes);
  }

  public async getNextItem(userId: number, excludedItemKeys: string[] = []): Promise<LearningItem | null> {
    const excludedPhraseIds = extractExcludedIds(excludedItemKeys, "phrase");
    const nextPhrase = await this.getNextPhrase(userId, excludedPhraseIds);

    if (nextPhrase) {
      return nextPhrase;
    }

    const excludedWordIds = extractExcludedIds(excludedItemKeys, "word");
    return this.getNextWord(userId, excludedWordIds);
  }

  public async registerAnswer(userId: number, item: LearningItem, answer: LearningAnswer): Promise<void> {
    if (item.kind === "word") {
      await this.registerWordAnswer(userId, item.itemId, answer);
      return;
    }

    await this.registerPhraseAnswer(userId, item.itemId, answer);
  }

  public async getProgressSummary(userId: number): Promise<ProgressSummary> {
    const result = await this.database.query<ProgressSummaryRow>(
      `
        select
          (select count(*)::int from vocabulary_words where source = 'admin' and is_active = true) as total_words,
          (select count(*)::int from user_word_progress where user_id = $1) as tracked_words,
          (select count(*)::int from user_word_progress where user_id = $1 and state in ('new', 'learning', 'review')) as active_words,
          (select count(*)::int from user_word_progress where user_id = $1 and state = 'mastered') as mastered_words,
          (select count(*)::int from user_word_progress where user_id = $1 and next_review_at is not null and next_review_at <= now()) as due_words
      `,
      [userId],
    );

    const row = result.rows[0];

    return {
      totalWords: row.total_words,
      trackedWords: row.tracked_words,
      activeWords: row.active_words,
      masteredWords: row.mastered_words,
      dueWords: row.due_words,
    };
  }

  public async getUserSettings(userId: number): Promise<LearningSettings> {
    await this.ensureUserSettings(userId);

    const result = await this.database.query<LearningSettingsRow>(
      `
        select
          daily_goal_minutes,
          reminder_time,
          reminder_interval_days,
          timezone,
          last_reminded_at
        from user_settings
        where user_id = $1
        limit 1
      `,
      [userId],
    );

    const row = result.rows[0];

    return {
      dailyGoalMinutes: row.daily_goal_minutes,
      reminderTime: row.reminder_time,
      reminderIntervalDays: row.reminder_interval_days,
      timezone: row.timezone ?? DEFAULT_TIMEZONE,
      lastRemindedAt: row.last_reminded_at,
    };
  }

  public async updateDailyGoal(userId: number, dailyGoalMinutes: number): Promise<LearningSettings> {
    await this.ensureUserSettings(userId);

    const normalizedMinutes = normalizeStudyMinutes(dailyGoalMinutes);

    await this.database.query(
      `
        update user_settings
        set daily_goal_minutes = $2,
            updated_at = now()
        where user_id = $1
      `,
      [userId, normalizedMinutes],
    );

    return this.getUserSettings(userId);
  }

  public async setReminder(userId: number, reminderTime: string): Promise<LearningSettings> {
    await this.ensureUserSettings(userId);

    await this.database.query(
      `
        update user_settings
        set reminder_time = $2,
            timezone = coalesce(timezone, $3),
            updated_at = now()
        where user_id = $1
      `,
      [userId, reminderTime, DEFAULT_TIMEZONE],
    );

    return this.getUserSettings(userId);
  }

  public async updateReminderInterval(userId: number, reminderIntervalDays: number): Promise<LearningSettings> {
    await this.ensureUserSettings(userId);

    const normalizedInterval = normalizeReminderIntervalDays(reminderIntervalDays);

    await this.database.query(
      `
        update user_settings
        set reminder_interval_days = $2,
            updated_at = now()
        where user_id = $1
      `,
      [userId, normalizedInterval],
    );

    return this.getUserSettings(userId);
  }

  public async disableReminder(userId: number): Promise<LearningSettings> {
    await this.ensureUserSettings(userId);

    await this.database.query(
      `
        update user_settings
        set reminder_time = null,
            updated_at = now()
        where user_id = $1
      `,
      [userId],
    );

    return this.getUserSettings(userId);
  }

  public async getReminderRecipients(now: Date): Promise<ReminderRecipient[]> {
    const result = await this.database.query<ReminderRecipientRow>(
      `
        select
          us.user_id,
          u.telegram_id,
          us.daily_goal_minutes,
          us.reminder_time,
          us.reminder_interval_days,
          us.timezone,
          us.last_reminded_at
        from user_settings us
        inner join users u on u.id = us.user_id
        where us.reminder_time is not null
        order by us.user_id
      `,
    );

    return result.rows
      .map((row) => ({
        userId: row.user_id,
        telegramId: row.telegram_id,
        dailyGoalMinutes: row.daily_goal_minutes,
        reminderTime: row.reminder_time,
        reminderIntervalDays: row.reminder_interval_days,
        timezone: row.timezone ?? DEFAULT_TIMEZONE,
        lastRemindedAt: row.last_reminded_at,
      }))
      .filter((recipient) => shouldSendReminder(recipient, now));
  }

  public async markReminderSent(userId: number, sentAt: Date): Promise<void> {
    await this.database.query(
      `
        update user_settings
        set last_reminded_at = $2,
            updated_at = now()
        where user_id = $1
      `,
      [userId, sentAt],
    );
  }

  public checkTranslationAnswer(answer: string, expectedTranslation: string): TranslationCheckResult {
    const normalizedAnswer = normalizeTranslationFragment(answer);
    const acceptedVariants = extractAcceptedTranslations(expectedTranslation);

    return {
      isCorrect: normalizedAnswer.length > 0 && acceptedVariants.includes(normalizedAnswer),
      acceptedVariants,
    };
  }

  private async ensureUserSettings(userId: number): Promise<void> {
    await this.database.query(
      `
        insert into user_settings (
          user_id,
          reminder_time,
          reminder_interval_days,
          timezone,
          daily_goal_minutes
        ) values ($1, null, 1, $2, 10)
        on conflict (user_id) do nothing
      `,
      [userId, DEFAULT_TIMEZONE],
    );
  }

  private async getNextWord(userId: number, excludedWordIds: number[]): Promise<LearningWordItem | null> {
    const result = await this.database.query<LearningWordRow>(
      `
        select
          vw.id as word_id,
          vw.serbian_latin,
          vw.russian_translation,
          uwp.state as progress_state
        from vocabulary_words vw
        left join user_word_progress uwp
          on uwp.word_id = vw.id
         and uwp.user_id = $1
        where vw.source = 'admin'
          and vw.is_active = true
          and not (vw.id = any($2::bigint[]))
        order by
          case
            when uwp.next_review_at is not null and uwp.next_review_at <= now() then 0
            when uwp.state in ('learning', 'new') then 1
            when uwp.user_id is null then 2
            when uwp.state = 'review' then 3
            else 4
          end,
          case
            when uwp.next_review_at is not null and uwp.next_review_at <= now() then uwp.next_review_at
            when uwp.state in ('learning', 'new', 'review') then coalesce(uwp.next_review_at, now())
            else null
          end nulls last,
          random(),
          vw.id
        limit 1
      `,
      [userId, excludedWordIds],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      kind: "word",
      itemId: row.word_id,
      serbianLatin: row.serbian_latin,
      russianTranslation: row.russian_translation,
      progressState: row.progress_state,
    };
  }

  private async getNextPhrase(userId: number, excludedPhraseIds: number[]): Promise<LearningPhraseItem | null> {
    const result = await this.database.query<LearningPhraseRow>(
      `
        select
          id,
          original_text,
          corrected_text,
          russian_translation
        from custom_sentences
        where user_id = $1
          and is_active = true
          and russian_translation is not null
          and not (id = any($2::bigint[]))
          and (scheduled_review_at is null or scheduled_review_at <= now())
        order by coalesce(scheduled_review_at, created_at), id
        limit 1
      `,
      [userId, excludedPhraseIds],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      kind: "phrase",
      itemId: row.id,
      serbianText: row.corrected_text ?? row.original_text,
      russianTranslation: row.russian_translation,
      correctedText: row.corrected_text,
    };
  }

  private async registerWordAnswer(userId: number, wordId: number, answer: LearningAnswer): Promise<void> {
    const now = new Date();
    const progressResult = await this.database.query<WordProgressRow>(
      `
        select state, correct_answers, wrong_answers
        from user_word_progress
        where user_id = $1 and word_id = $2
        limit 1
      `,
      [userId, wordId],
    );

    const currentProgress = progressResult.rows[0] ?? null;
    const currentState = currentProgress?.state ?? "new";

    const nextState = answer === "known"
      ? getKnownNextState(currentState)
      : "learning";

    const nextReviewAt = answer === "known"
      ? getKnownNextReviewAt(now, currentState)
      : addHours(now, 12);

    const correctAnswers = (currentProgress?.correct_answers ?? 0) + (answer === "known" ? 1 : 0);
    const wrongAnswers = (currentProgress?.wrong_answers ?? 0) + (answer === "again" ? 1 : 0);

    await this.database.query(
      `
        insert into user_word_progress (
          user_id,
          word_id,
          state,
          last_reviewed_at,
          next_review_at,
          correct_answers,
          wrong_answers
        ) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (user_id, word_id)
        do update set
          state = excluded.state,
          last_reviewed_at = excluded.last_reviewed_at,
          next_review_at = excluded.next_review_at,
          correct_answers = excluded.correct_answers,
          wrong_answers = excluded.wrong_answers
      `,
      [userId, wordId, nextState, now, nextReviewAt, correctAnswers, wrongAnswers],
    );
  }

  private async registerPhraseAnswer(userId: number, phraseId: number, answer: LearningAnswer): Promise<void> {
    const now = new Date();
    const phraseResult = await this.database.query<PhraseProgressRow>(
      `
        select correct_answers, wrong_answers
        from custom_sentences
        where user_id = $1 and id = $2
        limit 1
      `,
      [userId, phraseId],
    );

    const currentPhrase = phraseResult.rows[0];

    if (!currentPhrase) {
      return;
    }

    const correctAnswers = currentPhrase.correct_answers + (answer === "known" ? 1 : 0);
    const wrongAnswers = currentPhrase.wrong_answers + (answer === "again" ? 1 : 0);
    const nextReviewAt = answer === "known"
      ? getPhraseNextReviewAt(now, currentPhrase.correct_answers)
      : addHours(now, 12);

    await this.database.query(
      `
        update custom_sentences
        set last_reviewed_at = $3,
            scheduled_review_at = $4,
            correct_answers = $5,
            wrong_answers = $6
        where user_id = $1 and id = $2
      `,
      [userId, phraseId, now, nextReviewAt, correctAnswers, wrongAnswers],
    );
  }
}

export function parseReminderTime(value: string): string | null {
  const trimmed = value.trim();

  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const [hoursPart, minutesPart] = trimmed.split(":");
  const hours = Number.parseInt(hoursPart, 10);
  const minutes = Number.parseInt(minutesPart, 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${hoursPart}:${minutesPart}`;
}

function getKnownNextState(state: WordProgressState): WordProgressState {
  switch (state) {
    case "new":
      return "learning";
    case "learning":
      return "review";
    case "review":
      return "mastered";
    case "mastered":
      return "mastered";
    default:
      return "learning";
  }
}

function getKnownNextReviewAt(now: Date, state: WordProgressState): Date {
  switch (state) {
    case "new":
      return addDays(now, 1);
    case "learning":
      return addDays(now, 3);
    case "review":
      return addDays(now, 7);
    case "mastered":
      return addDays(now, 14);
    default:
      return addDays(now, 1);
  }
}

function getPhraseNextReviewAt(now: Date, correctAnswers: number): Date {
  if (correctAnswers <= 0) {
    return addDays(now, 1);
  }

  if (correctAnswers === 1) {
    return addDays(now, 3);
  }

  return addDays(now, 7);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

function extractAcceptedTranslations(translation: string): string[] {
  const variants = new Set<string>();

  for (const rawVariant of translation.split(/[\/;]/)) {
    const trimmedVariant = rawVariant.trim();

    if (!trimmedVariant) {
      continue;
    }

    addCandidate(variants, trimmedVariant);

    const withoutNotes = trimmedVariant
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .trim();

    addCandidate(variants, withoutNotes);

    for (const match of trimmedVariant.matchAll(/\(([^)]*)\)/g)) {
      addCandidate(variants, match[1]);
    }

    for (const match of trimmedVariant.matchAll(/\[([^\]]*)\]/g)) {
      addCandidate(variants, match[1]);
      addCandidate(variants, `${withoutNotes} ${match[1]}`);
    }
  }

  return [...variants];
}

function addCandidate(variants: Set<string>, value: string): void {
  const normalized = normalizeTranslationFragment(value);

  if (normalized) {
    variants.add(normalized);
  }
}

function normalizeTranslationFragment(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[!?.,:;"'`]/g, " ")
    .replace(/[()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldSendReminder(recipient: ReminderRecipient, now: Date): boolean {
  const localTime = formatTime(now, recipient.timezone);

  if (localTime !== recipient.reminderTime) {
    return false;
  }

  if (!recipient.lastRemindedAt) {
    return true;
  }

  const lastDateKey = formatDateKey(recipient.lastRemindedAt, recipient.timezone);
  const currentDateKey = formatDateKey(now, recipient.timezone);

  if (lastDateKey === currentDateKey) {
    return false;
  }

  return getDateKeyDistanceInDays(lastDateKey, currentDateKey) >= recipient.reminderIntervalDays;
}

function normalizeStudyMinutes(value: number): number {
  if (value >= 15) {
    return 15;
  }

  if (value <= 5) {
    return 5;
  }

  return 10;
}

function normalizeReminderIntervalDays(value: number): number {
  if (value <= 1) {
    return 1;
  }

  if (value >= 3) {
    return 3;
  }

  return 2;
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function extractExcludedIds(excludedItemKeys: string[], kind: LearningItem["kind"]): number[] {
  return excludedItemKeys
    .filter((key) => key.startsWith(`${kind}:`))
    .map((key) => Number.parseInt(key.slice(kind.length + 1), 10))
    .filter((id) => Number.isInteger(id));
}

function getDateKeyDistanceInDays(fromDateKey: string, toDateKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromDateKey.split("-").map((part) => Number.parseInt(part, 10));
  const [toYear, toMonth, toDay] = toDateKey.split("-").map((part) => Number.parseInt(part, 10));
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay);

  return Math.max(0, Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000)));
}
