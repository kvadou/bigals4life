"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { WeekSummary } from "@/lib/season";
import { Topbar } from "../components/topbar";
import { Crumbs } from "../components/crumbs";
import { BroPatch } from "../components/bro-mark";

/** /review with no night: open the latest night you bowled in. Nothing to review yet: say so with the patch, not a blank. */
export default function ReviewIndex() {
  const [state, setState] = useState<"loading" | "empty" | "error">("loading");
  useEffect(() => { void (async () => {
    try {
      const r = await fetch("/api/season", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw Error(d.error);
      const weeks = d.weeks as WeekSummary[];
      const latest = weeks[0];
      if (latest) { window.location.replace(`/review/${latest.id}`); return; }
      setState("empty");
    } catch { setState("error"); }
  })(); }, []);
  return <main>
    <Topbar/>
    <Crumbs items={[{ label: "Season", href: "/season" }, { label: "Review" }]}/>
    {state === "loading" && <p className="score-note">Opening your latest night…</p>}
    {state !== "loading" && <section className="intro review-intro"><div><div className="eyebrow">BOWLING BRO’</div><h1>Nothing to <em>review yet.</em></h1><p>{state === "error" ? "Could not load the season. Try again in a moment." : "Bowl a game in the scorebook and the coach will have something to say."}</p><Link className="primary start-button" href="/night">Open the scorebook</Link></div><BroPatch size={140}/></section>}
    <footer><span>BA4L</span><span>Bowling Bro’. A BA4L thing.</span></footer>
  </main>;
}
