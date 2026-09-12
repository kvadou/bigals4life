"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import type { Night } from "@/lib/scorebook";
import { BOWLERS } from "@/lib/season";

/** Mark a night as bowled early. Only the chosen bowlers' columns count, and the night files under the week it stands in for. */
export default function PrebowlPanel({ night, setNight, disabled }: { night: Night; setNight: (u: (n: Night) => Night) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const pre = night.prebowl;
  return <section className="match-panel prebowl-panel">
    <div className="match-head"><div className="eyebrow"><CalendarClock size={15}/> {pre ? `PRE-BOWL · WEEK ${pre.week}` : "PRE-BOWLING?"}</div><button className="text-button" disabled={disabled} onClick={() => setOpen(true)}>{pre ? "Change" : "Mark as pre-bowl"}</button></div>
    <p className="score-note">{pre ? `${pre.bowlers.map(i => BOWLERS[i]).join(" and ")} bowling ahead of Thursday. Only ${pre.bowlers.length === 1 ? "that column counts" : "those columns count"}; the team lines stay open until the rest bowl.` : "Bowling early for a week the team hasn't played yet? Mark it so your scores file under the right week."}</p>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}><div className="dialog-inner">
      <button className="close-button" aria-label="Close dialog" onClick={() => setOpen(false)}><X size={20}/></button>
      {open && <PrebowlSetup night={night} onSave={p => { setNight(n => p ? { ...n, prebowl: p } : (({ prebowl: _, ...rest }) => rest)(n)); setOpen(false); }}/>}
    </div></dialog>
  </section>;
}

function PrebowlSetup({ night, onSave }: { night: Night; onSave: (p: Night["prebowl"] | null) => void }) {
  const [week, setWeek] = useState(night.prebowl?.week ?? night.match?.week ?? 1);
  const [who, setWho] = useState<number[]>(night.prebowl?.bowlers ?? []);
  const toggle = (i: number) => setWho(w => w.includes(i) ? w.filter(x => x !== i) : [...w, i].sort());
  return <>
    <div className="eyebrow">AHEAD OF THURSDAY</div><h2>Pre-bowl</h2>
    <p>Pick the week this counts for and who is bowling. Everyone else's column stays blank.</p>
    <form onSubmit={e => { e.preventDefault(); if (who.length) onSave({ week, bowlers: who }); }}>
      <label className="field">Week<input inputMode="numeric" pattern="[0-9]*" value={week} onChange={e => setWeek(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}/></label>
      <div className="field"><span>Who is bowling</span><div className="chip-row">{BOWLERS.map((b, i) => <button type="button" key={b} className={`chip ${who.includes(i) ? "active" : ""}`} aria-pressed={who.includes(i)} onClick={() => toggle(i)}>{b}</button>)}</div></div>
      <button className="primary" type="submit" disabled={!who.length}>Save pre-bowl</button>
      {night.prebowl && <button className="text-button" type="button" onClick={() => onSave(null)}>This is a normal team night</button>}
    </form>
  </>;
}
