import type { DatabaseAdapter } from "../database/database.js";
import type { CustomSentence } from "../database/models.js";

interface CustomSentenceRow {
  id: number;
  user_id: number;
  original_text: string;
  corrected_text: string | null;
  russian_translation: string | null;
  topic: string | null;
  scheduled_review_at: Date | null;
  last_reviewed_at: Date | null;
  correct_answers: number;
  wrong_answers: number;
  is_active: boolean;
  created_at: Date;
}

export interface AddPhraseResult {
  status: "created" | "existing";
  phrase: CustomSentence;
}

export class PhraseService {
  public constructor(private readonly database: DatabaseAdapter) {}

  public async addPhrase(userId: number, originalText: string, russianTranslation: string): Promise<AddPhraseResult> {
    const existingPhrase = await this.database.query<CustomSentenceRow>(
      `
        select *
        from custom_sentences
        where user_id = $1
          and original_text = $2
          and russian_translation = $3
        limit 1
      `,
      [userId, originalText, russianTranslation],
    );

    if (existingPhrase.rowCount && existingPhrase.rows[0]) {
      return {
        status: "existing",
        phrase: mapCustomSentence(existingPhrase.rows[0]),
      };
    }

    const createdPhrase = await this.database.query<CustomSentenceRow>(
      `
        insert into custom_sentences (
          user_id,
          original_text,
          corrected_text,
          russian_translation,
          topic,
          scheduled_review_at,
          last_reviewed_at,
          correct_answers,
          wrong_answers,
          is_active
        ) values ($1, $2, null, $3, null, now(), null, 0, 0, true)
        returning *
      `,
      [userId, originalText, russianTranslation],
    );

    return {
      status: "created",
      phrase: mapCustomSentence(createdPhrase.rows[0]),
    };
  }

  public async listPhrases(userId: number, limit = 20): Promise<CustomSentence[]> {
    const result = await this.database.query<CustomSentenceRow>(
      `
        select *
        from custom_sentences
        where user_id = $1
          and is_active = true
        order by id desc
        limit $2
      `,
      [userId, limit],
    );

    return result.rows.map(mapCustomSentence);
  }
}

function mapCustomSentence(row: CustomSentenceRow): CustomSentence {
  return {
    id: row.id,
    userId: row.user_id,
    originalText: row.original_text,
    correctedText: row.corrected_text,
    russianTranslation: row.russian_translation,
    topic: row.topic,
    scheduledReviewAt: row.scheduled_review_at,
    lastReviewedAt: row.last_reviewed_at,
    correctAnswers: row.correct_answers,
    wrongAnswers: row.wrong_answers,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
