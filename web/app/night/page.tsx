"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, CircleDot, History, RotateCcw, Trophy, X } from "lucide-react";
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
    const target = me.scorebooks[0]?.id ?? me.legacy?.[0]?.id;
    if (target) window.location.replace(`/night?night=${target}`);
  }, [ready, shared, me]);
  const [selected, setSelected] = useState(0);
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

  return <main>
    <Topbar right={<AccountBar me={me} nightId={id} role={role} onClaimed={()=>void reload()}/>}/>
    <Crumbs items={[{label:"Season",href:"/season"},...(shared&&id?[{label:"This week",href:`/season/${id}`}]:[]),{label:"Live scorebook"}]}/>
    <section className="intro"><div><div className="eyebrow">LIVE SCOREBOOK</div><h1>Score the <em>night.</em></h1><p>Tap pins, scan the board, or say a roll. Points update as games finish.</p></div>{shared&&id?<a className="secondary history-button" href={`/season/${id}`}><History size={17}/> This week</a>:<button className="secondary history-button" onClick={()=>setModal("history")}><History size={17}/> Game history</button>}</section>
    <div className="session-bar"><div><span className="live-dot"/> GAME {night.game}<span className="muted"> / </span>{night.prebowl?`PRE-BOWL · WEEK ${night.prebowl.week} · ${night.prebowl.bowlers.map(i=>names[i].toUpperCase()).join(" & ")}`:"4 BOWLERS"}</div><span className="save-status" role="status"><Check size={14}/>{status}</span></div>
    <div className="sharing-bar"><button className="secondary" disabled={!ready} onClick={()=>void share()}>{shared?"Share team link":"Save & share with team"}</button><span>{shared?"Phones with this link stay in sync.":"Saves it for the whole team."}</span>{shared&&<a className="text-button" href="/night?new=1"><CircleDot size={15}/> Start a new night</a>}</div>
    {shareMessage&&<p className="photo-success" role="status">{shareMessage}</p>}
    {error&&<div className="sync-error" role="alert"><p>{error}</p>{needsSignIn&&<a className="secondary" href={`/login?next=${encodeURIComponent(typeof window==="undefined"?"/":window.location.pathname+window.location.search)}`}>Sign in to open this scorebook</a>}<button className="secondary" onClick={()=>void retry()}>Retry save / load</button>{shared&&<button className="secondary" onClick={()=>void reload()}>Discard unsaved edits & reload team</button>}</div>}
    <PhotoImport disabled={!ready} onApply={updates=>{setBeforePhoto(night);setNight(n=>({...n,finals:n.finals?.map((v,i)=>updates.some(u=>u.index===i)?null:v),rolls:n.rolls.map((r,i)=>updates.find(u=>u.index===i)?.rolls??r)}))}}/>
    <VoiceEntry night={night} disabled={!ready} onApply={review=>{setNight(n=>n.game!==review.game||JSON.stringify(n.rolls[review.index])!==review.before||n.finals?.[review.index]!=null?n:{...n,rolls:n.rolls.map((r,i)=>i===review.index?review.rolls:r)});setSelected(review.index)}}/>
    {beforePhoto&&<button disabled={!ready} className="text-button photo-undo" onClick={()=>{setNight(beforePhoto);setBeforePhoto(null)}}><RotateCcw size={15}/> Undo photo import and subsequent rolls</button>}
    <section className="team-grid" aria-label="Team scoreboard">
      {names.map((name,i)=><button key={name} className={`bowler-card ${selected === i ? "selected" : ""} ${night.prebowl&&!night.prebowl.bowlers.includes(i)?"sitting":""}`} onClick={()=>setSelected(i)} aria-pressed={selected === i}>
        <div className="card-top"><span className={`avatar avatar-${i}`}>{name[0]}</span><span className="bowler-name">{name}</span>{selected === i && <span className="active-label">SCORING</span>}</div>
        <div className="card-scores"><div><span className="small-label">SCORE</span><strong>{states[i].score}</strong></div><span className="score-divider"/><div><span className="small-label">{states[i].complete ? "FINAL" : "POSSIBLE"}</span><strong className="possible">{ceilings[i]}</strong></div></div>
        <div className="card-footer"><span>{states[i].complete ? "Game complete" : `Frame ${states[i].frame} · Ball ${states[i].ball}`}</span><ChevronRight size={15}/></div>
      </button>)}
    </section>
    <div className="workspace">
      <section className="score-panel">
        <div className="panel-heading"><div><div className="eyebrow">AT THE LINE</div><h2>{names[selected]}’s game<span className="game-chip">{state.complete ? "Complete" : `Frame ${state.frame} of 10`}</span></h2></div><span className={`avatar avatar-${selected}`}>{names[selected][0]}</span></div>
        <div className="ceiling-hero" aria-live="polite"><div><span className="small-label">{state.complete ? "FINAL SCORE" : "YOUR HIGHEST POSSIBLE FINISH"}</span><div className="hero-number">{ceilings[selected]}<ArrowUpRight aria-hidden="true"/></div><p>{state.complete ? "That’s a wrap. Every pin counted." : "Clear the remaining pins. Strike the rest of the way."}</p></div><div className="pin-art" aria-hidden="true"><span>●</span><span>● ●</span><span>● ● ●</span><span>● ● ● ●</span></div></div>
        <div className="scorecard-scroll" tabIndex={0} aria-label="Ten-frame scorecard"><table><thead><tr>{state.frames.map((_,i)=><th className={i+1 === state.frame && !state.complete ? "current" : ""} key={i} scope="col">{i+1}</th>)}</tr></thead><tbody><tr>{state.frames.map((f,i)=><td key={i} className={i+1 === state.frame && !state.complete ? "current" : ""}><div className="frame-rolls">{Array.from({length:i === 9 ? 3 : 2},(_,j)=><span key={j}>{symbol(f.rolls,j) || "·"}</span>)}</div><strong>{f.score ?? ""}</strong></td>)}</tr></tbody></table></div>
        <p className="score-note">Scores include resolved bonuses. Strikes and spares wait for the next rolls.</p>
        {night.finals?.[selected]!=null&&<p className="score-note">Final total recorded from your score sheet. The frame marks may be incomplete.</p>}
        <div className="entry-heading"><div><h3>{state.complete ? "Game in the books." : "How many pins?"}</h3><p>{state.complete ? "Start the next game when the whole team is ready." : `Ball ${state.ball} · ${state.available} pins standing`}</p></div><button className="text-button" onClick={undo} disabled={!ready || !night.rolls[selected].length}><RotateCcw size={15}/> Undo</button></div>
        {!state.complete && <div className="pin-buttons">{Array.from({length:state.available+1},(_,pins)=><button disabled={!ready} key={pins} onClick={()=>roll(pins)} className={pins === state.available ? "clear-pins" : ""} aria-label={pins === 10 ? "Strike, 10 pins" : pins === state.available && pins > 0 ? `Spare, ${pins} pins` : `${pins} pins`}><strong>{pins === 10 ? "X" : pins === state.available && state.available < 10 ? "/" : pins}</strong><span>{pins === 10 ? "STRIKE" : pins === state.available && state.available < 10 ? "SPARE" : pins === 0 ? "MISS" : "PINS"}</span></button>)}</div>}
      </section>
      <aside className="side-panel"><PrebowlPanel night={night} setNight={setNight} disabled={!ready}/><MatchPanel night={night} setNight={setNight} disabled={!ready}/><TargetsPanel night={night}/><section className="team-summary"><div className="eyebrow"><Trophy size={16}/> THE BIG PICTURE</div><h3>Team potential</h3><strong className="team-total">{teamMax.toLocaleString()}</strong><p>Combined best possible score<br/>for this game.</p><div className="potential-track"><span style={{width:`${teamMax/12}%`}}/></div><div className="range-labels"><span>0</span><span>1,200 PERFECT GAME</span></div><div className="summary-divider"/><div className="summary-row"><span>Team score so far</span><strong>{states.reduce((a,s)=>a+s.score,0)}</strong></div><div className="summary-row"><span>Games recorded</span><strong>{night.history.length}</strong></div></section>
      <section className="tip"><span className="tip-icon">↗</span><div><h3>It’s never over early.</h3><p>A nine on your first ball still leaves a 290 on the table. Every frame is a new opportunity.</p></div></section><button className="secondary next-game" onClick={()=>setModal("new")} disabled={!ready}>Start next game <ArrowUpRight size={17}/></button><p className="device-note">{shared?"Saved in Supabase. Share the team link to keep every phone on the same scorebook.":"Saved on this device. Tap Save & share with team to sync across phones."}</p></aside>
    </div><footer><span>BA4L</span><span>Made for the love of league night.</span></footer>
    <dialog ref={dialogRef} onCancel={()=>setModal(null)} onClick={e=>{if(e.target === e.currentTarget)setModal(null)}}><div className="dialog-inner"><button className="close-button" aria-label="Close dialog" onClick={()=>setModal(null)}><X size={20}/></button>{modal === "new" ? <><div className="eyebrow">NEXT UP</div><h2>Ready for game {night.game+1}?</h2><p>This saves everyone’s current scorecard in game history and starts a fresh game for all four bowlers.{states.some(s=>!s.complete) ? " Some bowlers have not finished yet." : ""}</p><button disabled={!ready} className="primary" onClick={()=>{setNight(n=>({rolls:names.map(()=>[]),game:n.game+1,drinkTargets:n.drinkTargets,match:n.match,prebowl:n.prebowl,history:[...n.history,{game:n.game,rolls:n.rolls,finals:n.finals}]}));setSelected(0);setModal(null)}}>Save & start next game</button><button className="secondary" onClick={()=>setModal(null)}>Keep bowling</button></> : <><div className="eyebrow">THE SCOREBOOK</div><h2>Game history</h2>{night.history.length ? [...night.history].reverse().map(h=><div className="history-game" key={h.game}><h3>Game {h.game}</h3>{names.map((name,i)=><div className="summary-row" key={name}><span>{name}{h.finals?.[i]==null&&!analyze(h.rolls[i]).complete ? " (unfinished)" : ""}</span><strong>{h.finals?.[i]??analyze(h.rolls[i]).score}</strong></div>)}<div className="summary-row"><span>Team total</span><strong>{h.rolls.reduce((total,rolls,i)=>total+(h.finals?.[i]??analyze(rolls).score),0)}</strong></div></div>) : <p>Your saved games will appear here when you start the next game.</p>}</>}</div></dialog>
  </main>;
}
