"use client";
import { Suspense, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "../components/brand-mark";
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
  const [password, setPassword] = useState("");
  // Devices that have used a password land on it; first-timers see the code flow they know.
  const [mode, setMode] = useState<"code" | "password">(() => { try { return localStorage.getItem("ba4l-login") === "password" ? "password" : "code"; } catch { return "code"; } });
  const remember = () => { try { localStorage.setItem("ba4l-login", "password"); } catch { /* fine */ } };
  const [stage, setStage] = useState<"email" | "code" | "setPassword" | "done">("email");
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
  const finish = () => { setStage("done"); window.location.assign(next); };
  const verify = async () => {
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) { setError("Enter the 6-digit code from the email."); return; }
    setBusy(true); setError("");
    const { data, error } = await supabaseBrowser().auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (error) { setError("That code did not work. Codes last 10 minutes; request a new one if needed."); return; }
    // First time through, offer a password so the next sign-in is one step. Skippable.
    if (data.user?.user_metadata?.has_password) finish(); else { setPassword(""); setStage("setPassword"); }
  };
  const signInWithPassword = async () => {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError("Enter the email address the team knows you by."); return; }
    if (!password) { setError("Enter your password, or switch to an emailed code."); return; }
    setBusy(true); setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (error) { setError("That email and password did not match. No password yet? Use an emailed code and set one."); return; }
    remember(); finish();
  };
  const savePassword = async () => {
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true); setError("");
    const { error } = await supabaseBrowser().auth.updateUser({ password, data: { has_password: true } });
    setBusy(false);
    if (error) { setError(error.message.includes("different") ? "Pick a password you have not used here before." : "Could not save that password. You can set one later from the account menu."); return; }
    remember(); finish();
  };
  return <main>
    <header className="topbar"><Link className="brand" href="/" aria-label="Big Al's 4 Life home"><span className="brand-icon"><BrandMark size={36}/></span>BA4L</Link><span className="league-tag"><span/> SIGN IN</span></header>
    <section className="login-card">
      <div className="eyebrow">{stage === "email" && mode === "password" ? <><KeyRound size={15}/> MEMBERS ONLY</> : <><Mail size={15}/> EMAIL CODE</>}</div>
      {stage === "email" && <>
        <h1>Big Al&rsquo;s 4 Life.</h1>
        <p>The team scorebook, standings, and Thursday night. {mode === "password" ? "Use the address Doug invited and the password you set." : "We’ll email you a six-digit code; use the address Doug invited."}</p>
        <form onSubmit={e => { e.preventDefault(); void (mode === "password" ? signInWithPassword() : send()); }}>
          <label className="field">Email<input type="email" autoComplete="username" inputMode="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
          {mode === "password" && <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>}
          <button className="primary" type="submit" disabled={busy}>{busy ? (mode === "password" ? "Signing in…" : "Sending…") : (mode === "password" ? "Sign in" : "Email me a code")}</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => { setError(""); setMode(m => m === "password" ? "code" : "password"); }}>{mode === "password" ? "No password yet? Email me a code" : "Sign in with a password instead"}</button>
        </form>
      </>}
      {stage === "setPassword" && <>
        <h1>You&rsquo;re in. Skip the code next time?</h1>
        <p>Set a password for <strong>{email}</strong> and future sign-ins are one step. The emailed code always works too.</p>
        <form onSubmit={e => { e.preventDefault(); void savePassword(); }}>
          <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} autoFocus value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
          <button className="text-button" type="button" disabled={busy} onClick={finish}>Not now</button>
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
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}

export default function LoginPage() { return <Suspense fallback={<main/>}><LoginForm/></Suspense>; }
