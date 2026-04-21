import { config as loadEnv } from "dotenv";

loadEnv();

function readRaw(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readRequiredString(name: string): string {
  const value = readRaw(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function readOptionalString(name: string): string | null {
  return readRaw(name) ?? null;
}

export function readOptionalInteger(name: string): number | null {
  const value = readRaw(name);

  if (!value) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`${name} must be a valid integer.`);
  }

  return parsedValue;
}

export function readStringFromSet<T extends string>(
  name: string,
  allowedValues: readonly T[],
  defaultValue: T,
): T {
  const value = readRaw(name);

  if (!value) {
    return defaultValue;
  }

  if (!allowedValues.includes(value as T)) {
    throw new Error(`${name} must be one of: ${allowedValues.join(", ")}`);
  }

  return value as T;
}
