"use client";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, CircleDot } from "lucide-react";
import Link from "next/link";
import { BOWLERS, type WeekSummary } from "@/lib/season";

const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".5", "½");
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/'S\b/i, "'s");
const day = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function SeasonPage() {
  const [data, setData] = useState<{ season: string; weeks: WeekSummary[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => { try { const r = await fetch("/api/season", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw Error(d.error); setData(d); } catch (e) { setError(e instanceof Error ? e.message : "Could not load the season."); } })(); }, []);
  return <main>
    <header className="topbar"><Link className="brand" href="/" aria-label="Home"><span className="brand-icon"><CircleDot size={23}/></span>BA4L</Link><nav className="topbar-right"><Link className="league-tag" href="/league"><span/> LEAGUE STANDINGS</Link><Link className="secondary" href="/">Tonight</Link></nav></header>
    <section className="intro"><div><div className="eyebrow"><CalendarDays size={14}/> OUR SEASON {data?.season ?? ""}</div><h1>Every <em>Thursday.</em></h1><p>Each week is a night. Open a week for all three games, then any game for the frame-by-frame.</p></div></section>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {data && !data.weeks.length && <p className="score-note">No finished games yet. Bowl a game and it shows up here.</p>}
    <div className="week-list">{data?.weeks.map(w => <Link key={w.id} href={`/season/${w.id}`} className="week-card">
      <div className="week-head"><div><div className="eyebrow">WEEK {w.week}</div><h2>{day(w.bowledOn)}{w.opponent ? <span className="muted-cell"> vs {title(w.opponent)}</span> : ""}</h2></div>
        <div className="week-team"><span className="small-label">TEAM SERIES</span><strong>{w.teamSeries ?? "–"}</strong>{w.points && <small>{fmt(w.points.ours)}–{fmt(w.points.theirs)} pts</small>}</div></div>
      <div className="league-scroll"><table className="league-table week-table"><thead><tr><th scope="col" className="left">Bowler</th>{w.games.map(g => <th key={g.game} scope="col">G{g.game}</th>)}<th scope="col">Series</th></tr></thead>
        <tbody>{BOWLERS.map((b, i) => <tr key={b}><td className="left"><strong>{b}</strong></td>{w.games.map(g => <td key={g.game} className={g.complete[i] ? "" : "muted-cell"}>{g.scores[i] ?? "–"}</td>)}<td><strong>{w.series[i] ?? "–"}</strong></td></tr>)}
          <tr className="ours"><td className="left"><strong>Team</strong></td>{w.games.map(g => <td key={g.game}>{g.team ?? "–"}</td>)}<td><strong>{w.teamSeries ?? "–"}</strong></td></tr></tbody></table></div>
      <div className="week-foot"><span>{w.finishedGames} of {w.games.length} games finished</span><span className="week-open">Open week <ChevronRight size={14}/></span></div>
    </Link>)}</div>
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
