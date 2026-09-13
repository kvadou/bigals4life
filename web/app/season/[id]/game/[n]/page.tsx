"use client";
import { use, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { OriginLink as Link } from "@/app/components/crumbs";
import { analyze, symbol } from "@/lib/bowling";
import { nightSchema, type Night } from "@/lib/scorebook";
import { BOWLERS, pointsSummary, summarizeGames } from "@/lib/season";
import { Topbar } from "../../../../components/topbar";
import { Crumbs } from "../../../../components/crumbs";
import { fmt, title } from "../../../../components/match-hero";

/** Game page: this game's points, frame-by-frame for all four with the head-to-head result, previous and next game. */
export default function GamePage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = use(params);
  const game = Math.max(1, Number(n) || 1);
  const [night, setNight] = useState<Night | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    try {
      const [r, s] = await Promise.all([fetch(`/api/nights/${id}`, { cache: "no-store" }), fetch("/api/season", { cache: "no-store" })]);
      const d = await r.json(); if (!r.ok) throw Error(d.error); setNight(nightSchema.parse(d.state));
      if (s.ok) setWeekNumber(((await s.json()).weeks as { id: string; week: number }[]).find(w => w.id === id)?.week ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load this game."); }
  })(); }, [id]);
  const entries = night ? [...night.history.map(h => ({ game: h.game, rolls: h.rolls, finals: h.finals })), { game: night.game, rolls: night.rolls, finals: night.finals }] : [];
  const entry = entries.find(e => e.game === game);
  const summary = night ? summarizeGames(night).find(g => g.game === game) : null;
  const points = night ? pointsSummary(night) : null;
  const gp = points?.games.find(g => g.game === game);
  const hth = points ? points.bowlers.reduce((s, b) => [s[0] + (b.games[game - 1]?.[0] ?? 0), s[1] + (b.games[game - 1]?.[1] ?? 0)], [0, 0]) : null;
  const total = gp && hth ? [gp.split[0] + hth[0], gp.split[1] + hth[1]] : null;
  const last = entries.length;
  return <main>
    <Topbar right={<Link className="secondary" href={`/night?night=${id}`}>Edit in scorebook <ArrowUpRight size={14}/></Link>}/>
    <Crumbs items={[{ label: "Season", href: "/season" }, { label: weekNumber ? `Week ${weekNumber}` : "Week", href: `/season/${id}` }, { label: `Game ${game}` }]}/>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {night && !entry && <p className="score-note">Game {game} hasn&rsquo;t been bowled yet.</p>}
    {night && entry && summary && <>
      <section className="game-hero">
        <div><div className="eyebrow">GAME {game} OF {last} · 5 TEAM POINTS + 4 HEAD-TO-HEAD</div>
          {total ? <div className="game-hero-score"><strong className="ours">{fmt(total[0])}</strong><span>–</span><strong>{fmt(total[1])}</strong></div> : <div className="game-hero-score"><strong className="ours">{summary.team ?? "–"}</strong><span className="muted-cell" style={{ fontSize: 12 }}>team scratch</span></div>}</div>
        {gp && gp.ours != null && gp.theirs != null && <div className="game-hero-side">Team {summary.team} scratch<br/><strong>{gp.ours} v {gp.theirs} hdcp</strong></div>}
      </section>
      <div className="game-nav" aria-label="Games">
        {Array.from({ length: last }, (_, k) => k + 1).map(k => k === game ? <span key={k} className="chip active" aria-current="page">Game {k}</span> : <Link key={k} className="chip" href={`/season/${id}/game/${k}`}>Game {k}</Link>)}
      </div>
      {BOWLERS.map((b, i) => { const st = analyze(entry.rolls[i]); const final = entry.finals?.[i]; const pb = points?.bowlers[i]; const split = pb?.games[game - 1]; const opp = night.match?.opponent.bowlers[i]; const oppScore = night.match?.opponentGames[game - 1]?.[i];
        return <section className="card game-section" key={b}>
          <div className="game-row-head"><strong>{b}</strong><span className="game-row-meta">{opp ? <>vs {title(opp.name).split(" ")[0]} {oppScore ?? "–"} · {split ? (split[0] > split[1] ? <b className="won">W</b> : split[1] > split[0] ? <b className="lost">L</b> : split[0] ? <b className="split">½</b> : <b className="dim">open</b>) : null} · </> : null}{final ?? (st.complete ? st.score : entry.rolls[i].length ? `${st.score} so far` : "–")}{night.match && <span className="muted-cell"> +{night.match.ours[i].handicap} = {(final ?? st.score) + night.match.ours[i].handicap}</span>}</span></div>
          {entry.rolls[i].length ? <div className="scorecard-scroll" tabIndex={0} role="region" aria-label={`${b} ten-frame scorecard, scroll for more frames`}><table className="mini-card"><tbody><tr>{st.frames.map((f, k) => <td key={k}><div className="frame-rolls">{Array.from({ length: k === 9 ? 3 : 2 }, (_, j) => <span key={j}>{symbol(f.rolls, j) || "·"}</span>)}</div><strong>{f.score ?? ""}</strong></td>)}</tr></tbody></table></div>
            : <p className="score-note">{final != null ? "Final total only; frames were not recorded." : "Not bowled."}</p>}
          {entry.rolls[i].length > 0 && (() => { const open = st.frames.filter(f => f.rolls.length >= 2 && f.rolls[0] + f.rolls[1] < 10).length; const strikes = st.frames.reduce((n, f, k) => n + (k === 9 ? f.rolls.filter(r => r === 10).length : f.rolls[0] === 10 ? 1 : 0), 0); return <p className="score-note">{open} open frame{open === 1 ? "" : "s"} · {strikes} strike{strikes === 1 ? "" : "s"}</p>; })()}
        </section>; })}
    </>}
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
