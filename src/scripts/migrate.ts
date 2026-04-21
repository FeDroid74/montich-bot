import { appConfig } from "../config/app-config.js";
import { createDatabaseAdapter } from "../database/database.js";
import { readMigrationFiles } from "../database/migrations.js";

interface AppliedMigrationRow {
  name: string;
}

async function main(): Promise<void> {
  const database = createDatabaseAdapter(appConfig.database);

  if (!database.isConfigured()) {
    throw new Error("DATABASE_URL не задана. Сначала настрой подключение к PostgreSQL.");
  }

  try {
    await database.initialize();
    await database.query(`
      create table if not exists app_migrations (
        id bigint generated always as identity primary key,
        name text not null unique,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationFiles = await readMigrationFiles();
    const appliedMigrationRows = await database.query<AppliedMigrationRow>(
      "select name from app_migrations order by name",
    );
    const appliedMigrations = new Set(appliedMigrationRows.rows.map((row: AppliedMigrationRow) => row.name));
    const pendingMigrations = migrationFiles.filter((migration) => !appliedMigrations.has(migration.name));

    if (pendingMigrations.length === 0) {
      console.log("Новых миграций нет.");
      return;
    }

    for (const migration of pendingMigrations) {
      console.log(`Применяю миграцию ${migration.name}`);

      await database.transaction(async (client) => {
        await client.query(migration.sql);
        await client.query("insert into app_migrations (name) values ($1)", [migration.name]);
      });
    }

    console.log(`Готово. Применено миграций: ${pendingMigrations.length}`);
  } finally {
    await database.close();
  }
}

void main().catch((error) => {
  console.error("Миграции завершились ошибкой.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
