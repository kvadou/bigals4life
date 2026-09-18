"use client";
import { OriginLink as Link } from "@/app/components/crumbs";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, CircleDot, History, RotateCcw, X } from "lucide-react";
import { analyze, maximum, symbol } from "@/lib/bowling";
import PhotoImport from "../photo-import";
import { useScorebook } from "../use-scorebook";
import type { Night } from "@/lib/scorebook";
import VoiceEntry from "../voice-entry";
import MatchPanel from "../match-panel";
import TargetsPanel from "../targets-panel";
import PrebowlPanel from "../prebowl-panel";
import { AccountBar, useMe } from "../account";
import { Topbar } from "../components/topbar";
import { Crumbs } from "../components/crumbs";

const names = ["Doug", "Mustafa", "Kyle", "Pete"];
const fresh = (): Night => ({ rolls: names.map(() => []), game: 1, history: [] });
const key = "strike-ceiling-web-v1";

export default function Home() {
  const {night,setNight,ready,status,error,shared,share,shareMessage,role,needsSignIn,id,retry,reload} = useScorebook(fresh,key);
  const me = useMe();
  // Signed in with no scorebook selected: open the latest one you belong to (or, for the admin, the fullest unclaimed one).
  useEffect(() => {
    if (!ready || shared || !me) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("night") || params.has("new")) return;
    params.delete("latest");
    const target = me.scorebooks[0]?.id ?? me.legacy?.[0]?.id;
    if (target) { params.set("night", target); window.location.replace(`/night?${params}`); }
  }, [ready, shared, me]);
  const [selected, setSelected] = useState(0);
  const [entryMode, setEntryMode] = useState<string | null>(null);
  useEffect(() => { setEntryMode(new URLSearchParams(window.location.search).get("mode")); }, []);
  // A pre-bowl opens on the pre-bowler's column, not Doug's.
  useEffect(() => { const b = night.prebowl?.bowlers; if (b && !b.includes(selected)) setSelected(b[0]); }, [night.prebowl]); // eslint-disable-line react-hooks/exhaustive-deps
  const [modal, setModal] = useState<"new" | "history" | null>(null);
  const [beforePhoto, setBeforePhoto] = useState<Night | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (modal) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [modal]);
  const states = night.rolls.map((rolls,i)=>{const s=analyze(rolls);const final=night.finals?.[i];return final==null?s:{...s,score:final,complete:true}});
  const ceilings = night.rolls.map((rolls,i)=>night.finals?.[i]??maximum(rolls));
  const state = states[selected];
  const roll = (pins: number) => {
    if (!ready || state.complete || pins > state.available) return;
    setNight(n => ({ ...n, rolls: n.rolls.map((r,i)=>i === selected ? [...r,pins] : r) }));
  };
  const undo = () => setNight(n => n.finals?.[selected]!=null ? {...n,finals:n.finals.map((v,i)=>i===selected?null:v)} : ({ ...n, rolls: n.rolls.map((r,i)=>i === selected ? r.slice(0,-1) : r) }));
  const teamMax = ceilings.reduce((a,b)=>a+b,0);

  return <main className="score-first">
    <Topbar right={<AccountBar me={me} nightId={id} role={role} onClaimed={()=>void reload()}/>}/>
    <Crumbs items={[{label:"Season",href:"/season"},...(shared&&id?[{label:"This week",href:`/season/${id}`}]:[]),{label:"Live scorebook"}]}/>
    <header className="score-title"><h1>Score</h1><span>Game {night.game}{night.prebowl ? ` · Pre-bowl week ${night.prebowl.week}` : ""}</span></header>
    {shared && id && <Link href={`/live?night=${encodeURIComponent(id)}`} className="center-link">Open Live Lane video</Link>}
    {shareMessage&&<p className="photo-success" role="status">{shareMessage}</p>}
    {error&&<div className="sync-error" role="alert"><p>{error}</p>{needsSignIn&&<a className="secondary" href={`/login?next=${encodeURIComponent(typeof window==="undefined"?"/":window.location.pathname+window.location.search)}`}>Sign in to open this scorebook</a>}<button className="secondary" onClick={()=>void retry()}>Retry save / load</button>{shared&&<button className="secondary" onClick={()=>void reload()}>Discard unsaved edits & reload team</button>}</div>}
    <div className="score-layout">
    <section className="bowler-rail" aria-label="Choose bowler">
      {names.map((name,i)=><button key={name} className={`bowler-tab ${selected === i ? "selected" : ""}`} onClick={()=>setSelected(i)} aria-pressed={selected === i}><span>{name}</span><strong>{states[i].score}</strong><small>{night.prebowl&&!night.prebowl.bowlers.includes(i)?"Sitting out":states[i].complete?"Final":`Frame ${states[i].frame}`}</small></button>)}
      <div className="rail-total"><span>Team score</span><strong>{states.reduce((a,s)=>a+s.score,0)}</strong></div>
    </section>
    <div className="workspace">
      <section className="score-panel">
        <div className="actual-score" aria-live="polite"><div><h2>{names[selected]}</h2><strong>{state.score}</strong></div><div className="score-context"><span>{state.complete ? "Final score" : `Frame ${state.frame} · Ball ${state.ball}`}</span>{!state.complete&&<p>Possible <b>{ceilings[selected]}</b></p>}</div></div>
        <div className="scorecard-scroll" tabIndex={0} aria-label="Ten-frame scorecard"><table><thead><tr>{state.frames.map((_,i)=><th className={i+1 === state.frame && !state.complete ? "current" : ""} key={i} scope="col">{i+1}</th>)}</tr></thead><tbody><tr>{state.frames.map((f,i)=><td key={i} className={i+1 === state.frame && !state.complete ? "current" : ""}><div className="frame-rolls">{Array.from({length:i === 9 ? 3 : 2},(_,j)=><span key={j}>{symbol(f.rolls,j) || "·"}</span>)}</div><strong>{f.score ?? ""}</strong></td>)}</tr></tbody></table></div>
        <div className="entry-heading"><h3>{state.complete ? "Game complete" : `${state.available} pins standing`}</h3><button className="text-button" onClick={undo} disabled={!ready || (!night.rolls[selected].length && night.finals?.[selected]==null)}><RotateCcw size={16}/> Undo</button></div>
        {!state.complete && <div className="score-keypad">
          <div className="number-keys">{[1,2,3,4,5,6,7,8,9,0].map(pins=><button disabled={!ready||pins>state.available} key={pins} onClick={()=>roll(pins)} className={pins===0?"zero":""} aria-label={`${pins} pins`}>{pins}</button>)}</div>
          <div className="mark-keys"><button disabled={!ready||state.available!==10} onClick={()=>roll(10)} aria-label="Strike, 10 pins"><strong>X</strong><span>Strike</span></button><button disabled={!ready||state.available===10} onClick={()=>roll(state.available)} aria-label={`Spare, ${state.available} pins`}><strong>/</strong><span>Spare</span></button></div>
        </div>}
        <div className="entry-tools">
    <PhotoImport requestedOpen={ready && entryMode === "scan"} disabled={!ready} onApply={updates=>{setBeforePhoto(night);setNight(n=>({...n,finals:n.finals?.map((v,i)=>updates.some(u=>u.index===i)?null:v),rolls:n.rolls.map((r,i)=>updates.find(u=>u.index===i)?.rolls??r)}))}}/>
    <VoiceEntry requestedOpen={ready && entryMode === "voice"} night={night} disabled={!ready} onApply={review=>{setNight(n=>n.game!==review.game||JSON.stringify(n.rolls[review.index])!==review.before||n.finals?.[review.index]!=null?n:{...n,rolls:n.rolls.map((r,i)=>i===review.index?review.rolls:r)});setSelected(review.index)}}/>
    {beforePhoto&&<button disabled={!ready} className="text-button photo-undo" onClick={()=>{setNight(beforePhoto);setBeforePhoto(null)}}><RotateCcw size={15}/> Undo photo import and subsequent rolls</button>}
        </div>
        <div className="entry-save" role="status"><Check size={16}/>{status}</div>
        <p className="score-note">Scores include resolved bonuses. Strikes and spares wait for the next rolls.</p>
        {night.finals?.[selected]!=null&&<p className="score-note">Final total recorded from your score sheet. Frame marks may be incomplete.</p>}
      </section>

      <aside className="side-panel score-details">
      <section className="team-summary"><h3>Team game {night.game}</h3><strong className="team-total">{states.reduce((a,s)=>a+s.score,0)}</strong><p>Score so far · possible {teamMax.toLocaleString()}</p></section>
      <button className="secondary next-game" onClick={()=>setModal("new")} disabled={!ready}>Start next game <ArrowUpRight size={17}/></button>
      {shared&&id?<Link className="secondary history-button" href={`/season/${id}`}><History size={17}/> This week’s scorecards</Link>:<button className="secondary history-button" onClick={()=>setModal("history")}><History size={17}/> Game history</button>}
      <details className="night-setup"><summary>Night setup & team sharing</summary>
    <div className="sharing-bar"><button className="secondary" disabled={!ready} onClick={()=>void share()}>{shared?"Share team link":"Save & share with team"}</button><span>{shared?"Phones with this link stay in sync.":"Saves it for the whole team."}</span>{shared&&<a className="text-button" href="/night?new=1"><CircleDot size={15}/> Start a new night</a>}</div>
      <PrebowlPanel night={night} setNight={setNight} disabled={!ready}/><MatchPanel night={night} setNight={setNight} disabled={!ready}/><TargetsPanel night={night}/>
      <p className="device-note">{shared?"Saved to the team. Share the link to keep every phone on the same scorebook.":"Saved on this device. Save & share with team to sync across phones."}</p></details></aside>
    </div>
    </div><footer><span>BA4L</span><span>Made for the love of league night.</span></footer>
    <dialog ref={dialogRef} onCancel={()=>setModal(null)} onClick={e=>{if(e.target === e.currentTarget)setModal(null)}}><div className="dialog-inner"><button className="close-button" aria-label="Close dialog" onClick={()=>setModal(null)}><X size={20}/></button>{modal === "new" ? <><div className="eyebrow">NEXT UP</div><h2>Ready for game {night.game+1}?</h2><p>This saves everyone’s current scorecard in game history and starts a fresh game for all four bowlers.{states.some(s=>!s.complete) ? " Some bowlers have not finished yet." : ""}</p><button disabled={!ready} className="primary" onClick={()=>{setNight(n=>({rolls:names.map(()=>[]),game:n.game+1,drinkTargets:n.drinkTargets,match:n.match,prebowl:n.prebowl,history:[...n.history,{game:n.game,rolls:n.rolls,finals:n.finals}]}));setSelected(0);setModal(null)}}>Save & start next game</button><button className="secondary" onClick={()=>setModal(null)}>Keep bowling</button></> : <><div className="eyebrow">THE SCOREBOOK</div><h2>Game history</h2>{night.history.length ? [...night.history].reverse().map(h=><div className="history-game" key={h.game}><h3>Game {h.game}</h3>{names.map((name,i)=><div className="summary-row" key={name}><span>{name}{h.finals?.[i]==null&&!analyze(h.rolls[i]).complete ? " (unfinished)" : ""}</span><strong>{h.finals?.[i]??analyze(h.rolls[i]).score}</strong></div>)}<div className="summary-row"><span>Team total</span><strong>{h.rolls.reduce((total,rolls,i)=>total+(h.finals?.[i]??analyze(rolls).score),0)}</strong></div></div>) : <p>Your saved games will appear here when you start the next game.</p>}</>}</div></dialog>
  </main>;
}
