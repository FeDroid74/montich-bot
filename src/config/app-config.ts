import { readOptionalInteger, readOptionalString, readRequiredString, readStringFromSet } from "./env.js";

export type RuntimeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  runtimeEnvironment: RuntimeEnvironment;
  bot: {
    token: string;
    adminTelegramId: number | null;
    donationUrl: string | null;
  };
  database: {
    url: string | null;
    provider: "postgres";
  };
}

export const appConfig: AppConfig = {
  runtimeEnvironment: readStringFromSet("NODE_ENV", ["development", "test", "production"] as const, "development"),
  bot: {
    token: readRequiredString("BOT_TOKEN"),
    adminTelegramId: readOptionalInteger("ADMIN_TELEGRAM_ID"),
    donationUrl: readOptionalString("DONATION_URL"),
  },
  database: {
    url: readOptionalString("DATABASE_URL"),
    provider: "postgres",
  },
};
