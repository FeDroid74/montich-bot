import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface MigrationFile {
  name: string;
  sql: string;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, "migrations");

export async function readMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });

  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    sqlFiles.map(async (fileName) => ({
      name: fileName,
      sql: await readFile(join(migrationsDirectory, fileName), "utf8"),
    })),
  );
}
