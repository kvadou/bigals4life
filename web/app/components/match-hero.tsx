import Link from "next/link";
import { BOWLERS, type PointsSummary, type WeekSummary } from "@/lib/season";

export const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".5", "½");
export const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/'S\b/i, "'s");
export const dayLabel = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
const splitClass = (s: [number, number]) => s[0] > s[1] ? "won" : s[1] > s[0] ? "lost" : s[0] ? "split" : "open";

/** Direction A's points hero: the 36 points, per-game 5-point chips, head-to-head and team lines. Falls back to scratch totals before a match is set up. */
export function isWeekFinished(week: WeekSummary) {
  return week.games.length > 0 && (week.prebowl ? week.prebowl.bowlers.every(i => week.games.every(g => g.complete[i])) : week.points ? week.points.remaining === 0 : week.finishedGames === week.games.length);
}

export function MatchHero({ week, setupHref }: { week: WeekSummary; setupHref?: string }) {
  const p = week.points;
  const pre = week.prebowl;
  const done = isWeekFinished(week);
  return <section className="match-hero" aria-label="Match points">
    <div className="match-hero-top"><span className="eyebrow light">WEEK {week.week} · {dayLabel(week.bowledOn)}{pre ? ` · PRE-BOWL · ${pre.bowlers.map(i => BOWLERS[i].toUpperCase()).join(" & ")}` : week.opponent ? ` · VS ${title(week.opponent).toUpperCase()}` : ""}</span><span className={`match-state ${done ? "final" : ""}`}>{done ? "FINAL" : "LIVE"}</span></div>
    {pre && <div className="match-body"><div className="match-score solo">{pre.bowlers.map(i => <div key={i}><span className="who">{BOWLERS[i]} · series</span><strong className="ours">{week.series[i] ?? "–"}</strong><span className="sub">{week.gamesBowled[i]} of {week.games.length} games · {week.gamesBowled[i] ? `avg ${Math.round((week.series[i] ?? 0) / week.gamesBowled[i])}` : "not started"}</span></div>)}</div>
      <div className="split-chips three">{week.games.map(g => <div key={g.game} className="split-chip open"><span className="eyebrow light">Game {g.game}</span><strong>{pre.bowlers.map(i => g.scores[i] ?? "–").join(" · ")}</strong><small>{pre.bowlers.every(i => g.complete[i]) ? "final" : "open"}</small></div>)}</div></div>}
    {pre ? <div className="match-lines"><span>Bowled ahead of Thursday. Team lines and match points fill in when the rest of the team bowls week {week.week}.</span></div> : p ? <>
      <div className="match-body">
      <div className="match-score">
        <div><span className="who">Big Al&rsquo;s 4 Life</span><strong className="ours">{fmt(p.ours)}</strong></div>
        <div className="mid"><span className="eyebrow light">MATCH POINTS</span><span className="open">{p.remaining ? `${fmt(p.remaining)} open` : "settled"}</span></div>
        <div className="them"><span className="who">{title(week.opponent ?? "Opponent")}</span><strong>{fmt(p.theirs)}</strong></div>
      </div>
      <div className="split-chips">
        {p.games.map(g => <div key={g.game} className={`split-chip ${splitClass(g.split)}`}><span className="eyebrow light">Game {g.game}</span><strong>{g.split[0] || g.split[1] ? `${fmt(g.split[0])}–${fmt(g.split[1])}` : "–"}</strong><small>Team points · {g.ours != null && g.theirs != null ? `${g.ours} v ${g.theirs}` : "open"}</small></div>)}
        <div className={`split-chip ${splitClass(p.series.split)}`}><span className="eyebrow light">Series</span><strong>{p.series.split[0] || p.series.split[1] ? `${fmt(p.series.split[0])}–${fmt(p.series.split[1])}` : "–"}</strong><small>Team series points · {p.series.ours != null && p.series.theirs != null ? `${p.series.ours} v ${p.series.theirs}` : "open"}</small></div>
      </div>
      </div>
      <div className="match-lines"><span>Individual points {fmt(p.individual[0])}–{fmt(p.individual[1])}</span><span>Team points {fmt(p.team[0])}–{fmt(p.team[1])}</span></div>
    </> : <>
      <div className="match-body">
        <div className="match-score solo">
          <div><span className="who">Team series · scratch</span><strong className="ours">{week.teamSeries ?? "–"}</strong><span className="sub">{week.finishedGames} of {week.games.length} games finished{week.games.length > 1 ? ` · best ${Math.max(...week.games.map(g => g.team ?? 0))}` : ""}</span></div>
        </div>
        <div className="split-chips three">{week.games.map(g => <div key={g.game} className="split-chip open"><span className="eyebrow light">Game {g.game}</span><strong>{g.team ?? "–"}</strong><small>scratch</small></div>)}</div>
      </div>
      <div className="match-lines"><span>No opponent set for this night, so no match points yet.</span>{setupHref && <Link href={setupHref} className={`hero-cta ${done ? "quiet" : ""}`}>Set up the match</Link>}</div>
    </>}
    {week.teamSeries != null && !pre && p && <div className="match-team-total"><span>Team series · scratch</span><strong>{week.teamSeries.toLocaleString()}</strong></div>}
  </section>;
}

