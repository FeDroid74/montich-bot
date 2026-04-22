import type { DatabaseAdapter } from "../database/database.js";
import type { VocabularyWord, WordSource } from "../database/models.js";

interface VocabularyWordRow {
  id: number;
  source: WordSource;
  created_by_user_id: number | null;
  serbian_latin: string;
  russian_translation: string;
  topic: string | null;
  example_sentence: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface AddWordResult {
  status: "created" | "existing";
  word: VocabularyWord;
}

export class VocabularyService {
  public constructor(private readonly database: DatabaseAdapter) {}

  public async listWords(filter: "all" | "active" | "hidden" = "all", limit = 500): Promise<VocabularyWord[]> {
    const result = await this.database.query<VocabularyWordRow>(
      `
        select *
        from vocabulary_words
        where ($1 = 'all')
           or ($1 = 'active' and is_active = true)
           or ($1 = 'hidden' and is_active = false)
        order by id asc
        limit $2
      `,
      [filter, limit],
    );

    return result.rows.map(mapVocabularyWord);
  }

  public async addAdminWord(serbianLatin: string, russianTranslation: string): Promise<AddWordResult> {
    const existingWord = await this.database.query<VocabularyWordRow>(
      `
        select *
        from vocabulary_words
        where source = 'admin'
          and created_by_user_id is null
          and serbian_latin = $1
          and russian_translation = $2
        limit 1
      `,
      [serbianLatin, russianTranslation],
    );

    if (existingWord.rowCount && existingWord.rows[0]) {
      return {
        status: "existing",
        word: mapVocabularyWord(existingWord.rows[0]),
      };
    }

    const createdWord = await this.database.query<VocabularyWordRow>(
      `
        insert into vocabulary_words (
          source,
          created_by_user_id,
          serbian_latin,
          russian_translation,
          topic,
          example_sentence,
          is_active
        ) values ('admin', null, $1, $2, null, null, true)
        returning *
      `,
      [serbianLatin, russianTranslation],
    );

    return {
      status: "created",
      word: mapVocabularyWord(createdWord.rows[0]),
    };
  }

  public async getWordById(wordId: number): Promise<VocabularyWord | null> {
    const result = await this.database.query<VocabularyWordRow>(
      `
        select *
        from vocabulary_words
        where id = $1
        limit 1
      `,
      [wordId],
    );

    const row = result.rows[0];
    return row ? mapVocabularyWord(row) : null;
  }

  public async findWords(query: string, limit = 10): Promise<VocabularyWord[]> {
    const trimmedQuery = query.trim();
    const result = await this.database.query<VocabularyWordRow>(
      `
        select *
        from vocabulary_words
        where serbian_latin ilike $1
           or russian_translation ilike $1
           or cast(id as text) = $2
        order by is_active desc, id asc
        limit $3
      `,
      [`%${trimmedQuery}%`, trimmedQuery, limit],
    );

    return result.rows.map(mapVocabularyWord);
  }

  public async updateWord(wordId: number, serbianLatin: string, russianTranslation: string): Promise<VocabularyWord | null> {
    const result = await this.database.query<VocabularyWordRow>(
      `
        update vocabulary_words
        set serbian_latin = $2,
            russian_translation = $3
        where id = $1
        returning *
      `,
      [wordId, serbianLatin, russianTranslation],
    );

    const row = result.rows[0];
    return row ? mapVocabularyWord(row) : null;
  }

  public async setWordActive(wordId: number, isActive: boolean): Promise<VocabularyWord | null> {
    const result = await this.database.query<VocabularyWordRow>(
      `
        update vocabulary_words
        set is_active = $2
        where id = $1
        returning *
      `,
      [wordId, isActive],
    );

    const row = result.rows[0];
    return row ? mapVocabularyWord(row) : null;
  }
}

function mapVocabularyWord(row: VocabularyWordRow): VocabularyWord {
  return {
    id: row.id,
    source: row.source,
    createdByUserId: row.created_by_user_id,
    serbianLatin: row.serbian_latin,
    russianTranslation: row.russian_translation,
    topic: row.topic,
    exampleSentence: row.example_sentence,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
