"use client";
import { LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignOut() {
  return <button className="secondary" onClick={async () => { await supabaseBrowser().auth.signOut(); window.location.assign("/login"); }}><LogOut size={15}/> Sign out and use a different email</button>;
}
