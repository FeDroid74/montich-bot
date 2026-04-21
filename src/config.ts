import { config as loadEnv } from "dotenv";

loadEnv();

const requiredVariables = ["BOT_TOKEN"] as const;
const missingVariables = requiredVariables.filter((name) => !process.env[name]);

if (missingVariables.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVariables.join(", ")}`);
}

const adminTelegramId = process.env.ADMIN_TELEGRAM_ID
  ? Number.parseInt(process.env.ADMIN_TELEGRAM_ID, 10)
  : null;

if (process.env.ADMIN_TELEGRAM_ID && Number.isNaN(adminTelegramId)) {
  throw new Error("ADMIN_TELEGRAM_ID must be a valid integer.");
}

export const appConfig = {
  botToken: process.env.BOT_TOKEN as string,
  adminTelegramId,
  donationUrl: process.env.DONATION_URL ?? null,
  nodeEnv: process.env.NODE_ENV ?? "development",
};
