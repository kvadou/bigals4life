import { Trophy } from "lucide-react";
import { Topbar } from "../components/topbar";
import { Crumbs } from "../components/crumbs";
import Link from "next/link";
import { fmt, title } from "../components/format";
import { loadStandings } from "@/lib/league/standings-server";
import Recap from "./recap";
import LeagueUpload from "./upload";

export const dynamic = "force-dynamic";
const ordinal = (n: number) => `${n}${["st", "nd", "rd"][n - 1] ?? "th"}`;

export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season } = await searchParams;
  const s = await loadStandings(season).catch(() => null);
  return <main>
    <Topbar/>
    <Crumbs items={[{ label: "Standings" }]}/>
    {!s ? <section className="intro"><div><div className="eyebrow">LEAGUE</div><h1>No standings <em>yet.</em></h1><p>Ingest Gary&rsquo;s weekly PDF and this page fills in.</p></div></section> : <>
      <section className="intro"><div><div className="eyebrow">{s.season.name.toUpperCase()} · WEEK {s.week.number} OF {s.season.weeksTotal}</div><h1>{s.teams.find(t => t.ours) ? <>{title(s.teams.find(t => t.ours)!.name).replace(/ 4 Life$/, "")} sit <em>{ordinal(s.teams.find(t => t.ours)!.place)}.</em></> : <>League <em>standings.</em></>}</h1><p>{s.season.house}. Updated from the standings sheet dated {s.week.bowledOn}.</p>{s.seasons.length > 1 && <nav className="season-nav" aria-label="Season">{s.seasons.map(x => <Link key={x.name} href={x.name === s.seasons[0].name ? "/league" : `/league?season=${encodeURIComponent(x.name)}`} className={x.name === s.season.name ? "active" : ""}>{x.name.replace(/^Thursday Men's Early /, "")}</Link>)}</nav>}</div><Link className="secondary" href="/night">Live scorebook</Link></section>

      {s.reconciliation.map(r => <section className="league-section reconcile" key={r.week} aria-label={`Week ${r.week} check`}>
        <div className="eyebrow">WEEK {r.week} · GARY SAYS / WE SAY</div>
        {r.nights.map(n => <div key={n.nightId} className="reconcile-card"><p className="score-note">vs {title(n.opponent)} · {n.checked} numbers checked · {n.discrepancies.length ? `${n.discrepancies.length} differ` : "everything matches"}</p>
          {n.discrepancies.length > 0 && <ul className="reconcile-list">{n.discrepancies.map((d, i) => <li key={i}><strong>{title(d.who)}</strong> {d.field}: we had <em>{d.ours}</em>, sheet says <em>{d.gary}</em></li>)}</ul>}
          <p className="score-note"><Link href={`/?night=${n.nightId}`}>Open that night</Link>. Gary&rsquo;s sheet is the official record; fix the night if our entry was the typo.</p></div>)}
      </section>)}
      <LeagueUpload/>
      <Recap season={s.season.name} week={s.week.number} initial={s.week.recap}/>
      <section className="league-section" aria-label="Team standings">
        <div className="eyebrow"><Trophy size={16}/> TEAM STANDINGS</div>
        <div className="league-scroll" tabIndex={0} role="region" aria-label="Team standings, scroll for more columns"><table className="league-table"><thead><tr><th scope="col">#</th><th scope="col" className="left">Team</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">%</th><th scope="col">YTD</th><th scope="col">Last week</th></tr></thead>
          <tbody>{s.teams.map(t => <tr key={t.number} className={t.ours ? "ours" : ""}><td>{t.place}</td><td className="left"><strong>{title(t.name)}</strong></td><td>{fmt(t.pointsWon)}</td><td>{fmt(t.pointsLost)}</td><td>{t.percentWon.toFixed(1)}</td><td className="muted-cell">{fmt(t.ytdWon)}–{fmt(t.ytdLost)}</td><td className="muted-cell">{t.lastWeek ? `${fmt(t.lastWeek.points)} vs ${title(t.lastWeek.opponent)}` : ""}</td></tr>)}</tbody></table></div>
      </section>

      <section className="league-section" aria-label="Big Al's roster">
        <div className="eyebrow">OUR LINEUP · AVERAGE, HANDICAP, WHAT IT TAKES TO MOVE</div>
        <div className="roster-grid">{s.roster.map((b, i) => <article className="bowler-card roster-card" key={b.name}>
          <div className="card-top"><span className={`avatar avatar-${i % 4}`}>{b.name[0]}</span><span className="bowler-name">{title(b.name)}</span></div>
          <div className="card-scores"><div><span className="small-label">AVERAGE</span><strong>{b.average}</strong></div><span className="score-divider"/><div><span className="small-label">HANDICAP</span><strong className="possible">{b.handicap}</strong></div></div>
          <div className="roster-rows">
            <div className="summary-row"><span>Match points</span><strong>{b.matchPoints == null ? "–" : fmt(b.matchPoints)}</strong></div>
            <div className="summary-row"><span>Last week</span><strong>{b.games ? b.games.join(" · ") : "sat out"}{b.total != null && <span className="muted-cell"> = {b.total}</span>}</strong></div>
            <div className="summary-row"><span>To raise average</span><strong>{b.toRaise} series</strong></div>
            <div className="summary-row"><span>Drops below</span><strong>{b.toDrop}</strong></div>
          </div>
        </article>)}</div>
      </section>

      <div className="league-columns">
        <section className="league-section" aria-label="Individual match points">
          <div className="eyebrow">INDIVIDUAL MATCH POINTS · WHOLE LEAGUE</div>
          <ol className="leaderboard">{s.leaderboard.map((b, i) => <li key={b.name} className={b.ours ? "ours" : ""}><span className="rank">{i + 1}</span><span className="who"><strong>{title(b.name)}</strong><small>{title(b.team)}</small></span><span className="pts">{fmt(b.points)}</span></li>)}</ol>
        </section>
        <section className="league-section" aria-label="Big Al's week by week">
          <div className="eyebrow">OUR WEEK BY WEEK · POINTS OF 36</div>
          {s.history.length ? <div className="week-bars">{s.history.map(h => <div key={h.week} className="week-bar" title={h.opponent ? `Week ${h.week}: ${fmt(h.points ?? 0)} vs ${title(h.opponent)}` : `Week ${h.week}`}><span style={{ height: `${((h.points ?? 0) / 36) * 100}%` }} className={(h.points ?? 0) >= 18 ? "win" : ""}/><small>{h.week}</small></div>)}</div> : <p className="score-note">Ingest more weeks to see the trend.</p>}
          <p className="score-note">Bars above the line are winning weeks (18 or more).</p>
        </section>
      </div>
    </>}
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
