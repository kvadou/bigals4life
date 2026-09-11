"use client";
import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;
/** Browser Supabase client for sign-in only. Our tables grant nothing to the anon or authenticated roles; all data goes through server routes. */
export function supabaseBrowser() {
  if (!client) client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}
