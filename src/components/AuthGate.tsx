"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Client-side auth gate (replaces the old server middleware, which a static
// export can't run). Anything other than /login requires a session; without one
// you're bounced to /login, and visiting /login while signed in bounces home.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuthed(!!data.session);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
      setReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!authed && !isLogin) router.replace("/login");
    if (authed && isLogin) router.replace("/");
  }, [ready, authed, isLogin, router]);

  // While we don't yet know, or we're mid-redirect, render nothing to avoid a
  // flash of protected content.
  if (!ready) return null;
  if (!authed && !isLogin) return null;
  if (authed && isLogin) return null;

  return <>{children}</>;
}
