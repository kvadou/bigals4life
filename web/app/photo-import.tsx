"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, X } from "lucide-react";
import { analyze, maximum } from "@/lib/bowling";
import { parseRollText } from "@/lib/photo-import";

type Candidate = {name:string;rolls:number[];note:string};
type Row = {name:string;text:string;note:string;target:string};
const names = ["Doug","Mustafa","Kyle","Pete"];

async function prepare(file: File): Promise<Blob> {
  if (file.size > 30_000_000) throw new Error("That photo is too large. Choose a smaller photo.");
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url; await image.decode();
    const scale = Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth*scale); canvas.height = Math.round(image.naturalHeight*scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable on this browser.");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
    if (!blob || blob.size > 2_500_000) throw new Error("Please crop the photo closer to the scoreboard and try again.");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export default function PhotoImport({onApply,disabled,requestedOpen=false}:{requestedOpen?:boolean;onApply:(updates:{index:number;rolls:number[]}[])=>void;disabled:boolean}) {
  const [open,setOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [warning,setWarning] = useState("");
  const [rows,setRows] = useState<Row[]>([]);
  const [preview,setPreview] = useState("");
  const [applied,setApplied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController|null>(null);
  useEffect(()=>{if(requestedOpen)setOpen(true)},[requestedOpen]);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  const close=()=>{controller.current?.abort();setBusy(false);setOpen(false)};
  const read=async(file?:File)=>{
    if(!file)return;
    setRows([]);setError("");setWarning("");setBusy(true);setApplied(false);
    const abort=new AbortController();controller.current=abort;
    try {
      const image=await prepare(file); if(abort.signal.aborted)return;
      setPreview(URL.createObjectURL(image));
      const body=new FormData();body.set("image",image,"scoreboard.jpg");
      const response=await fetch("/api/scoreboard",{method:"POST",body,signal:abort.signal});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || "Could not read this photo.");
      setWarning(result.warning || "");
      setRows(result.bowlers.map((b:Candidate)=>({name:b.name,text:b.rolls.join(" "),note:b.note,target:b.rolls.length ? String(names.findIndex(n=>n.toLowerCase()===b.name.trim().toLowerCase())) : "-1"})));
      if(!result.bowlers.length)setError(result.warning || "No readable bowling rows found. Include names and all ten frames in the photo.");
    } catch(e) {if(!abort.signal.aborted)setError(e instanceof Error ? e.message : "Could not read the photo. Please try again.")}
    finally {if(!abort.signal.aborted)setBusy(false)}
  };
  const parsed=rows.map(row=>{try{return {rolls:parseRollText(row.text),error:""}}catch(e){return {rolls:[],error:e instanceof Error?e.message:"Check marks"}}});
  const selected=rows.map((row,i)=>({...row,...parsed[i]})).filter(r=>r.target!=="-1");
  const duplicate=new Set(selected.map(r=>r.target)).size!==selected.length;
  const canApply=selected.length>0&&!duplicate&&selected.every(r=>!r.error&&r.rolls.length>0);
  return <>
    <button className="photo-launch" disabled={disabled} onClick={()=>{setOpen(true);setApplied(false)}}><Camera size={19}/><span>Scan the scoreboard<small>Take a photo. Review. Keep bowling.</small></span><span aria-hidden="true">↗</span></button>
    {applied&&<p className="photo-success" role="status">Photo scores applied. Use Undo photo import below to restore the previous scorecards.</p>}
    <dialog ref={dialog} onCancel={close} aria-labelledby="photo-title"><div className="dialog-inner photo-dialog">
      <button className="close-button" aria-label="Close photo import" onClick={close}><X size={20}/></button>
      <div className="eyebrow">LESS TAPPING. MORE BOWLING.</div><h2 id="photo-title">Scan the scoreboard</h2>
      <p>Get close enough to read the names and every frame. Avoid glare and keep the whole score grid in view.</p>
      <div className="photo-actions"><button className="primary" disabled={busy} onClick={()=>camera.current?.click()}><Camera size={18}/> Take photo</button><button className="secondary" disabled={busy} onClick={()=>gallery.current?.click()}><ImagePlus size={18}/> Choose photo</button></div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void read(e.target.files?.[0]);e.target.value=""}}/>
      <input ref={gallery} type="file" accept="image/*" hidden onChange={e=>{void read(e.target.files?.[0]);e.target.value=""}}/>
      <p className="photo-privacy">The photo is sent to AI for reading. Check every row before applying. Running totals alone aren’t enough.</p>
      {preview&&<img className="photo-preview" src={preview} alt="Your scoreboard photo for comparison"/>}
      {busy&&<div className="photo-loading" role="status"><LoaderCircle size={20}/> Reading the frame marks…</div>}
      {error&&<p className="photo-error" role="alert">{error}</p>}
      {warning&&!error&&<p className="photo-warning">{warning}</p>}
      {rows.length>0&&<><h3>Review the rolls</h3><p className="review-hint">These replace the selected bowlers’ scorecards for the current game. Edit any wrong pins below. Use spaces between rolls, X for strike, / for spare.</p>
        {rows.map((row,i)=><section className="photo-row" key={i}><label>Scoreboard row: <strong>{row.name || `Row ${i+1}`}</strong><select aria-label={`Assign row ${i+1} to bowler`} value={row.target} onChange={e=>setRows(r=>r.map((v,j)=>j===i?{...v,target:e.target.value}:v))}><option value="-1">Skip this row</option>{names.map((name,j)=><option key={name} value={j}>{name}</option>)}</select></label><label>Rolls, starting at frame 1<textarea rows={2} value={row.text} placeholder="X 7 / 9 0" onChange={e=>setRows(r=>r.map((v,j)=>j===i?{...v,text:e.target.value}:v))}/></label>{row.note&&<p className="photo-warning">{row.note}</p>}{parsed[i].error?<p className="photo-error">{parsed[i].error}</p>:<p className="review-score">Score {analyze(parsed[i].rolls).score} · Possible {maximum(parsed[i].rolls)} · {parsed[i].rolls.length} rolls</p>}</section>)}
        {duplicate&&<p className="photo-error">Assign each bowler only once.</p>}
        <button className="primary" disabled={disabled||!canApply||busy} onClick={()=>{onApply(selected.map(r=>({index:Number(r.target),rolls:r.rolls})));setOpen(false);setApplied(true);setRows([]);setPreview("")}}>Apply {selected.length} bowler{selected.length===1?"":"s"}</button>
      </>}
    </div></dialog>
  </>;
}
