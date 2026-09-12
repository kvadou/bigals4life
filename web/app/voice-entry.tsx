"use client";
import {useEffect,useRef,useState} from "react";
import {Mic,Square,X} from "lucide-react";
import {parseVoiceRoll} from "@/lib/voice-roll";
import {analyze,maximum} from "@/lib/bowling";
import type {Night} from "@/lib/scorebook";
type Recognizer={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognizer;webkitSpeechRecognition?:new()=>Recognizer};
type Review=ReturnType<typeof parseVoiceRoll>&{game:number;before:string};
export default function VoiceEntry({night,disabled,onApply,requestedOpen=false}:{requestedOpen?:boolean;night:Night;disabled:boolean;onApply:(review:Review)=>void}){
  const [open,setOpen]=useState(false),[text,setText]=useState(""),[listening,setListening]=useState(false),[error,setError]=useState(""),[review,setReview]=useState<Review|null>(null),[supported,setSupported]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),recognizer=useRef<Recognizer|null>(null),timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const stop=()=>{recognizer.current?.abort();recognizer.current=null;if(timeout.current)clearTimeout(timeout.current);setListening(false)};
  const close=()=>{stop();setOpen(false)};
  useEffect(()=>{const w=window as SpeechWindow;setSupported(Boolean(w.SpeechRecognition||w.webkitSpeechRecognition));return()=>{recognizer.current?.abort();if(timeout.current)clearTimeout(timeout.current)}},[]);
  useEffect(()=>{if(requestedOpen)setOpen(true)},[requestedOpen]);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open]);
  const start=()=>{
    const w=window as SpeechWindow;const Constructor=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(!Constructor)return;
    stop();setText("");setError("");setReview(null);
    const r=new Constructor();recognizer.current=r;r.lang="en-US";r.continuous=false;r.interimResults=false;
    r.onresult=e=>{if(recognizer.current===r){setText(Array.from(e.results).map(result=>result[0].transcript).join(" "));setReview(null)}};
    r.onerror=e=>{if(recognizer.current===r)setError(e.error==="not-allowed"?"Microphone access was denied. Enable it in your browser, or use the keyboard microphone below.":"Couldn’t hear that clearly. Try again or use the keyboard microphone below.")};
    r.onend=()=>{if(recognizer.current===r){setListening(false);if(timeout.current)clearTimeout(timeout.current)}};
    try{r.start();setListening(true);timeout.current=setTimeout(()=>{r.stop()},15_000)}catch{setListening(false);setError("Could not start the microphone. Use the keyboard microphone below.")}
  };
  const check=()=>{try{const parsed=parseVoiceRoll(text,night.rolls);if(night.finals?.[parsed.index]!=null)throw Error(`${parsed.name} has a recorded final score. Start the next game first.`);setReview({...parsed,game:night.game,before:JSON.stringify(night.rolls[parsed.index])});setError("")}catch(e){setReview(null);setError(e instanceof Error?e.message:"Check the spoken roll.")}};
  const stale=review&&(review.game!==night.game||review.before!==JSON.stringify(night.rolls[review.index])||night.finals?.[review.index]!=null);
  return <><button className="voice-launch secondary" disabled={disabled} onClick={()=>{setText("");setError("");setReview(null);setOpen(true)}}><Mic size={19}/> Say a roll</button>
    <dialog ref={dialog} onCancel={close} aria-labelledby="voice-title"><div className="dialog-inner voice-dialog"><button className="close-button" onClick={close} aria-label="Close voice entry"><X size={20}/></button><div className="eyebrow">CALL IT OUT</div><h2 id="voice-title">Say a roll</h2><p>“Doug got a strike.” “Mustafa seven.” “Kyle six then zero.” Say pins knocked down, not the running total.</p>
      {supported?<button className="primary voice-record" onClick={()=>listening?recognizer.current?.stop():start()}>{listening?<Square size={18}/>:<Mic size={18}/>} {listening?"Stop listening":"Start microphone"}</button>:<p className="voice-hint">This browser doesn’t offer speech recognition. Tap the text field and use your phone keyboard’s microphone to dictate.</p>}
      <p className="voice-hint">Your browser may send audio to its speech service. Nothing is saved until you review and confirm.</p>
      <label className="voice-label">{listening?"Listening…":"Heard / dictated text"}<textarea value={text} rows={3} placeholder="Doug got a strike" onChange={e=>{setText(e.target.value);setReview(null)}}/></label>
      {!review&&<button className="secondary" disabled={!text.trim()||listening||disabled} onClick={check}>Review roll</button>}
      {error&&<p className="voice-error" role="alert">{error}</p>}
      {review&&<div className="voice-review"><h3>{review.name} · {review.added.join(" then ")} pins</h3><p>Game {review.game} · Starting frame {analyze(night.rolls[review.index]).frame}<br/>Best possible finish after this: <strong>{maximum(review.rolls)}</strong></p>{stale&&<p className="voice-error">This scorecard changed on another phone. Review again before saving.</p>}<button className="primary" disabled={disabled||Boolean(stale)} onClick={()=>{if(stale)return;onApply(review);close()}}>Confirm {review.name}’s roll{review.added.length>1?"s":""}</button><button className="secondary" onClick={check}>Review again</button></div>}
    </div></dialog></>;
}
