"use client";
import { useEffect, useId, useRef, useState } from "react";
import { api, terminalSessionError } from "./types";
import "./gallery.css";
type Event = {id:string;kind:"reaction"|"comment"|"coach";text:string;author:string;createdAt:string;isMine:boolean};
const reactions = [["🎳","Bowling"],["🔥","Fire"],["👏","Applause"],["😂","Laugh"],["💪","Strong"],["🦃","Turkey"]];
const chirps = ["That pin owes you money.","Save some strikes for Thursday.","The gutter called. You declined."];
export default function PeanutGallery({sessionId,connected,isOwner}:{sessionId:string;connected:boolean;isOwner:boolean}) {
  const composerId=useId();
  const [hidden,setHidden]=useState(false),[visible,setVisible]=useState(true),[events,setEvents]=useState<Event[]>([]),[paused,setPaused]=useState(false),[loaded,setLoaded]=useState(false);
  const [text,setText]=useState(""),[kind,setKind]=useState<"comment"|"coach">("comment"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [confirmation,setConfirmation]=useState<{paused:boolean}|{removeId:string}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),controller=useRef<AbortController|null>(null),revision=useRef(0),pending=useRef(false),writes=useRef(0);
  const feed=useRef<HTMLOListElement>(null),follow=useRef(true);
  useEffect(()=>{if(follow.current&&feed.current)feed.current.scrollTop=feed.current.scrollHeight;},[events]);
  const active=connected&&!hidden&&visible;
  useEffect(()=>{follow.current=true;setEvents([]);setLoaded(false);setPaused(false);setText("");setError("");setNotice("");},[sessionId]);
  useEffect(()=>{const update=()=>setVisible(document.visibilityState==="visible");update();document.addEventListener("visibilitychange",update);return()=>document.removeEventListener("visibilitychange",update);},[]);
  useEffect(()=>{
    revision.current++; const current=revision.current;
    const abort=new AbortController();controller.current=abort;pending.current=false;setBusy(false);
    if(!active)return()=>{abort.abort();revision.current++;};
    let running=false;
    const refresh=async()=>{if(running||pending.current)return;running=true;const before=writes.current;try{
      const result=await api<{events:Event[];paused:boolean}>(`/${sessionId}/gallery`,{signal:abort.signal});
      if(current===revision.current&&before===writes.current){setEvents(result.events.slice(-50));setPaused(result.paused);setLoaded(true);}
    }catch(err){if(!abort.signal.aborted&&current===revision.current){if(terminalSessionError(err)){setEvents([]);setLoaded(false);}setError(err instanceof Error?err.message:"Gallery could not refresh.");}}finally{running=false;}};
    void refresh();const timer=setInterval(()=>void refresh(),3000);
    return()=>{abort.abort();clearInterval(timer);revision.current++;};
  },[sessionId,active]);
  useEffect(()=>{if(confirmation)dialog.current?.showModal();else dialog.current?.close();},[confirmation]);
  useEffect(()=>{if(!active)setConfirmation(null);},[active]);
  async function mutate(body:{kind:Event["kind"];text:string}|{paused:boolean}|{removeId:string}) {
    if(pending.current||!active)return;pending.current=true;writes.current++;setBusy(true);setError("");setNotice("");const current=revision.current;
    try{
      const posting="kind" in body;
      const result=await api<{event?:Event}>(`/${sessionId}/gallery`,{method:posting?"POST":"PATCH",body:JSON.stringify(body),signal:controller.current?.signal});
      if(current!==revision.current)return;
      writes.current++;
      if(posting&&!result.event)throw new Error("The server did not confirm this post. Refresh before retrying.");
      if(posting&&result.event){setEvents(old=>[...old.filter(item=>item.id!==result.event!.id),result.event!].slice(-50));if(body.kind!=="reaction")setText("");setNotice("Posted to the gallery.");}
      else if("paused" in body){setPaused(body.paused);setNotice(body.paused?"Gallery posting paused.":"Gallery posting resumed.");}
      else if("removeId" in body){setEvents(old=>old.filter(item=>item.id!==body.removeId));setNotice("Message removed.");}
      setConfirmation(null);
    }catch(err){if(current===revision.current)setError(err instanceof Error?err.message:"Not posted. Try again.");}
    finally{if(current===revision.current){pending.current=false;setBusy(false);}}
  }
  return <section className="peanut-gallery" aria-label="Peanut Gallery"><header><div><p className="studio-kicker">From the sidelines</p><h2>Peanut Gallery</h2></div><button aria-expanded={!hidden} onClick={()=>setHidden(!hidden)}>{hidden?"Show gallery":"Hide gallery"}</button></header>
    {hidden?<p className="studio-caption">Hidden on this device. Your camera keeps running.</p>:<>
      <div className="gallery-status"><p>{!connected?"Join the studio to see and send messages.":paused?"The host has paused posting. You can still read the gallery.":"A little encouragement. A little friendly heckling."}</p>{isOwner&&<button disabled={!active||busy||!loaded} onClick={()=>setConfirmation({paused:!paused})}>{paused?"Resume posting":"Pause posting"}</button>}</div>
      {error&&!confirmation&&<p role="alert" className="studio-error">{error}</p>}{notice&&<p role="status" className="studio-notice">{notice}</p>}
      <ol ref={feed} onScroll={()=>{const el=feed.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<64;}} className="gallery-feed" aria-label="Recent gallery messages">{events.map(item=><li key={item.id}><div><strong>{item.author}{item.isMine?" · You":""}</strong><span>{item.kind==="coach"?"Coaching · ":""}<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time></span></div><p className={item.kind==="reaction"?"gallery-reaction":""}>{item.text}</p>{isOwner&&<button disabled={!active||busy} aria-label={`Remove message from ${item.author}`} onClick={()=>setConfirmation({removeId:item.id})}>Remove</button>}</li>)}</ol>
      {!events.length&&<p className="gallery-empty">{loaded?"No comments yet. Be the first to cheer them on.":"Messages appear here when you join."}</p>}
      <fieldset disabled={!active||paused||busy||!loaded}><legend className="sr-only">Send a reaction or message</legend><div className="gallery-reactions">{reactions.map(([emoji,label])=><button key={emoji} aria-label={`React: ${label}`} onClick={()=>void mutate({kind:"reaction",text:emoji})}>{emoji}</button>)}</div>
      <details><summary>Need a good chirp?</summary><div className="gallery-chirps">{chirps.map(chirp=><button key={chirp} onClick={()=>{setKind("comment");setText(chirp);}}>{chirp}</button>)}</div></details>
      <form onSubmit={event=>{event.preventDefault();if(text.trim())void mutate({kind,text:text.trim()});}}><label>Message style<select value={kind} onChange={event=>setKind(event.target.value as "comment"|"coach")}><option value="comment">Commentary</option><option value="coach">Coaching</option></select></label><label htmlFor={composerId}>{kind==="coach"?"Coaching tip":"Your comment"}</label><textarea id={composerId} maxLength={280} value={text} onChange={event=>setText(event.target.value)} placeholder={kind==="coach"?"One helpful thing to try next…":"Give them something to smile about…"}/><div className="gallery-compose-footer"><span>{text.length}/280</span><button type="submit" className="studio-primary" disabled={!text.trim()}>{busy?"Sending…":"Send message"}</button></div></form></fieldset>
    </>}
    <dialog ref={dialog} className="gallery-dialog" aria-labelledby="gallery-confirm-title" onCancel={()=>setConfirmation(null)} onClose={()=>setConfirmation(null)}><h2 id="gallery-confirm-title">{confirmation&&"removeId" in confirmation?"Remove this message?":confirmation&&"paused" in confirmation&&confirmation.paused?"Pause gallery posting?":"Resume gallery posting?"}</h2><p>{confirmation&&"removeId" in confirmation?"This removes the message for everyone in this studio.":"This changes posting for everyone. Cameras and saved clips are unaffected."}</p><div>{error&&confirmation&&<p role="alert">{error}</p>}<button autoFocus disabled={busy} onClick={()=>setConfirmation(null)}>Cancel</button><button className="studio-primary" disabled={busy} onClick={()=>confirmation&&void mutate(confirmation)}>{busy?"Saving…":"Confirm"}</button></div></dialog>
  </section>;
}
