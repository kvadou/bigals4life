"use client";
/* THESIS: camera first, permissions explicit, local clips independent.
   OWN-WORLD: existing BA4L forest/ivory, restrained borders, generous touch controls.
   STORY: choose activity and audience, see actual frames, capture only by choice.
   FIRST VIEWPORT: narrow setup rail beside a large video stage; primary start action in setup.
   FORM: specified Operate workspace extending the incumbent design, no identity redesign. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera as CameraIcon, Lock, Radio, VideoOff } from "lucide-react";
import { Room, RoomEvent, Track, createLocalVideoTrack, type LocalVideoTrack, type RemoteVideoTrack } from "livekit-client";
import { Topbar } from "../components/topbar";
import Camera, { type CameraSource } from "./camera";
import Clips from "./clips";
import PeanutGallery from "./gallery";
import Soundboard from "./soundboard";
import { activityNames, audienceNames, api, terminalSessionError, validId, type Activity, type Audience, type Health, type Observation, type StudioSession } from "./types";
import "./studio.css";
type Session = StudioSession & { isOwner?: boolean };
type Week = { id: string; week: number | null; bowledOn: string; prebowl: {week:number;bowlers:number[]} | null };
export default function Studio({ initialSessionId }: { initialSessionId: string }) {
  const [activity, setActivity] = useState<Activity>("practice"), [audience, setAudience] = useState<Audience>("only-me");
  const [title, setTitle] = useState(""); const [book, setBook] = useState(""); const [team, setTeam] = useState(""); const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [weeks, setWeeks] = useState<Week[]>([]), [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null); const [status, setStatus] = useState<"idle" | "joining" | "connected" | "reconnecting">("idle");
  const [sources, setSources] = useState<CameraSource[]>([]); const [selected, setSelected] = useState(""); const [videoVersion, setVideoVersion] = useState(0);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [health, setHealth] = useState<Health | null>(null);
  const [listing, setListing] = useState(false), [configured, setConfigured] = useState<boolean | null>(null); const [email,setEmail] = useState(""); const [inviting,setInviting] = useState(false);
  const competitive = activity === "league" || activity === "prebowl";
  const eligibleBooks = weeks.filter(week => activity === "prebowl" ? !!week.prebowl : !week.prebowl);
  const [connectionId,setConnectionId]=useState("");
  const [stopSignal, setStopSignal] = useState(0);
  const epoch = useRef(0); const room = useRef<Room | null>(null); const localStream = useRef<MediaStream | null>(null); const localTrack = useRef<LocalVideoTrack | null>(null);
  const pending = useRef<AbortController | null>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<CameraSource[]>([]); const videos = useRef(new Map<string,HTMLVideoElement>()); const observations = useRef(new Map<string,Observation>());
  const observe = useCallback((id: string, value: Observation) => { if (value.frames || value.bytes) observations.current.set(id,value); else observations.current.delete(id); }, []);
  const element = useCallback((id: string, video: HTMLVideoElement | null) => { if (video) videos.current.set(id,video); else videos.current.delete(id); setVideoVersion(value => value+1); }, []);
  const dispose = useCallback(() => {
    setConnectionId(""); epoch.current++; pending.current?.abort(); pending.current=null;
    if (timer.current) clearInterval(timer.current); timer.current=null;
    if (expiryTimer.current) clearTimeout(expiryTimer.current); expiryTimer.current=null;
    room.current?.removeAllListeners(); void room.current?.disconnect(); room.current=null;
    localTrack.current?.stop(); localTrack.current=null; localStream.current?.getTracks().forEach(track => track.stop()); localStream.current=null;
    observations.current.clear(); sourceRef.current=[];
  }, []);
  const leave = useCallback(() => { dispose(); setSources([]); setSelected(""); setStatus("idle"); setHealth(null); setStopSignal(value => value+1); setMessage("Camera and live connection stopped. Download any clips you want to keep before closing this page."); }, [dispose]);
  useEffect(() => { const age = setInterval(() => setHealth(current => current && Date.now()-Date.parse(current.observedAt)>=15000 ? null : current),1000); return () => clearInterval(age); }, []);
  useEffect(() => { const hide = () => leave(); window.addEventListener("pagehide",hide); return () => { window.removeEventListener("pagehide",hide); dispose(); }; }, [dispose,leave]);
  useEffect(() => {
    if (!initialSessionId) return;
    if (!validId(initialSessionId)) { setError("This studio link is invalid. Ask the host for a new link."); return; }
    const controller = new AbortController();
    void api<{session: Session}>(`/${initialSessionId}`,{signal:controller.signal}).then(result => { setSession(result.session); setAudience(result.session.audience); setActivity(result.session.activity); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [initialSessionId]);
  useEffect(() => {
    if (audience === "only-me") return;
    const controller = new AbortController();
    void fetch("/api/season",{cache:"no-store",signal:controller.signal}).then(async response => { if (!response.ok) return; const data=await response.json(); setWeeks(Array.isArray(data.weeks) ? data.weeks : []); }).catch(() => {});
    return () => controller.abort();
  }, [audience]);
  const refreshSessions = async () => {
    setListing(true); setError("");
    try { const result=await api<{sessions:Session[];configured:boolean}>(""); setSessions(result.sessions); setConfigured(result.configured); }
    catch(error) { setError(error instanceof Error ? error.message : "Shared studios could not load."); }
    finally { setListing(false); }
  };
  const start = async (target: Session | null, mode: "watch" | "publish") => {
    dispose(); const version=epoch.current; const controller=new AbortController(); pending.current=controller;
    setError(""); setMessage(""); setSources([]); setSelected(""); setStatus("joining"); setHealth(null);
    let connection: Room | null=null;
    try {
      if (!target) {
        const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}}});
        if (version !== epoch.current) { stream.getTracks().forEach(track => track.stop()); return; }
        localStream.current=stream; const source={id:stream.getVideoTracks()[0].id,name:"Your private camera",stream,local:true}; sourceRef.current=[source]; setSources([source]); setSelected(source.id); setStatus("connected");
        stream.getVideoTracks()[0].addEventListener("ended",leave,{once:true}); return;
      }
      const token=await api<{serverUrl:string;participantToken:string;connectionId:string}>(`/${target.id}/token`,{method:"POST",body:JSON.stringify({mode}),signal:controller.signal});
      if (version !== epoch.current) return;
      connection=new Room({adaptiveStream:true,dynacast:true}); room.current=connection; const liveRoom=connection;
      const sync = () => {
        if (version !== epoch.current) return;
        const next: CameraSource[]=[];
        const add=(track: LocalVideoTrack | RemoteVideoTrack,id:string,name:string,local:boolean) => { const previous=sourceRef.current.find(source => source.id===id && source.track===track); next.push(previous ?? {id,name,local,track,stream:new MediaStream([track.mediaStreamTrack])}); };
        for (const participant of liveRoom.remoteParticipants.values()) for (const publication of participant.videoTrackPublications.values()) { if (publication.track && !publication.isMuted && publication.source===Track.Source.Camera) add(publication.track as RemoteVideoTrack,publication.trackSid,participant.name || "Team camera",false); }
        for (const publication of liveRoom.localParticipant.videoTrackPublications.values()) { if (publication.track && !publication.isMuted && publication.source===Track.Source.Camera) add(publication.track as LocalVideoTrack,publication.trackSid,"Your shared camera",true); }
        sourceRef.current=next; setSources(next); setSelected(previous => next.some(source=>source.id===previous) ? previous : next[0]?.id ?? "");
      };
      liveRoom.on(RoomEvent.TrackSubscribed,sync).on(RoomEvent.TrackUnsubscribed,sync).on(RoomEvent.TrackMuted,sync).on(RoomEvent.TrackUnmuted,sync).on(RoomEvent.LocalTrackPublished,sync).on(RoomEvent.LocalTrackUnpublished,sync).on(RoomEvent.ParticipantDisconnected,sync);
      liveRoom.on(RoomEvent.Reconnecting,() => { if (version===epoch.current) { setStatus("reconnecting"); setHealth(null); } });
      liveRoom.on(RoomEvent.Reconnected,() => { if (version===epoch.current) setStatus("connected"); });
      liveRoom.on(RoomEvent.Disconnected,() => { if (version===epoch.current) { leave(); setError("The live connection ended. Join again when you are ready."); } });
      await liveRoom.connect(token.serverUrl,token.participantToken);
      if (version!==epoch.current) { await liveRoom.disconnect(); return; }
      if (mode==="publish") {
        const track=await createLocalVideoTrack({facingMode:facing,resolution:{width:1280,height:720}});
        if (version!==epoch.current) { track.stop(); await liveRoom.disconnect(); return; }
        localTrack.current=track;
        await liveRoom.localParticipant.publishTrack(track,{source:Track.Source.Camera});
        if (version!==epoch.current) { track.stop(); await liveRoom.disconnect(); return; }
      }
      sync(); setConnectionId(token.connectionId); setStatus("connected");
      const last=new Map<string,Observation>(); let reporting=false;
      const report=async () => {
        if (reporting || version!==epoch.current) return; reporting=true;
        try {
          const received:{trackSid:string;frames:number;bytes:number}[]=[]; let outgoing:Observation | undefined;
          for (const source of sourceRef.current) { const now=observations.current.get(source.id) ?? {frames:0,bytes:0}; const before=last.get(source.id) ?? {frames:0,bytes:0}; const delta={frames:Math.max(0,now.frames-before.frames),bytes:Math.max(0,now.bytes-before.bytes)}; last.set(source.id,{...now}); if (source.local) outgoing=delta; else received.push({trackSid:source.id,...delta}); }
          await api(`/${target.id}/health`,{method:"POST",body:JSON.stringify({connectionId:token.connectionId,received,outgoing}),signal:controller.signal});
          const result=await api<Health>(`/${target.id}/health`,{signal:controller.signal}); if (version===epoch.current) setHealth(result);
        } catch(error) {
          if (version===epoch.current) {
            setHealth(null);
            if (terminalSessionError(error)) { leave(); setSession(null); setError("This studio ended or your access changed. The camera and live connection have stopped."); }
          }
        } finally { reporting=false; }
      };
      timer.current=setInterval(() => void report(),5000); void report();
      const remaining=Date.parse(target.expiresAt)-Date.now(); expiryTimer.current=setTimeout(() => { leave(); setMessage("This studio has expired. Start a new session to continue."); },Math.max(0,remaining));
    } catch(error) { if (version!==epoch.current) { void connection?.disconnect(); return; } leave(); setError(error instanceof Error ? error.message : "Camera could not start. Check camera permission and try again."); }
  };
  const create = async () => {
    if (audience==="only-me") { setSession(null); void start(null,"publish"); return; }
    if (audience==="team" && !validId(team)) { setError("Choose the team whose members can watch."); return; }
    if (competitive && (!validId(book) || !eligibleBooks.some(week => week.id === book))) { setError("Choose a scorebook matching this activity."); return; }
    setStatus("joining"); setError(""); const version=epoch.current;
    try {
      const result=await api<{session:Session}>("",{method:"POST",body:JSON.stringify({activity,audience,title:title.trim() || activityNames[activity],scorebookId:competitive ? book : null,teamScopeId:audience==="team" ? team : null})});
      if (version!==epoch.current) return;
      setSession(result.session); await start(result.session,"publish");
    } catch(error) { if (version===epoch.current) { setStatus("idle"); setError(error instanceof Error ? error.message : "The studio could not start."); } }
  };
  const invite=async (event:React.FormEvent) => { event.preventDefault(); if (!session || inviting) return; setInviting(true); setError(""); try { await api(`/${session.id}/invites`,{method:"POST",body:JSON.stringify({email:email.trim()})}); setEmail(""); setMessage("Viewer access added. Copy the studio link and send it to them. They must sign in with this email."); } catch(error) { setError(error instanceof Error ? error.message : "Invitation could not be added."); } finally { setInviting(false); } };
  const selectedSource=sources.find(source=>source.id===selected) ?? null;
  const selectedVideo=videos.current.get(selected) ?? null; void videoVersion;
  const connected=status!=="idle"; const freshHealth=health && Date.now()-Date.parse(health.observedAt)<15000 ? health : null;
  return <main className="studio-shell"><Topbar/><Link className="studio-back" href="/">← Tonight</Link>
    <header className="studio-heading"><div><p className="studio-kicker">BA4L · Live studio</p><h1>Your lane. Your audience.</h1><p>Practice privately, bowl with the team, or invite someone to watch.</p></div><span className="studio-tag"><Lock size={15}/> Live microphone off</span></header>
    {error && <div className="studio-error" role="alert">{error}</div>}{message && <p className="studio-notice" role="status">{message}</p>}
    <div className="studio-workspace"><aside className="studio-setup" aria-label="Studio setup">
      <h2>{session ? session.title : "Set up your studio"}</h2>
      {session ? <><dl className="studio-details"><div><dt>Activity</dt><dd>{activityNames[session.activity]}</dd></div><div><dt>Audience</dt><dd>{audienceNames[session.audience]}</dd></div><div><dt>Expires</dt><dd>{new Date(session.expiresAt).toLocaleString()}</dd></div></dl>
        <div className="studio-actions">{status==="idle" && <><button className="studio-primary" onClick={() => void start(session,"watch")}>Join to watch</button>{session.canPublish && <button onClick={() => void start(session,"publish")}>Share my camera</button>}</>}
          {connected && <button className="studio-danger" onClick={leave}>Leave studio</button>}
          {!connected && <button onClick={() => { setSession(null); window.history.replaceState(null,"","/studio"); setError(""); }}>Set up another studio</button>}
        </div>
        <button onClick={() => void navigator.clipboard.writeText(`${location.origin}/studio?session=${session.id}`).then(()=>setMessage("Studio link copied. Only its allowed audience can join.")).catch(()=>setMessage(`Studio link: ${location.origin}/studio?session=${session.id}`))}>Copy studio link</button>
        {session.isOwner && session.audience==="invited" && <form onSubmit={invite} className="studio-invite"><label>Viewer email<input type="email" required value={email} onChange={event=>setEmail(event.target.value)} placeholder="teammate@example.com" maxLength={254}/></label><button disabled={inviting}>{inviting?"Adding…":"Give viewer access"}</button><p className="studio-caption">Adds access only. You send the link; no email is sent here.</p></form>}
        {session.isOwner && <button className="studio-danger" onClick={() => { void api(`/${session.id}`,{method:"PATCH",body:JSON.stringify({ended:true})}).then(()=>{leave();setSession(null);setMessage("Studio ended for everyone.");}).catch(error=>setError(error.message)); }}>End studio for everyone</button>}
      </> : <form onSubmit={event=>{event.preventDefault();void create();}}><fieldset disabled={connected}>
        <label>What are you doing?<select value={activity} onChange={event=>{setActivity(event.target.value as Activity);setBook("");}}>{Object.entries(activityNames).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>
        <label>Who can watch?<select value={audience} onChange={event=>setAudience(event.target.value as Audience)}>{Object.entries(audienceNames).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>
        <p className="studio-audience-note">{audience==="only-me" ? "Camera preview stays on this device. No shared room is created." : audience==="team" ? "Only members of the selected team can watch. Only you publish." : "Only you and people you grant viewer access can join."}</p>
        <label>Camera<select value={facing} onChange={event=>setFacing(event.target.value as "environment" | "user")}><option value="environment">Rear camera</option><option value="user">Front camera</option></select></label>
        {audience!=="only-me" && <><label>Studio title<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={100} placeholder={activityNames[activity]}/></label>
          {audience==="team" && <label>Audience team<select required value={team} onChange={event=>setTeam(event.target.value)}><option value="">Choose a team scorebook</option>{weeks.map(week=><option key={week.id} value={week.id}>Week {week.week ?? "?"}{week.prebowl ? " pre-bowl" : ""} · {week.bowledOn}</option>)}</select></label>}
          {competitive && <label>Attach to a scorebook<select required value={book} onChange={event=>setBook(event.target.value)}><option value="">Choose a matching scorebook</option>{eligibleBooks.map(week=><option key={week.id} value={week.id}>Week {week.week ?? "?"}{week.prebowl ? " pre-bowl" : ""} · {week.bowledOn}</option>)}</select></label>}
          {!weeks.length && <p className="studio-caption">No eligible season scorebooks loaded. Invited studios can start without a scorebook.</p>}
        </>}
        <button className="studio-primary" type="submit"><CameraIcon size={18}/>{audience==="only-me"?"Start private camera":"Start shared camera"}</button>
      </fieldset>{connected && <button type="button" className="studio-danger" onClick={leave}>{status==="joining"?"Cancel camera start":"Stop private camera"}</button>}</form>}
    </aside>
    <section className="studio-stage" aria-label="Live cameras"><div className="studio-stage-heading"><h2>{session ? "Shared cameras" : "Private preview"}</h2><span role="status" className="studio-tag">{status==="idle"?"Camera off":status==="joining"?"Starting…":status==="reconnecting"?"Reconnecting…":session?"Room connected":"Only on this device"}</span></div>
      {session && connected && <p className="studio-caption">{freshHealth ? `${freshHealth.cameraCount} published cameras · ${freshHealth.receivingCount} devices report receiving video` : "Waiting for device-reported video health."} These reports are from viewers’ devices, not server confirmation of image content.</p>}
      {sources.length ? <div className="studio-cameras">{sources.map(source=><Camera key={source.id} source={source} selected={selected===source.id} choose={()=>setSelected(source.id)} element={element} observe={observe}/>)}</div> : <div className="studio-empty-stage">{connected?<Radio size={36}/>:<VideoOff size={36}/>}<h3>{status==="joining"?"Getting the studio ready":connected?"Waiting for a camera":"Ready when you are"}</h3><p>{connected?"Video appears when real frames reach this browser. Joining a room does not start recording.":"Choose who can watch, then start your camera. Recording remains off until you enable it."}</p></div>}
    {session && <Soundboard key={`sound-${session.id}`} sessionId={session.id} connectionId={connectionId} connected={status==="connected"} isOwner={!!session.isOwner}/>}
    {session && <PeanutGallery key={session.id} sessionId={session.id} connected={status==="connected"} isOwner={!!session.isOwner}/>}
    </section></div>
    <Clips source={selectedSource} video={selectedVideo} stopSignal={stopSignal}/>
    <section className="studio-discovery"><div className="studio-section-head"><div><h2>Join a shared studio</h2><p>Only sessions you are allowed to see appear here.</p></div><button onClick={()=>void refreshSessions()} disabled={listing}>{listing?"Loading…":"Find shared studios"}</button></div>
      {configured===false && <p>Shared video is not configured yet. Your private camera and local clips still work.</p>}
      {configured===true && !sessions.length && <p>No active studios are available to this account.</p>}
      <ul>{sessions.map(item=><li key={item.id}><div><strong>{item.title}</strong><span>{activityNames[item.activity]} · {audienceNames[item.audience]}</span></div><button disabled={connected} onClick={()=>{setSession(item);setAudience(item.audience);setActivity(item.activity);window.history.replaceState(null,"",`/studio?session=${item.id}`);}}>Open studio</button></li>)}</ul>
    </section>
  </main>;
}
