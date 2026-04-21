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
    };

export interface DatabaseAdapter {
  readonly provider: "postgres";
  getStatus(): DatabaseStatus;
  close(): Promise<void>;
}

class DisabledDatabaseAdapter implements DatabaseAdapter {
  public readonly provider = "postgres" as const;

  getStatus(): DatabaseStatus {
    return {
      state: "disabled",
      label: "not configured",
    };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

class PlannedPostgresDatabaseAdapter implements DatabaseAdapter {
  public readonly provider = "postgres" as const;

  public constructor(private readonly connectionUrl: string) {}

  getStatus(): DatabaseStatus {
    const maskedUrl = this.connectionUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");

    return {
      state: "configured",
      label: `configured (${maskedUrl})`,
      provider: this.provider,
    };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

export function createDatabaseAdapter(config: AppConfig["database"]): DatabaseAdapter {
  if (!config.url) {
    return new DisabledDatabaseAdapter();
  }

  return new PlannedPostgresDatabaseAdapter(config.url);
}
