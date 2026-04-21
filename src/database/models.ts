export type UserRole = "admin" | "student";

export interface UserProfile {
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: UserRole;
  createdAt: Date;
}

export interface UserSettings {
  telegramId: number;
  reminderTime: string | null;
  timezone: string | null;
  dailyGoalMinutes: number;
}

export interface VocabularyWord {
  id: string;
  source: "admin" | "user";
  serbianLatin: string;
  russianTranslation: string;
  topic: string | null;
  exampleSentence: string | null;
  createdAt: Date;
}

export interface UserWordProgress {
  telegramId: number;
  wordId: string;
  state: "new" | "learning" | "review" | "mastered";
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  correctAnswers: number;
  wrongAnswers: number;
}

export interface CustomSentence {
  id: string;
  telegramId: number;
  originalText: string;
  correctedText: string | null;
  topic: string | null;
  scheduledReviewAt: Date | null;
}

export interface FaqCategory {
  id: string;
  slug: string;
  title: string;
}

export interface FaqEntry {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  keywords: string[];
}

export interface FaqAsset {
  id: string;
  faqEntryId: string;
  fileName: string;
  fileType: "image" | "document";
  storagePath: string;
}
