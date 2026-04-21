import { createBot } from "../bot/create-bot.js";
import { appConfig } from "../config/app-config.js";
import { createDatabaseAdapter } from "../database/database.js";
import type { AppContext } from "./context.js";

export interface AppInstance {
  context: AppContext;
  start(): Promise<void>;
  stop(signal: string): Promise<void>;
}

export function createApp(): AppInstance {
  const context: AppContext = {
    config: appConfig,
    database: createDatabaseAdapter(appConfig.database),
  };

  const bot = createBot(context);

  return {
    context,
    async start(): Promise<void> {
      await context.database.initialize();
      await bot.launch();
      console.log(`Montich bot started in ${context.config.runtimeEnvironment} mode.`);
    },
    async stop(signal: string): Promise<void> {
      bot.stop(signal);
      await context.database.close();
    },
  };
}
