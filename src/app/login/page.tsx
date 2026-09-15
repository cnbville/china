"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Just a login screen and a session that persists. No sign-up, no reset flow —
// the single account is created manually in the dashboard (plan section 2).
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // Full navigation so the server re-reads the refreshed session cookie.
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="animate-fade-up">
        <div className="mb-5 flex items-center gap-2">
          <span className="h-5 w-1.5 rounded-pill bg-accent shadow-glow" />
          <span className="text-meta uppercase tracking-[0.2em] text-muted">
            Private
          </span>
        </div>
        <h1 className="font-serif text-5xl leading-[1.05]">Personal Catalog</h1>
        <p className="mt-3 text-body text-muted">
          Every factory link for every piece, in one place.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-4 rounded-card border border-line bg-card/70 p-6 shadow-lift backdrop-blur"
        >
          <div>
            <label htmlFor="email" className="block text-meta text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-meta text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mt-1"
            />
          </div>

          {error && <p className="text-meta text-accentSoft">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="btn-accent w-full disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
