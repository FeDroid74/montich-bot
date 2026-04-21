import type { DatabaseAdapter } from "../database/database.js";
import type { UserRole, WordProgressState } from "../database/models.js";

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

export interface LearningCard {
  wordId: number;
  serbianLatin: string;
  russianTranslation: string;
  progressState: WordProgressState | null;
}

export interface ProgressSummary {
  totalWords: number;
  trackedWords: number;
  activeWords: number;
  masteredWords: number;
  dueWords: number;
}

interface LearningUserRow {
  id: number;
  telegram_id: number;
  role: UserRole;
}

interface LearningCardRow {
  word_id: number;
  serbian_latin: string;
  russian_translation: string;
  progress_state: WordProgressState | null;
}

interface WordProgressRow {
  state: WordProgressState;
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

    return {
      id: row.id,
      telegramId: row.telegram_id,
      role: row.role,
    };
  }

  public async getNextCard(userId: number): Promise<LearningCard | null> {
    const result = await this.database.query<LearningCardRow>(
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
        order by
          case
            when uwp.next_review_at is not null and uwp.next_review_at <= now() then 0
            when uwp.user_id is null then 1
            when uwp.state in ('new', 'learning') then 2
            else 3
          end,
          coalesce(uwp.next_review_at, vw.created_at),
          vw.id
        limit 1
      `,
      [userId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      wordId: row.word_id,
      serbianLatin: row.serbian_latin,
      russianTranslation: row.russian_translation,
      progressState: row.progress_state,
    };
  }

  public async registerAnswer(userId: number, wordId: number, answer: LearningAnswer): Promise<void> {
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

  public async getProgressSummary(userId: number): Promise<ProgressSummary> {
    const result = await this.database.query<ProgressSummaryRow>(
      `
        select
          (select count(*)::int from vocabulary_words where source = 'admin') as total_words,
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

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}
