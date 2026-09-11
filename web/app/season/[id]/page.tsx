"use client";
import { use, useEffect, useState } from "react";
import { ArrowUpRight, CircleDot } from "lucide-react";
import Link from "next/link";
import { analyze, symbol } from "@/lib/bowling";
import { nightSchema, type Night } from "@/lib/scorebook";
import { BOWLERS, summarizeGames } from "@/lib/season";
import { nightMatchPoints } from "@/lib/league/night-points";

const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".5", "½");
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/'S\b/i, "'s");

export default function WeekPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [night, setNight] = useState<Night | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => { try { const r = await fetch(`/api/nights/${id}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw Error(d.error); setNight(nightSchema.parse(d.state)); } catch (e) { setError(e instanceof Error ? e.message : "Could not load this week."); } })(); }, [id]);
  const games = night ? summarizeGames(night) : [];
  const entries = night ? [...night.history.map(h => ({ game: h.game, rolls: h.rolls, finals: h.finals })), { game: night.game, rolls: night.rolls, finals: night.finals }] : [];
  const points = night ? nightMatchPoints(night) : null;
  const finished = games.filter(g => g.team != null);
  return <main>
    <header className="topbar"><Link className="brand" href="/" aria-label="Home"><span className="brand-icon"><CircleDot size={23}/></span>BA4L</Link><nav className="topbar-right"><Link className="league-tag" href="/season"><span/> SEASON</Link><Link className="secondary" href={`/?night=${id}`}>Open in scorebook <ArrowUpRight size={14}/></Link></nav></header>
    <section className="intro"><div><div className="eyebrow">{night?.match ? `WEEK ${night.match.week} · VS ${title(night.match.opponent.name).toUpperCase()}` : "LEAGUE NIGHT"}</div><h1>Three games, <em>one night.</em></h1><p>{finished.length} finished game{finished.length === 1 ? "" : "s"}{points ? ` · match points ${fmt(points.total[0])}–${fmt(points.total[1])}` : ""}.</p></div></section>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {night && <>
      <section className="league-section"><div className="eyebrow">THE NIGHT AT A GLANCE</div>
        <div className="league-scroll"><table className="league-table week-table"><thead><tr><th scope="col" className="left">Bowler</th>{games.map(g => <th key={g.game} scope="col">Game {g.game}</th>)}<th scope="col">Series</th><th scope="col">Avg</th></tr></thead>
          <tbody>{BOWLERS.map((b, i) => { const s = finished.reduce((t, g) => t + (g.scores[i] ?? 0), 0); return <tr key={b}><td className="left"><strong>{b}</strong></td>{games.map(g => <td key={g.game} className={g.complete[i] ? "" : "muted-cell"}>{g.scores[i] ?? "–"}</td>)}<td><strong>{finished.length ? s : "–"}</strong></td><td className="muted-cell">{finished.length ? Math.round(s / finished.length) : "–"}</td></tr>; })}
            <tr className="ours"><td className="left"><strong>Team</strong></td>{games.map(g => <td key={g.game}>{g.team ?? "–"}</td>)}<td><strong>{finished.length ? finished.reduce((t, g) => t + (g.team ?? 0), 0) : "–"}</strong></td><td className="muted-cell">{finished.length ? Math.round(finished.reduce((t, g) => t + (g.team ?? 0), 0) / finished.length) : "–"}</td></tr></tbody></table></div>
      </section>
      {entries.map((e, gi) => <section className="league-section game-section" key={e.game} id={`game-${e.game}`}>
        <div className="eyebrow">GAME {e.game} · {games[gi].team != null ? `TEAM ${games[gi].team}` : "IN PROGRESS"}</div>
        {BOWLERS.map((b, i) => { const st = analyze(e.rolls[i]); const final = e.finals?.[i]; return <div className="game-row" key={b}>
          <div className="game-row-head"><strong>{b}</strong><span className="game-score">{final ?? (st.complete ? st.score : e.rolls[i].length ? `${st.score} so far` : "–")}</span></div>
          {e.rolls[i].length ? <div className="scorecard-scroll"><table className="mini-card"><tbody><tr>{st.frames.map((f, k) => <td key={k}><div className="frame-rolls">{Array.from({ length: k === 9 ? 3 : 2 }, (_, j) => <span key={j}>{symbol(f.rolls, j) || "·"}</span>)}</div><strong>{f.score ?? ""}</strong></td>)}</tr></tbody></table></div>
            : <p className="score-note">{final != null ? "Final total only; frames were not recorded." : "Not bowled."}</p>}
        </div>; })}
      </section>)}
    </>}
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
