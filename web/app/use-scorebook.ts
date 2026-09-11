"use client";
import { useEffect, useRef, useState } from "react";
import { Night, nightSchema } from "@/lib/scorebook";
import { resolveScorebookLink } from "@/lib/scorebook-link";

export function useScorebook(fresh:()=>Night,key:string){
  const [night,display]=useState<Night>(fresh);
  const current=useRef(night), revision=useRef(0), busy=useRef(false), pending=useRef<Night|null>(null), id=useRef("");
  const [ready,setReady]=useState(false),[status,setStatus]=useState("Loading saved game…"),[error,setError]=useState("");
  const [shared,setShared]=useState(false);
  const [shareMessage,setShareMessage]=useState("");
  const show=(n:Night)=>{current.current=n;display(n)};
  const backup=(n:Night)=>{try{localStorage.setItem(id.current?`${key}:${id.current}`:key,JSON.stringify(n))}catch{/* Cloud saving remains available. */}};
  const load=async()=>{
    if(busy.current)return;
    busy.current=true;setReady(false);
    try{
      const response=await fetch(`/api/nights/${id.current}`,{cache:"no-store"});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      const parsed=nightSchema.parse(result.state);
      revision.current=result.revision;show(parsed);backup(parsed);pending.current=null;
      setError("");setStatus("Saved to team · Supabase");setReady(true);
    }catch(e){setError(e instanceof Error?e.message:"Could not load team scores.");setStatus("Team scores unavailable")}
    finally{busy.current=false}
  };
  useEffect(()=>{
    let remembered:string|null=null;
    try{remembered=localStorage.getItem(`${key}:last-team`)}catch{}
    let candidate:string|null;
    try{candidate=resolveScorebookLink(new URLSearchParams(window.location.search).get("night"),remembered)}catch(e){setError((e as Error).message);return}
    if(candidate){
      try{localStorage.setItem(`${key}:last-team`,candidate)}catch{}
      const url=new URL(window.location.href);url.searchParams.set("night",candidate);
      window.history.replaceState(null,"",url);
      id.current=candidate;setShared(true);void load();
    }else{
      try{const raw=localStorage.getItem(key);if(raw){const parsed=nightSchema.safeParse(JSON.parse(raw));if(parsed.success)show(parsed.data)}}catch{}
      setReady(true);setStatus("Saved on this device");
    }
    const refresh=async()=>{
      if(!id.current||busy.current||pending.current)return;
      try{
        const response=await fetch(`/api/nights/${id.current}`,{cache:"no-store"});
        const result=await response.json();
        if(response.ok&&!busy.current&&!pending.current&&result.revision>revision.current){
          revision.current=result.revision;const parsed=nightSchema.parse(result.state);show(parsed);backup(parsed);setReady(true);setError("");setStatus("Saved to team · Supabase");
        }
      }catch{/* A save still fails visibly if connectivity is lost. */}
    };
    const resume=()=>{if(document.visibilityState==="visible")void refresh()};
    const timer=setInterval(refresh,5000);
    window.addEventListener("focus",resume);window.addEventListener("online",resume);document.addEventListener("visibilitychange",resume);
    return()=>{clearInterval(timer);window.removeEventListener("focus",resume);window.removeEventListener("online",resume);document.removeEventListener("visibilitychange",resume)};
  },[]);
  const save=async(n:Night)=>{
    busy.current=true;setReady(false);setStatus("Saving to team…");pending.current=n;backup(n);
    try{
      const response=await fetch(`/api/nights/${id.current}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({state:n,revision:revision.current})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      revision.current=result.revision;pending.current=null;setError("");setStatus("Saved to team · Supabase");setReady(true);
    }catch(e){setError(e instanceof Error?e.message:"Could not save to team.");setStatus("Not saved to team")}
    finally{busy.current=false}
  };
  const setNight=(update:Night|((n:Night)=>Night))=>{
    if(busy.current||pending.current)return;
    const next=nightSchema.parse(typeof update==="function"?update(current.current):update);
    show(next);
    if(id.current)void save(next);
    else{try{localStorage.setItem(key,JSON.stringify(next));setStatus("Saved on this device")}catch{setError("Local saving unavailable. Keep this page open.")}}
  };
  const share=async()=>{
    if(busy.current)return;
    busy.current=true;setReady(false);
    try{
      if(!id.current){
        const response=await fetch("/api/nights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({state:current.current})});
        const result=await response.json();if(!response.ok)throw Error(result.error);
        id.current=result.id;revision.current=result.revision;setShared(true);
        try{localStorage.setItem(`${key}:last-team`,id.current)}catch{}
        window.history.replaceState(null,"",`?night=${id.current}`);setStatus("Saved to team · Supabase");
      }
      const url=`${window.location.origin}/?night=${id.current}`;
      if(navigator.share){await navigator.share({title:"Our bowling scorebook",url})}
      else{await navigator.clipboard.writeText(url);setShareMessage("Team link copied. Anyone with it can view and update these scores.")}
    }catch(e){if(!(e instanceof DOMException&&e.name==="AbortError"))setError(e instanceof Error?e.message:"Could not share. Copy this page’s address.")}
    finally{busy.current=false;setReady(true)}
  };
  return {night,setNight,ready,status,error,shared,share,shareMessage,retry:()=>pending.current?save(pending.current):load(),reload:load};
}
