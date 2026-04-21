import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { AppConfig } from "../config/app-config.js";

export type DatabaseStatus =
  | {
      state: "disabled";
      label: string;
    }
  | {
      state: "configured";
      label: string;
      provider: "postgres";
    }
  | {
      state: "ready";
      label: string;
      provider: "postgres";
    }
  | {
      state: "error";
      label: string;
      provider: "postgres";
      details: string;
    };

export interface DatabaseClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface DatabaseAdapter extends DatabaseClient {
  readonly provider: "postgres";
  initialize(): Promise<void>;
  isConfigured(): boolean;
  getStatus(): DatabaseStatus;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

class DisabledDatabaseAdapter implements DatabaseAdapter {
  public readonly provider = "postgres" as const;

  public async initialize(): Promise<void> {
    return Promise.resolve();
  }

  public isConfigured(): boolean {
    return false;
  }

  public getStatus(): DatabaseStatus {
    return {
      state: "disabled",
      label: "не настроена",
    };
  }

  public async query<Row extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<Row>> {
    throw new Error("Database is not configured.");
  }

  public async transaction<T>(): Promise<T> {
    throw new Error("Database is not configured.");
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }
}

class PostgresDatabaseAdapter implements DatabaseAdapter {
  public readonly provider = "postgres" as const;
  private readonly pool: Pool;
  private status: DatabaseStatus = {
    state: "configured",
    label: "настроена",
    provider: "postgres",
  };
  private initialized = false;

  public constructor(connectionUrl: string) {
    this.pool = new Pool({
      connectionString: connectionUrl,
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.pool.query("select 1");
      this.initialized = true;
      this.status = {
        state: "ready",
        label: "подключена (postgres)",
        provider: this.provider,
      };
    } catch (error) {
      const details = getErrorMessage(error);

      this.status = {
        state: "error",
        label: "ошибка подключения",
        provider: this.provider,
        details,
      };

      throw new Error(`Failed to connect to PostgreSQL: ${details}`);
    }
  }

  public isConfigured(): boolean {
    return true;
  }

  public getStatus(): DatabaseStatus {
    return this.status;
  }

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values ? [...values] : undefined);
  }

  public async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const result = await callback({
        query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) {
          return queryWithClient<Row>(client, text, values);
        },
      });

      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

function queryWithClient<Row extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<Row>> {
  return client.query<Row>(text, values ? [...values] : undefined);
}

export function createDatabaseAdapter(config: AppConfig["database"]): DatabaseAdapter {
  if (!config.url) {
    return new DisabledDatabaseAdapter();
  }

  return new PostgresDatabaseAdapter(config.url);
}
