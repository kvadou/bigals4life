"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogIn, LogOut, Users, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type Me = { user: { id: string; email: string }; admin: boolean; profile: { displayName: string; bowlerName: string | null }; scorebooks: { id: string; role: string; updatedAt: string | null }[]; legacy: { id: string; updatedAt: string; games: number }[] };
type Members = { role: string; members: { userId: string; role: string }[]; invites: { email: string; role: string }[] };

/** Loads the signed-in account once. Null while loading, false when signed out. */
export function useMe() {
  const [me, setMe] = useState<Me | null | false>(null);
  useEffect(() => { void (async () => { try { const r = await fetch("/api/me", { cache: "no-store" }); setMe(r.ok ? await r.json() : false); } catch { setMe(false); } })(); }, []);
  return me;
}

export function AccountBar({ me, nightId, role, onClaimed }: { me: Me | null | false; nightId: string; role: string; onClaimed: () => void }) {
  const [open, setOpen] = useState<false | "team" | "password">(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".profile-menu")) setProfileOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileOpen(false); };
    document.addEventListener("click", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", escape); };
  }, [profileOpen]);
  const next = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  if (me === null) return null;
  if (me === false) return <a className="secondary account-link" href={`/login?next=${encodeURIComponent(next)}`}><LogIn size={15}/> Sign in</a>;
  const canManage = nightId && (role === "owner" || (role === "legacy" && me.admin));
  const displayName = leagueName(me.profile.displayName || me.profile.bowlerName || me.user.email.split("@")[0], me.profile.bowlerName);
  const initial = displayName.trim().charAt(0).toUpperCase() || "D";
  const signOut = async () => { await supabaseBrowser().auth.signOut(); window.location.reload(); };
  return <>
    <div className="profile-menu">
      <button className="profile-trigger" type="button" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(value => !value)}>
        <span className="profile-avatar" aria-hidden="true">{initial}</span><span className="profile-name">{displayName}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {profileOpen && <div className="profile-popover" role="menu">
        <div className="profile-identity"><strong>{displayName}</strong><span>{me.user.email}</span></div>
        {canManage && <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); setOpen("team"); }}><Users size={15}/> Teammates</button>}
        <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); setOpen("password"); }}><KeyRound size={15}/> Password</button>
        <button type="button" role="menuitem" className="profile-danger" onClick={() => void signOut()}><LogOut size={15}/> Sign out</button>
      </div>}
    </div>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}><div className="dialog-inner">
      <button className="close-button" aria-label="Close dialog" onClick={() => setOpen(false)}><X size={20}/></button>
      {open === "team" && <Teammates nightId={nightId} role={role} admin={me.admin} onClaimed={() => { onClaimed(); }}/>}
      {open === "password" && <PasswordForm email={me.user.email} onDone={() => setOpen(false)}/>}
    </div></dialog>
  </>;
}

/** Set or change the password used to skip the emailed code. */
function PasswordForm({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const save = async () => {
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true); setError("");
    const { error } = await supabaseBrowser().auth.updateUser({ password, data: { has_password: true } });
    setBusy(false);
    if (error) { setError(error.message.includes("different") ? "Pick a password you have not used here before." : "Could not save that password. Try again in a minute."); return; }
    try { localStorage.setItem("ba4l-login", "password"); } catch { /* fine */ }
    setSaved(true);
  };
  return <>
    <div className="eyebrow">SIGN-IN</div><h2>Password</h2>
    {saved ? <><p>Saved. Next time, sign in to <strong>{email}</strong> with your password instead of a code.</p><button className="primary" onClick={onDone}>Done</button></> : <>
      <p>Set a password for <strong>{email}</strong> and skip the emailed code. The code still works if you forget it.</p>
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} autoFocus value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </>}
    {error && <p className="photo-error" role="alert">{error}</p>}
  </>;
}

function Teammates({ nightId, role, admin, onClaimed }: { nightId: string; role: string; admin: boolean; onClaimed: () => void }) {
  const [data, setData] = useState<Members | null>(null);
  const [email, setEmail] = useState(""); const [newRole, setNewRole] = useState("editor");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [note, setNote] = useState("");
  const load = async () => { try { const r = await fetch(`/api/nights/${nightId}/members`, { cache: "no-store" }); if (r.ok) setData(await r.json()); } catch { /* shown as empty */ } };
  useEffect(() => { if (role !== "legacy") void load(); }, [role]);
  const claim = async () => {
    setBusy(true); setError("");
    try { const r = await fetch(`/api/nights/${nightId}/claim`, { method: "POST" }); const d = await r.json(); if (!r.ok) throw Error(d.error); setNote("This scorebook is now yours. Add the team below."); onClaimed(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not claim."); } finally { setBusy(false); }
  };
  const invite = async () => {
    setBusy(true); setError(""); setNote("");
    try { const r = await fetch(`/api/nights/${nightId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), role: newRole }) }); const d = await r.json(); if (!r.ok) throw Error(d.error); setEmail(""); setNote(`${d.email} can sign in with that address and will see this scorebook.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not add teammate."); } finally { setBusy(false); }
  };
  return <>
    <div className="eyebrow">THE TEAM</div><h2>Teammates</h2>
    {role === "legacy" ? <>
      <p>This scorebook was made before sign-in existed. Anyone with the link can edit it. {admin ? "Claim it to lock it to the team." : "Ask Doug to claim it."}</p>
      {admin && <button className="primary" disabled={busy} onClick={() => void claim()}>{busy ? "Claiming…" : "Claim this scorebook"}</button>}
    </> : <>
      <p>Only teammates listed here can open and change this scorebook. Editors can score; viewers can only watch.</p>
      {data && <ul className="member-list">{data.members.map(m => <li key={m.userId}><span>Member</span><strong>{m.role}</strong></li>)}{data.invites.map(i => <li key={i.email}><span>{i.email}</span><strong>{i.role} · invited</strong></li>)}</ul>}
      <form onSubmit={e => { e.preventDefault(); void invite(); }}>
        <label className="field">Email<input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
        <label className="field">Role<select value={newRole} onChange={e => setNewRole(e.target.value)} disabled={busy}><option value="editor">Editor (can score)</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select></label>
        <button className="primary" type="submit" disabled={busy || !email.trim()}>{busy ? "Adding…" : "Add teammate"}</button>
      </form>
    </>}
    {note && <p className="photo-success" role="status">{note}</p>}
    {error && <p className="photo-error" role="alert">{error}</p>}
  </>;
}

/** Full names as Gary's sheet prints them. An account name like "dougkvamme" is a handle, not a name. */
const LEAGUE_NAMES: Record<string, string> = { doug: "Doug Kvamme", mustafa: "Mustafa Sakhi", kyle: "Kyle Dickhaus", pete: "Pete Anderson" };
export function leagueName(name: string, bowler: string | null) {
  const n = name.trim(); if (n.includes(" ")) return n; // a first and last name you set yourself wins
  const b = bowler?.trim().toLowerCase(); if (b && LEAGUE_NAMES[b]) return LEAGUE_NAMES[b];
  const first = Object.keys(LEAGUE_NAMES).find(k => n.toLowerCase().startsWith(k));
  return first ? LEAGUE_NAMES[first] : n;
}
