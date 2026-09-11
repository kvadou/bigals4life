"use client";
import { Suspense, useState } from "react";
import { CircleDot, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

/** Only same-origin paths. Resolving against our origin catches `//host`, `/\host`, and encoded variants a prefix check misses. */
const safeNext = (value: string | null) => {
  if (!value || !value.startsWith("/") || /[\\]/.test(value)) return "/";
  try { const u = new URL(value, "https://bigals4life.com"); return u.origin === "https://bigals4life.com" && u.pathname.startsWith("/") ? u.pathname + u.search : "/"; } catch { return "/"; }
};

function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "done">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError("Enter the email address the team knows you by."); return; }
    setBusy(true); setError("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) { setError(error.message.includes("rate") ? "Too many codes sent. Wait a few minutes and try again." : "Could not send a code. Check the address and try again."); return; }
    setEmail(address); setStage("code");
  };
  const verify = async () => {
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) { setError("Enter the 6-digit code from the email."); return; }
    setBusy(true); setError("");
    const { error } = await supabaseBrowser().auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (error) { setError("That code did not work. Codes last 10 minutes; request a new one if needed."); return; }
    setStage("done");
    window.location.assign(next);
  };
  return <main>
    <header className="topbar"><Link className="brand" href="/" aria-label="Strike Ceiling home"><span className="brand-icon"><CircleDot size={23}/></span>STRIKE<span>CEILING</span></Link><span className="league-tag"><span/> SIGN IN</span></header>
    <section className="login-card">
      <div className="eyebrow"><Mail size={15}/> EMAIL CODE, NO PASSWORD</div>
      {stage === "email" && <>
        <h1>Who&rsquo;s bowling?</h1>
        <p>We&rsquo;ll email you a six-digit code. Use the address Doug invited.</p>
        <form onSubmit={e => { e.preventDefault(); void send(); }}>
          <label className="field">Email<input type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
        </form>
      </>}
      {stage === "code" && <>
        <h1>Check your email.</h1>
        <p>We sent a code to <strong>{email}</strong>. It lasts 10 minutes.</p>
        <form onSubmit={e => { e.preventDefault(); void verify(); }}>
          <label className="field">Code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus value={code} onChange={e => setCode(e.target.value)} disabled={busy} className="code-input"/></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => { setStage("email"); setCode(""); }}>Use a different email</button>
        </form>
      </>}
      {stage === "done" && <><h1>You&rsquo;re in.</h1><p>Taking you back to the scorebook…</p></>}
      {error && <p className="photo-error" role="alert">{error}</p>}
    </section>
    <footer><span>STRIKE CEILING</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}

export default function LoginPage() { return <Suspense fallback={<main/>}><LoginForm/></Suspense>; }
