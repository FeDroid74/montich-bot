export type UserRole = "admin" | "student";
export type WordSource = "admin" | "user";
export type WordProgressState = "new" | "learning" | "review" | "mastered";
export type FaqAssetType = "image" | "document";

export interface UserProfile {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: UserRole;
  createdAt: Date;
}

export interface UserSettings {
  userId: number;
  reminderTime: string | null;
  timezone: string;
  dailyGoalMinutes: number;
  lastRemindedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VocabularyWord {
  id: number;
  source: WordSource;
  createdByUserId: number | null;
  serbianLatin: string;
  russianTranslation: string;
  topic: string | null;
  exampleSentence: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface UserWordProgress {
  userId: number;
  wordId: number;
  state: WordProgressState;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  correctAnswers: number;
  wrongAnswers: number;
}

export interface CustomSentence {
  id: number;
  userId: number;
  originalText: string;
  correctedText: string | null;
  topic: string | null;
  scheduledReviewAt: Date | null;
  createdAt: Date;
}

export interface FaqCategory {
  id: number;
  slug: string;
  title: string;
}

export interface FaqEntry {
  id: number;
  categoryId: number;
  question: string;
  answer: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FaqAsset {
  id: number;
  faqEntryId: number;
  fileName: string;
  fileType: FaqAssetType;
  storagePath: string;
  createdAt: Date;
}