/** Direction D's drill-in rows: one per game plus the series. */
export function GameRows({ week, hrefFor }: { week: WeekSummary; hrefFor: (game: number) => string }) {
  const p = week.points;
  const closest = p ? p.games.filter(g => g.ours != null && g.theirs != null).sort((a, b) => Math.abs(a.ours! - a.theirs!) - Math.abs(b.ours! - b.theirs!))[0] : null;
  const best = week.games.filter(g => g.team != null).sort((a, b) => (b.team ?? 0) - (a.team ?? 0))[0];
  return <div className="game-rows">
    {week.games.map((g, i) => { const gp = p?.games[i]; const hth = p ? p.bowlers.reduce((s, b) => [s[0] + (b.games[i]?.[0] ?? 0), s[1] + (b.games[i]?.[1] ?? 0)], [0, 0]) : null; const total: [number, number] | null = gp && hth ? [gp.split[0] + hth[0], gp.split[1] + hth[1]] : null;
      const pre = week.prebowl;
      const notes = [pre ? pre.bowlers.map(i => `${BOWLERS[i]} ${g.scores[i] ?? "–"}${g.complete[i] ? "" : " (open)"}`).join(" · ") : g.team != null ? `${g.team} scratch` : g.scores.some(s => s != null) ? "in progress" : "not started", gp && gp.ours != null && gp.theirs != null ? `${gp.ours} v ${gp.theirs} hdcp` : null, closest && closest.game === g.game && week.games.length > 1 ? (closest.ours! < closest.theirs! ? `lost by ${closest.theirs! - closest.ours!}` : `won by ${closest.ours! - closest.theirs!}`) + ", closest of the night" : null, best && best.game === g.game && g.team != null ? "best game" : null].filter(Boolean).join(" · ");
      return <Link key={g.game} href={hrefFor(g.game)} className="game-row-link"><span className="game-index" aria-hidden="true">{g.game}</span><div><strong>Game {g.game}</strong><span>{notes}</span></div><div className="game-row-right">{total && <small>Game points</small>}{total ? <b className={splitClass(total)}>{fmt(total[0])}–{fmt(total[1])}</b> : <b className="dim">{pre ? pre.bowlers.map(i => g.scores[i] ?? "–").join(" · ") : g.team ?? "–"}</b>}<span aria-hidden="true">›</span></div></Link>; })}
    {p && <div className="game-row-link static"><span className="game-index" aria-hidden="true">Σ</span><div><strong>Series</strong><span>{p.series.ours != null && p.series.theirs != null ? `${p.series.ours} v ${p.series.theirs} hdcp` : "open"} · {week.teamSeries ?? "–"} scratch</span></div><div className="game-row-right"><small>Series points</small><b className={splitClass([p.series.split[0] + p.bowlers.reduce((s, b) => s + b.series[0], 0), p.series.split[1] + p.bowlers.reduce((s, b) => s + b.series[1], 0)])}>{fmt(p.series.split[0] + p.bowlers.reduce((s, b) => s + b.series[0], 0))}–{fmt(p.series.split[1] + p.bowlers.reduce((s, b) => s + b.series[1], 0))}</b></div></div>}
  </div>;
}

export function HeadToHead({ week }: { week: WeekSummary }) {
  const p = week.points; if (!p) return null;
  const cell = (s: [number, number]) => s[0] > s[1] ? <td className="won">W</td> : s[1] > s[0] ? <td className="lost">L</td> : s[0] ? <td className="split">½</td> : <td className="dim">–</td>;
  return <div className="league-scroll" tabIndex={0} role="region" aria-label="Head-to-head scores, scroll for more columns"><table className="league-table week-table hth"><thead><tr><th scope="col" className="left">Us · hdcp</th>{week.games.map(g => <th key={g.game} scope="col">G{g.game}</th>)}<th scope="col">Ser</th><th scope="col" className="left">Them</th></tr></thead>
    <tbody>{p.bowlers.map((b, i) => <tr key={b.name}><td className="left"><strong>{b.name}</strong> <span className="muted-cell">+{week.ourHandicaps?.[i] ?? 0}</span></td>{b.games.map((g, k) => <HthCell key={k} s={g}/>)}<HthCell s={b.series}/><td className="left muted-cell">{title(b.opponent).split(" ")[0]}</td></tr>)}</tbody></table></div>;
  function HthCell({ s }: { s: [number, number] }) { return cell(s); }
}

export type { PointsSummary };
