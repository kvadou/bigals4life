"use client";
import { useEffect, useRef, useState } from "react";
import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client";
import type { Observation } from "./types";
export type CameraSource = { id: string; name: string; stream: MediaStream; track?: LocalVideoTrack | RemoteVideoTrack; local: boolean };
export default function Camera({ source, selected, choose, element, observe }: { source: CameraSource; selected: boolean; choose: () => void; element: (id: string, video: HTMLVideoElement | null) => void; observe: (id: string, data: Observation) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false); const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const video = ref.current!; let disposed = false; let frame = 0; let count = 0; let last = 0; let bytes = 0;
    element(source.id, video); if (source.track) source.track.attach(video); else video.srcObject = source.stream;
    void video.play().catch(() => { if (!disposed) setBlocked(true); });
    const painted = () => { if (disposed) return; count++; last = performance.now(); frame = video.requestVideoFrameCallback(painted); };
    const hasFrameCallback = typeof video.requestVideoFrameCallback === "function";
    if (hasFrameCallback) frame = video.requestVideoFrameCallback(painted);
    let previousFallback = 0;
    const timer = setInterval(() => {
      if (!hasFrameCallback) { const total = video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0; if (total > previousFallback) { count += total - previousFallback; last = performance.now(); } previousFallback = total; }
      setActive(last > 0 && performance.now() - last < 3000);
      observe(source.id, { frames: count, bytes });
    }, 1000);
    const stats = setInterval(() => {
      void source.track?.getRTCStatsReport().then(report => {
        if (disposed) return;
        report?.forEach(stat => { if (stat.type === (source.local ? "outbound-rtp" : "inbound-rtp") && stat.kind === "video") bytes = Math.max(bytes, source.local ? stat.bytesSent ?? 0 : stat.bytesReceived ?? 0); });
      }).catch(() => {});
    }, 4000);
    return () => { disposed = true; clearInterval(timer); clearInterval(stats); if (frame) video.cancelVideoFrameCallback?.(frame); video.pause(); source.track?.detach(video); video.srcObject = null; element(source.id, null); observe(source.id, { frames: 0, bytes: 0 }); };
  }, [source, element, observe]);
  return <figure className="studio-camera" data-selected={selected}>
    <div className="studio-picture"><video ref={ref} autoPlay muted playsInline aria-label={`${source.name} camera`}/>
      {!active && <div className="studio-video-state" role="status"><strong>{blocked ? "Tap to play this camera" : "Waiting for video frames"}</strong><span>Connection alone does not confirm a picture.</span><button onClick={() => { void ref.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); }}>Play picture</button></div>}
    </div>
    <figcaption><div><strong>{source.name}</strong><span className="studio-caption">{active ? "Frames visible on this device" : "No recent visible frames"}</span></div><button aria-pressed={selected} onClick={choose}>{selected ? "Clip source" : "Use for clips"}</button></figcaption>
  </figure>;
}
