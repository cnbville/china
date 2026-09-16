import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the anon key (safe to ship — RLS is what
// protects the data).
//
// Memoised to a single instance for the whole tab. createClient() is called from
// every hook and mutation; without this, each call could build its own auth
// client + realtime socket, which wastes connections and can trip the "Multiple
// GoTrueClient instances" auth race. One client, one socket, shared by all.
type Client = ReturnType<typeof createBrowserClient>;
let client: Client | null = null;

export function createClient(): Client {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
