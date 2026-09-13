"use client";
import { use, useEffect, useRef, useState } from "react";
import { OriginLink as Link } from "@/app/components/crumbs";
import { ArrowUpRight, ChevronDown, ChevronRight, Mic, X } from "lucide-react";
import { Topbar } from "../../components/topbar";
import { Crumbs } from "../../components/crumbs";
import { BroLockup, BroGlyph } from "../../components/bro-mark";
import { AccountBar, useMe } from "../../account";
import { DEFAULT_TAGS, TAGS, emptyReview, type Profile, type Review, type Tag } from "@/lib/review/schema";
import type { GameFacts } from "@/lib/review/facts";
import { statLine } from "@/lib/review/stats";

type Data = { night: { week: number | null; bowledOn: string; prebowl: { week: number; bowlers: number[] } | null; opponent: string | null; games: GameFacts[] }; bowler: number; names: string[]; review: Review; profile: Profile };
const day = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void; abort: () => void };

/** Bowling Bro': one bowler's night, reviewed. Scores are already in; everything else is optional; then the coach talks. */
export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [review, setReview] = useState<Review>(emptyReview);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [openGame, setOpenGame] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const [moreTags, setMoreTags] = useState(false);
  const [talking, setTalking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [newBall, setNewBall] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const load = async (bowler?: number) => {
    try {
      const r = await fetch(`/api/review/${id}${bowler != null ? `?bowler=${bowler}` : ""}`, { cache: "no-store" });
      const d = await r.json(); if (!r.ok) throw Error(d.error);
      setData(d); setReview(d.review); setProfile(d.profile);
      const first = (d as Data).night.games.findIndex(g => g.complete); setOpenGame(first < 0 ? 0 : first);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load this night."); }
  };
  useEffect(() => { const b = Number(new URLSearchParams(window.location.search).get("bowler")); void load(Number.isInteger(b) && b >= 0 && b <= 3 ? b : undefined); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave a second after the last edit. Notes stay on screen if the save fails.
  const save = (next: Review, nextProfile?: Profile) => {
    setReview(next); if (nextProfile) setProfile(nextProfile);
    dirty.current = true; setStatus("Saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void (async () => {
      if (!data) return;
      try {
        const r = await fetch(`/api/review/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bowler: data.bowler, review: next, profile: nextProfile ?? undefined }) });
        const d = await r.json(); if (!r.ok) throw Error(d.error);
        dirty.current = false; setStatus("Saved");
      } catch (e) { setStatus(e instanceof Error ? e.message : "Not saved"); }
    })(), 900);
  };
  const setGame = (i: number, patch: Partial<Review["games"][number]>) => {
    const games = [...review.games]; while (games.length <= i) games.push({ tags: [], note: "" });
    games[i] = { ...games[i], ...patch }; save({ ...review, games });
  };
  const toggleTag = (i: number, tag: Tag) => { const g = review.games[i] ?? { tags: [], note: "" }; setGame(i, { tags: g.tags.includes(tag) ? g.tags.filter(t => t !== tag) : [...g.tags, tag] }); };
  const addBall = (i: number) => { const name = newBall.trim(); if (!name || !profile) return; const p = { ...profile, arsenal: profile.arsenal.includes(name) ? profile.arsenal : [...profile.arsenal, name] }; setNewBall(""); setProfile(p); save({ ...review, games: withBall(review.games, i, name) }, p); };
  const withBall = (games: Review["games"], i: number, ball: string) => { const g = [...games]; while (g.length <= i) g.push({ tags: [], note: "" }); g[i] = { ...g[i], ball }; return g; };

  const talk = async (withAnswer?: string) => {
    if (!data) return;
    setTalking(true); setError("");
    try {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      const r = await fetch(`/api/review/${id}/debrief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bowler: data.bowler, review, answer: withAnswer }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error);
      setReview(d.review); setAnswer(""); dirty.current = false; setStatus("Saved");
    } catch (e) { setError(e instanceof Error ? e.message : "The coach is not answering right now."); }
    finally { setTalking(false); }
  };

  const games = data?.night.games ?? [];
  const done = games.filter(g => g.complete);
  const series = done.reduce((s, g) => s + g.stats.score, 0);
  const name = data ? data.names[data.bowler] : "";
  const lastCoach = [...review.debrief].reverse().find(t => t.role === "coach");
  const awaiting = !!lastCoach?.question && !review.closed && review.debrief[review.debrief.length - 1]?.role === "coach";

  return <main className="review-page">
    <Topbar right={<AccountBar me={me} nightId="" role="" onClaimed={() => {}}/>}/>
    <Crumbs items={[{ label: "Season", href: "/season" }, { label: data?.night.week ? `Week ${data.night.week}` : "This night", href: `/season/${id}` }, { label: "Review" }]}/>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {data && profile && <>
      <section className="intro review-intro"><div><BroLockup/><h1>How’d it <em>go, {name}?</em></h1><p>Scores are already in. Add as much or as little as you want, then talk it through.</p></div>
        {data.night.prebowl?.bowlers.length !== 1 && <div className="bowler-switch" role="group" aria-label="Whose night">{data.names.map((n, i) => <button key={n} className={`chip ${i === data.bowler ? "active" : ""}`} aria-pressed={i === data.bowler} onClick={() => { window.history.replaceState(null, "", `?bowler=${i}`); void load(i); }}>{n}</button>)}</div>}
      </section>

      <section className="match-hero review-hero" aria-label="Your night">
        <div className="match-hero-top"><span className="eyebrow light">{data.night.week ? `WEEK ${data.night.week} · ` : ""}{day(data.night.bowledOn)}{data.night.prebowl ? " · PRE-BOWL" : data.night.opponent ? ` · VS ${data.night.opponent.toUpperCase()}` : ""}</span><span className={`match-state ${done.length === games.length && games.length ? "final" : ""}`}>{done.length === games.length && games.length ? "FINAL" : "LIVE"}</span></div>
        <div className="review-series"><strong>{done.length ? series : "–"}</strong><span>{done.length ? `series · avg ${Math.round(series / done.length)}` : "no finished games yet"}</span></div>
        <div className="split-chips three">{games.map(g => <div key={g.game} className="split-chip open"><span className="eyebrow light">G{g.game}</span><strong>{g.stats.score}</strong><small>{statLine(g.stats)}</small></div>)}</div>
      </section>

      <div className="review-cards">
        {games.map((g, i) => {
          const r = review.games[i] ?? { tags: [], note: "" };
          if (i !== openGame) return <button key={g.game} className="card review-row" onClick={() => setOpenGame(i)}><div><div className="eyebrow">GAME {g.game} · {g.stats.score}</div><span>{[r.ball, r.tags.length ? r.tags.join(", ") : null, r.note ? "note" : null].filter(Boolean).join(" · ") || "nothing added yet"}</span></div><ChevronRight size={16}/></button>;
          const tags = moreTags ? [...TAGS] : DEFAULT_TAGS;
          return <section key={g.game} className="card review-game" aria-label={`Game ${g.game}`}>
            <div className="review-game-head"><div className="eyebrow">GAME {g.game} · {g.stats.score}</div><span className="muted-cell">{g.stats.framesPlayed ? `first ball ${g.stats.firstBallAvg}${g.stats.tenth ? ` · tenth ${g.stats.tenth}` : ""}` : "final score from the sheet, no frames"}</span></div>
            <div className="review-field"><span className="small-label">BALL</span>
              <div className="chip-row">{profile.arsenal.map(b => <button key={b} className={`chip ${r.ball === b ? "active" : ""}`} aria-pressed={r.ball === b} onClick={() => setGame(i, { ball: r.ball === b ? undefined : b })}>{b}</button>)}
                <form className="chip-add" onSubmit={e => { e.preventDefault(); addBall(i); }}><input value={newBall} onChange={e => setNewBall(e.target.value)} placeholder={profile.arsenal.length ? "add a ball" : "which ball? e.g. Storm Bionic"} aria-label="Add a ball" maxLength={40}/><button className="chip" type="submit" disabled={!newBall.trim()}>+ add</button></form></div>
            </div>
            <div className="review-field"><span className="small-label">WHAT YOU NOTICED</span>
              <div className="chip-row">{tags.map(t => <button key={t} className={`chip ${r.tags.includes(t) ? "active" : ""}`} aria-pressed={r.tags.includes(t)} onClick={() => toggleTag(i, t)}>{t}</button>)}{!moreTags && <button className="chip dashed" onClick={() => setMoreTags(true)}>more…</button>}</div>
            </div>
            <NoteField value={r.note} onChange={v => setGame(i, { note: v })}/>
          </section>;
        })}

        <section className="card review-context">
          <button className="review-row inner" onClick={() => setContextOpen(o => !o)} aria-expanded={contextOpen}><div><div className="eyebrow">THE LANES</div><span>{[review.context.lanes ? `Lanes ${review.context.lanes}` : null, review.context.onPair ? `${review.context.onPair} on the pair` : null, review.context.oil || null].filter(Boolean).join(" · ") || "optional"}</span></div><ChevronDown size={16} style={{ transform: contextOpen ? "rotate(180deg)" : "" }}/></button>
          {contextOpen && <div className="review-context-body">
            <label className="field">Lanes<input value={review.context.lanes} onChange={e => save({ ...review, context: { ...review.context, lanes: e.target.value.slice(0, 12) } })} placeholder="7 & 8" inputMode="numeric"/></label>
            <label className="field">Bowlers on the pair<input value={review.context.onPair ?? ""} onChange={e => save({ ...review, context: { ...review.context, onPair: e.target.value ? Math.max(2, Math.min(10, Number(e.target.value) || 2)) : undefined } })} inputMode="numeric" placeholder="8"/></label>
            <div className="chip-row"><button className={`chip ${review.context.lefties ? "active" : ""}`} aria-pressed={!!review.context.lefties} onClick={() => save({ ...review, context: { ...review.context, lefties: !review.context.lefties } })}>lefties on the pair</button><button className={`chip ${review.context.highRev ? "active" : ""}`} aria-pressed={!!review.context.highRev} onClick={() => save({ ...review, context: { ...review.context, highRev: !review.context.highRev } })}>high-rev guys</button></div>
            <label className="field">Oil pattern, if you know it<input value={review.context.oil} onChange={e => save({ ...review, context: { ...review.context, oil: e.target.value.slice(0, 40) } })} placeholder="house shot"/></label>
          </div>}
        </section>
      </div>

      <section className="review-debrief" aria-label="Talk it through">
        {!review.debrief.length && <div className="photo-launch review-talk"><div><div className="eyebrow"><BroGlyph size={13} color="#4e6046"/> TALK IT THROUGH</div><p>Want to talk it through now, or pick it up tomorrow? Either is fine. A rough night reads better in the morning.</p><div className="review-talk-actions"><button className="primary" disabled={talking || !done.length} onClick={() => void talk()}>{talking ? "Thinking…" : "Now"}</button><Link className="secondary" href={`/season/${id}`}>Tomorrow</Link></div>{!done.length && <p className="score-note">Finish a game first and the coach will have something to say.</p>}</div></div>}
        {review.debrief.map((t, k) => t.role === "coach" ? <div key={k} className="card coach-turn"><div className="coach-head"><span className="coach-avatar"><BroGlyph size={14} color="#ddf29a"/></span><span className="eyebrow">COACH</span></div><p>{t.text}</p>
          {t.ideas?.length ? <div className="idea-list"><div className="eyebrow">IDEAS TO TRY · NOT A DIAGNOSIS</div>{t.ideas.map((i, n) => <div key={i.key} className="idea"><span className="idea-n">{n + 1}</span><div><p>{i.text}</p><a href={i.url} target="_blank" rel="noreferrer">{i.source} · {i.agree} of 3 sources agree <ArrowUpRight size={11}/></a></div></div>)}</div> : null}
          {t.question && <p className="coach-question">{t.question}</p>}
        </div> : <div key={k} className="bowler-turn"><span className="eyebrow">{name.toUpperCase()}</span><p>{t.text}</p></div>)}
        {awaiting && <div className="photo-launch review-talk"><div><div className="eyebrow">YOUR ANSWER</div><NoteField value={answer} onChange={setAnswer} placeholder="Type or tap the mic…"/><div className="review-talk-actions"><button className="primary" disabled={talking || !answer.trim()} onClick={() => void talk(answer)}>{talking ? "Thinking…" : "Answer"}</button><Link className="secondary" href={`/season/${id}`}>Done for tonight</Link></div></div></div>}
        {review.closed && <div className="review-talk-actions"><Link className="secondary" href={`/season/${id}`}>Back to the week</Link></div>}
      </section>
      <p className="score-note review-status" role="status">{status}</p>
    </>}
    <footer><span>BA4L</span><span>Bowling Bro’. A BA4L thing.</span></footer>
  </main>;
}

/** A note with a mic. Web Speech where the browser has it; typing everywhere. */
function NoteField({ value, onChange, placeholder = "Anything worth remembering about this game" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Recognizer | null>(null);
  useEffect(() => { const w = window as SpeechWindow; setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition)); return () => rec.current?.abort(); }, []);
  const start = () => {
    const w = window as SpeechWindow; const C = w.SpeechRecognition || w.webkitSpeechRecognition; if (!C) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new C(); r.lang = "en-US"; r.interimResults = false; r.continuous = false;
    r.onresult = e => { const heard = Array.from(e.results).map(x => x[0].transcript).join(" ").trim(); if (heard) onChange((value ? value + " " : "") + heard); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  };
  return <div className="note-field">
    <textarea value={value} onChange={e => onChange(e.target.value.slice(0, 600))} placeholder={placeholder} rows={2} maxLength={600} aria-label="Note"/>
    {supported && <button type="button" className={`mic ${listening ? "on" : ""}`} onClick={start} aria-label={listening ? "Stop listening" : "Say it instead"} aria-pressed={listening}>{listening ? <X size={18}/> : <Mic size={18}/>}</button>}
  </div>;
}
