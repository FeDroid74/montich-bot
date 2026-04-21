import { appConfig } from "../config/app-config.js";
import { createDatabaseAdapter } from "../database/database.js";

async function main(): Promise<void> {
  const database = createDatabaseAdapter(appConfig.database);

  try {
    await database.initialize();

    const status = database.getStatus();

    if (status.state === "disabled") {
      console.log("DATABASE_URL не задана. База данных не настроена.");
      return;
    }

    console.log(`Проверка БД успешна: ${status.label}`);
  } finally {
    await database.close();
  }
}

void main().catch((error) => {
  console.error("Проверка подключения к БД завершилась ошибкой.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
