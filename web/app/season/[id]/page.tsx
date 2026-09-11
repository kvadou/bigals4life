"use client";
import { use, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { nightSchema, type Night } from "@/lib/scorebook";
import { BOWLERS, localDate, pointsSummary, summarizeWeek, type WeekSummary } from "@/lib/season";
import { Topbar } from "../../components/topbar";
import { Crumbs } from "../../components/crumbs";
import { GameRows, HeadToHead, MatchHero } from "../../components/match-hero";

/** Week page: the points hero, tappable game rows, the night at a glance with handicap, and the head-to-head grid. */
export default function WeekPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    try {
      const [n, s] = await Promise.all([fetch(`/api/nights/${id}`, { cache: "no-store" }), fetch("/api/season", { cache: "no-store" })]);
      const d = await n.json(); if (!n.ok) throw Error(d.error);
      const night: Night = nightSchema.parse(d.state);
      const listed = s.ok ? ((await s.json()).weeks as WeekSummary[]).find(w => w.id === id) : undefined;
      const w = summarizeWeek(id, night, listed?.bowledOn ? listed.bowledOn + "T12:00:00" : new Date().toISOString(), listed?.week ?? null);
      w.bowledOn = listed?.bowledOn ?? localDate(new Date().toISOString()); w.points = pointsSummary(night);
      setWeek(w);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load this week."); }
  })(); }, [id]);
  const finished = week ? week.games.filter(g => g.team != null) : [];
  return <main>
    <Topbar right={<Link className="secondary" href={`/night?night=${id}`}>Live scorebook <ArrowUpRight size={14}/></Link>}/>
    <Crumbs items={[{ label: "Season", href: "/season" }, { label: week ? `Week ${week.week}` : "Week" }]}/>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {week && <>
      <MatchHero week={week} setupHref={`/night?night=${id}`}/>
      <div className="card game-card"><GameRows week={week} hrefFor={g => `/season/${id}/game/${g}`}/></div>
      <section className="league-section"><div className="eyebrow">THE NIGHT AT A GLANCE · SCRATCH, HANDICAP IN GREY</div>
        <div className="league-scroll"><table className="league-table week-table"><thead><tr><th scope="col" className="left">Bowler</th>{week.games.map(g => <th key={g.game} scope="col">G{g.game}</th>)}<th scope="col">Series</th><th scope="col">Avg</th></tr></thead>
          <tbody>{BOWLERS.map((b, i) => { const s = finished.reduce((t, g) => t + (g.scores[i] ?? 0), 0); return <tr key={b}><td className="left"><strong>{b}</strong> {week.ourHandicaps && <span className="muted-cell">+{week.ourHandicaps[i]}</span>}</td>{week.games.map(g => <td key={g.game} className={g.complete[i] ? "" : "muted-cell"}>{g.scores[i] ?? "–"}</td>)}<td><strong>{finished.length ? s : "–"}</strong></td><td className="muted-cell">{finished.length ? Math.round(s / finished.length) : "–"}</td></tr>; })}
            <tr className="ours"><td className="left"><strong>Team</strong> {week.ourHandicaps && <span className="muted-cell">+{week.ourHandicaps.reduce((a, b) => a + b, 0)}</span>}</td>{week.games.map(g => <td key={g.game}>{g.team ?? "–"}</td>)}<td><strong>{week.teamSeries ?? "–"}</strong></td><td className="muted-cell">{finished.length ? Math.round((week.teamSeries ?? 0) / finished.length) : "–"}</td></tr>
            {week.points && <tr><td className="left muted-cell">{week.opponent ? week.opponent.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : "Opponent"} hdcp</td>{week.points.games.map(g => <td key={g.game} className="muted-cell">{g.theirs ?? "–"}</td>)}<td className="muted-cell">{week.points.series.theirs ?? "–"}</td><td></td></tr>}</tbody></table></div>
      </section>
      {week.points && <section className="league-section"><div className="eyebrow">HEAD-TO-HEAD · 1 POINT PER GAME, 1 FOR SERIES</div><HeadToHead week={week}/></section>}
    </>}
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
