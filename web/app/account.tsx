"use client";
import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, Users, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type Me = { user: { id: string; email: string }; admin: boolean; profile: { displayName: string; bowlerName: string | null }; scorebooks: { id: string; role: string }[] };
type Members = { role: string; members: { userId: string; role: string }[]; invites: { email: string; role: string }[] };

/** Loads the signed-in account once. Null while loading, false when signed out. */
export function useMe() {
  const [me, setMe] = useState<Me | null | false>(null);
  useEffect(() => { void (async () => { try { const r = await fetch("/api/me", { cache: "no-store" }); setMe(r.ok ? await r.json() : false); } catch { setMe(false); } })(); }, []);
  return me;
}

export function AccountBar({ me, nightId, role, onClaimed }: { me: Me | null | false; nightId: string; role: string; onClaimed: () => void }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const next = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  if (me === null) return null;
  if (me === false) return <a className="secondary account-link" href={`/login?next=${encodeURIComponent(next)}`}><LogIn size={15}/> Sign in</a>;
  const canManage = nightId && (role === "owner" || (role === "legacy" && me.admin));
  return <>
    <span className="account-email">{me.user.email}</span>
    {canManage && <button className="secondary" onClick={() => setOpen(true)}><Users size={15}/> Teammates</button>}
    <button className="text-button" onClick={async () => { await supabaseBrowser().auth.signOut(); window.location.reload(); }}><LogOut size={15}/> Sign out</button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}><div className="dialog-inner">
      <button className="close-button" aria-label="Close dialog" onClick={() => setOpen(false)}><X size={20}/></button>
      {open && <Teammates nightId={nightId} role={role} admin={me.admin} onClaimed={() => { onClaimed(); }}/>}
    </div></dialog>
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
