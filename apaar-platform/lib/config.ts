import { ConfigError } from "./errors";

export const env = () => (process.env.NODE_ENV ?? "development") as "development" | "production" | "test";
export const isProduction = () => env() === "production";
/** Development fallbacks (a known pepper, an ephemeral key) are allowed here and nowhere else. */
export const isDevLike = () => env() === "development" || env() === "test";

/**
 * Demo mode keeps the one-click demo personas and the phone simulator. It is on unless DEMO_MODE=false,
 * because this project is a prototype. Turn it off for a real deployment.
 */
export const demoMode = () => process.env.DEMO_MODE !== "false";

/** Reads a secret. Outside development, a missing one is a ConfigError instead of a weak default. */
export function requireSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isDevLike()) return devFallback;
  throw new ConfigError([name]);
}

export interface ConfigReport {
  ok: boolean;
  environment: string;
  demoMode: boolean;
  store: "postgres" | "memory";
  required: Record<string, boolean>;
  recommended: Record<string, boolean>;
  missing: string[];
  warnings: string[];
}

/** Booleans only. Never the values. */
export function configReport(): ConfigReport {
  const has = (n: string) => Boolean(process.env[n]);
  const required = { VAULT_PEPPER: has("VAULT_PEPPER"), SESSION_SECRET: has("SESSION_SECRET"), ISSUER_PRIVATE_KEY_PEM: has("ISSUER_PRIVATE_KEY_PEM") };
  const recommended = { DATABASE_URL: has("DATABASE_URL"), CRON_SECRET: has("CRON_SECRET") };

  const missing = isProduction() ? Object.entries(required).filter(([, ok]) => !ok).map(([k]) => k) : [];
  const warnings: string[] = [];
  if (isProduction() && !recommended.DATABASE_URL) {
    warnings.push("DATABASE_URL is not set. State lives in memory, so consent, sync data and the audit trail are lost on restart and are not shared between serverless instances.");
  }
  if (isProduction() && demoMode()) warnings.push("DEMO_MODE is on. Demo personas and the phone simulator are enabled. Set DEMO_MODE=false for a real deployment.");

  return {
    ok: missing.length === 0,
    environment: env(),
    demoMode: demoMode(),
    store: recommended.DATABASE_URL ? "postgres" : "memory",
    required,
    recommended,
    missing,
    warnings,
  };
}
