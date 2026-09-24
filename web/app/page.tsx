"use client";
import { useEffect, useState } from "react";
import { Camera, ListPlus, Mic, Trophy } from "lucide-react";
import { OriginLink as Link } from "@/app/components/crumbs";
import type { WeekSummary } from "@/lib/season";
import { AccountBar, useMe } from "./account";
import { Topbar } from "./components/topbar";
import LiveDiscovery from "./live/discovery";
import { Crumbs } from "./components/crumbs";
import { GameRows, MatchHero, fmt, isWeekFinished } from "./components/match-hero";
import { TonightCard, useTonight } from "./components/tonight-card";

type Standings = { season: { name: string }; week: { number: number; bowledOn: string }; teams: { name: string; place: number; pointsWon: number; pointsLost: number; ours: boolean }[]; roster: { name: string; average: number; games: number[] | null; total: number | null }[] };

/** Home: the latest week as a matchup card (points hero + drill-in rows), standings and records at a glance, live entry one tap away. */
export default function Home() {
  const me = useMe();
  const tonight = useTonight();
  const [weeks, setWeeks] = useState<WeekSummary[] | null>(null);
  const [standings, setStandings] = useState<Standings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    // Old share links (/?night=…) still open the live scorebook; the iOS app validates that exact shape.
    const night = new URLSearchParams(window.location.search).get("night");
    if (night) { window.location.replace(`/night?night=${encodeURIComponent(night)}`); return; }
    void (async () => {
      try { const r = await fetch("/api/season", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw Error(d.error); setWeeks(d.weeks); } catch (e) { setError(e instanceof Error ? e.message : "Could not load the season."); }
      try { const r = await fetch("/api/league/standings", { cache: "no-store" }); if (r.ok) setStandings(await r.json()); } catch { /* standings are optional here */ }
    })();
  }, []);
  const week = weeks?.find(w => !w.prebowl) ?? weeks?.[0] ?? null;
  const finished = week ? isWeekFinished(week) : false;
  // League night with tonight's scorebook started: the entry bar scores tonight, even while Home still shows last week.
  const tonightId = tonight?.leagueNight && tonight.nightId && tonight.nightId !== week?.id ? tonight.nightId : null;
  const entryId = tonightId ?? week?.id;
  const scoreHref = entryId ? `/night?night=${entryId}` : "/night";
  const modeHref = (mode: string) => `${scoreHref}${entryId ? "&" : "?"}mode=${mode}`;
  const prebowls = weeks?.filter(w => w.prebowl && w.id !== week?.id) ?? [];
  const us = standings?.teams.find(t => t.ours);
  const ahead = us && standings ? standings.teams.find(t => t.place === us.place - 1) : null;
  const highGame = week ? week.games.flatMap(g => g.scores.flatMap((s, i) => s != null && g.complete[i] ? [{ s, i }] : [])).sort((a, b) => b.s - a.s)[0] : null;
  const highSeries = week ? week.series.flatMap((s, i) => s != null ? [{ s, i }] : []).sort((a, b) => b.s - a.s)[0] : null;
  const names = ["Doug", "Mustafa", "Kyle", "Pete"];
  return <main className="team-night">
    <Topbar right={<AccountBar me={me} nightId={week?.id ?? ""} role="" onClaimed={() => {}}/>}/>
    <Crumbs items={[{ label: "Tonight" }]}/>
    {tonight && <TonightCard tonight={tonight} currentId={week?.id}/>}
    <LiveDiscovery/>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {weeks && !week && <section className="intro"><div><div className="eyebrow">NO GAMES YET</div><h1>First frame is <em>yours.</em></h1><p>Open the live scorebook and the week fills in here as games finish.</p></div><Link className="primary start-button" href="/night">Open the scorebook</Link></section>}
    {!weeks && !error && <p className="score-note" role="status">Loading the latest night…</p>}
    {week && <header className="night-home-title"><h1>{finished ? "The night, in the books." : week.prebowl ? "Ahead of the game." : "Team night."}</h1><p>{finished ? "Results, scorecards, and what comes next." : "Four bowlers. Every frame together."}</p></header>}
    {week && <div className="home-layout">
      <div className="home-main">
        <MatchHero week={week} setupHref={`/night?night=${week.id}`}/>
        <Link className="night-primary primary" href={finished ? `/review/${week.id}` : scoreHref}>{finished ? "Review the night" : "Continue scoring"}<span aria-hidden="true">→</span></Link>
        <div className="card game-card"><GameRows week={week} hrefFor={g => `/season/${week.id}/game/${g}`}/></div>
      </div>
      <aside className="home-side">
        <Link href="/league" className="card mini-card-link"><div><div className="eyebrow"><Trophy size={13}/> STANDINGS</div><strong className="d">{us ? `${us.place}${["st", "nd", "rd"][us.place - 1] ?? "th"} of ${standings!.teams.length}` : "–"}</strong><span>{us ? (ahead ? `${fmt(ahead.pointsWon - us.pointsWon)} behind ${ahead.name.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())}` : `${fmt(us.pointsWon)}–${fmt(us.pointsLost)}, top of the league`) : "Standings unavailable"}</span>{standings && <small className="standings-date">{standings.season.name}<br/>As of {standings.week.bowledOn} · Week {standings.week.number}</small>}</div><span aria-hidden="true">›</span></Link>
        <Link href={`/season/${week.id}`} className="card mini-card-link"><div><div className="eyebrow">RECORDS · WEEK {week.week}</div><strong className="d">{highGame ? `${names[highGame.i]} ${highGame.s}` : "–"}</strong><span>{highSeries ? `high series ${names[highSeries.i]} ${highSeries.s}${week.teamSeries != null ? ` · team ${week.teamSeries}` : ""}` : ""}</span></div><span aria-hidden="true">›</span></Link>
        {prebowls.map(w => <Link key={w.id} href={`/season/${w.id}`} className="card mini-card-link"><div><div className="eyebrow">PRE-BOWL · WEEK {w.week}</div><strong className="d">{w.prebowl!.bowlers.map(i => `${names[i]} ${w.series[i] ?? "–"}`).join(" · ")}</strong><span>{w.prebowl!.bowlers.map(i => `${w.games.filter(g => g.complete[i]).map(g => g.scores[i]).join(", ") || "not started"}`).join(" · ")}</span></div><span aria-hidden="true">›</span></Link>)}
        <Link href={`/review/${week.id}`} className="card mini-card-link"><div><div className="eyebrow">BOWLING BRO’ · REVIEW</div><strong className="d">How’d it go?</strong><span>Your night, then the coach</span></div><span aria-hidden="true">›</span></Link>
        <Link href={`/season/${week.id}`} className="card mini-card-link"><div><div className="eyebrow">THIS WEEK</div><strong className="d">All four scorecards</strong><span>Every frame, head-to-head, handicap</span></div><span aria-hidden="true">›</span></Link>
        <Link href="/night?new=1" className="text-button center-link">Start a new night (pre-bowl, next week) ›</Link>
        {weeks && weeks.length > 1 && <Link href="/season" className="text-button center-link">All {weeks.length} weeks ›</Link>}
      </aside>
    </div>}
    {(!finished || tonightId) && <div className="entry-bar" aria-label="Score tonight">
      <Link href={scoreHref} className="entry-tile"><ListPlus size={18}/> Tap pins</Link>
      <Link href={modeHref("scan")} className="entry-tile accent"><Camera size={18}/> Scan board</Link>
      <Link href={modeHref("voice")} className="entry-tile"><Mic size={18}/> Say a roll</Link>
    </div>}
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
