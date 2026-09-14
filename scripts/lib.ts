import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Shared setup for the manual backup/restore scripts. These run from your own
// machine with the service role key (which bypasses RLS) — never in the app.

// Load .env.local first, then .env, without overriding real shell exports.
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

export const PHOTOS_BUCKET = "photos";
export const TABLES = ["collections", "categories", "items", "sources"] as const;
export type TableName = (typeof TABLES)[number];

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}. Set it in .env.local or export it before running.`,
    );
    process.exit(1);
  }
  return value;
}

export function adminClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function backupRoot(): string {
  const dir = process.env.BACKUP_DIR || "../sourcing-catalog-backups";
  return path.resolve(process.cwd(), dir);
}

export function timestamp(): string {
  // 2026-09-14T13-05-22 — filesystem-safe, sorts chronologically.
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}
