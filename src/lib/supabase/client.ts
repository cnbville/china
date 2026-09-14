import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the anon key (safe to ship — RLS is what
// protects the data). One instance per call is fine; supabase-js dedupes.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
