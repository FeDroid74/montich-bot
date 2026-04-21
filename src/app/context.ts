import type { AppConfig } from "../config/app-config.js";
import type { DatabaseAdapter } from "../database/database.js";

export interface AppContext {
  config: AppConfig;
  database: DatabaseAdapter;
}
