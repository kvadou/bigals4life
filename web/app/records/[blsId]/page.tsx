import { notFound } from "next/navigation";
import { Award } from "lucide-react";
import Link from "next/link";
import { Topbar } from "../../components/topbar";
import { Crumbs } from "../../components/crumbs";
import { loadBowler } from "@/lib/league/records-server";
import { day, fmt, shortSeason, title } from "../../components/format";

export const dynamic = "force-dynamic";

/** One line, no axes: an average only ever tells you which way it is going. */
function Trend({ points }: { points: { seasonName: string; week: number; average: number }[] }) {
  if (points.length < 2) return <p className="score-note">Two weeks of averages and the trend line starts here.</p>;
  const W = 600, H = 150, pad = 22;
  const values = points.map(p => p.average);
  const lo = Math.min(...values) - 4, hi = Math.max(...values) + 4;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.average).toFixed(1)}`).join(" ");
  const breaks = points.map((p, i) => ({ ...p, i })).filter((p, i) => i > 0 && p.seasonName !== points[i - 1].seasonName);
  const last = points[points.length - 1], first = points[0];
  return <figure className="trend">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Average from ${first.average} in week ${first.week} to ${last.average} in week ${last.week}.`} preserveAspectRatio="none">
      <polygon className="trend-fill" points={`${x(0)},${H - pad} ${line} ${x(points.length - 1)},${H - pad}`}/>
      <polyline className="trend-line" points={line}/>
      {breaks.map(b => <line key={b.i} className="trend-break" x1={x(b.i - 0.5)} x2={x(b.i - 0.5)} y1={pad - 8} y2={H - pad}/>)}
      <circle className="trend-dot" cx={x(points.length - 1)} cy={y(last.average)} r="5"/>
    </svg>
    <figcaption>
      <span>{shortSeason(first.seasonName)} week {first.week} · <strong>{first.average}</strong></span>
      <span>now · <strong>{last.average}</strong> <em className={last.average >= first.average ? "up" : "down"}>{last.average >= first.average ? "+" : ""}{last.average - first.average}</em></span>
    </figcaption>
  </figure>;
}

export default async function BowlerPage({ params }: { params: Promise<{ blsId: string }> }) {
  const { blsId } = await params;
  const id = Number(blsId);
  const page = Number.isInteger(id) ? await loadBowler(id).catch(() => null) : null;
  if (!page) notFound();
  const { record: r, perSeason } = page;
  return <main>
    <Topbar/>
    <Crumbs items={[{ label: "Record book", href: "/records" }, { label: title(r.name) }]}/>
    <section className="intro"><div>
      <div className="eyebrow"><Award size={14}/> {title(r.teamName)} · {r.seasons.map(shortSeason).join(" & ")}</div>
      <h1>{title(r.name).split(" ")[0]}&rsquo;s <em>record.</em></h1>
      <p>{r.nightsCounted} night{r.nightsCounted === 1 ? "" : "s"} on the sheet, {r.gamesBowled} games, {r.pins.toLocaleString()} pins.</p>
    </div></section>

    <section className="league-section" aria-label="Career bests">
      <div className="eyebrow">THE BESTS</div>
      <div className="record-marks">
        <article className="record-mark"><span className="small-label">HIGH GAME</span><strong>{r.highGame?.value ?? "–"}</strong><small>{r.highGame ? `${shortSeason(r.highGame.seasonName)} week ${r.highGame.week} · ${day(r.highGame.bowledOn)}` : "no counted night yet"}</small></article>
        <article className="record-mark"><span className="small-label">HIGH SERIES</span><strong>{r.highSeries?.value ?? "–"}</strong><small>{r.highSeries ? `${shortSeason(r.highSeries.seasonName)} week ${r.highSeries.week} · ${day(r.highSeries.bowledOn)}` : "no counted night yet"}</small></article>
        <article className="record-mark"><span className="small-label">AVERAGE</span><strong>{r.average ?? "–"}</strong><small>handicap {r.handicap ?? "–"} · {r.matchPoints == null ? "no match points yet" : `${fmt(r.matchPoints)} match points`}</small></article>
      </div>
    </section>

    <section className="league-section" aria-label="Average trend">
      <div className="eyebrow">AVERAGE, WEEK BY WEEK</div>
      <Trend points={r.trend}/>
    </section>

    {perSeason.length > 1 && <section className="league-section" aria-label="By season">
      <div className="eyebrow">BY SEASON</div>
      <div className="league-scroll" tabIndex={0} role="region" aria-label="Bowler statistics, scroll for more columns"><table className="league-table"><thead><tr><th scope="col" className="left">Season</th><th scope="col">Nights</th><th scope="col">Avg</th><th scope="col">High game</th><th scope="col">High series</th></tr></thead>
        <tbody>{perSeason.map(s => <tr key={s.seasons[0]}><td className="left"><strong>{shortSeason(s.seasons[0])}</strong></td><td>{s.nightsCounted}</td><td>{s.average ?? "–"}</td><td><strong>{s.highGame?.value ?? "–"}</strong></td><td><strong>{s.highSeries?.value ?? "–"}</strong></td></tr>)}</tbody></table></div>
    </section>}

    <section className="league-section" aria-label="Night by night">
      <div className="eyebrow">NIGHT BY NIGHT · NEWEST FIRST</div>
      <div className="league-scroll" tabIndex={0} role="region" aria-label="Bowler statistics, scroll for more columns"><table className="league-table"><thead><tr><th scope="col" className="left">Week</th><th scope="col" className="left">Against</th><th scope="col">G1</th><th scope="col">G2</th><th scope="col">G3</th><th scope="col">Series</th><th scope="col">Avg after</th></tr></thead>
        <tbody>{r.nights.map(n => <tr key={`${n.seasonName}-${n.week}`}>
          <td className="left"><strong>{shortSeason(n.seasonName)} wk {n.week}</strong><br/><small className="muted-cell">{day(n.bowledOn)}</small></td>
          <td className="left muted-cell">{n.opponent ? title(n.opponent) : "–"}</td>
          {n.scratchGames!.map((g, i) => <td key={i} className={g === r.highGame?.value && n.week === r.highGame?.week && n.seasonName === r.highGame?.seasonName ? "record-cell" : ""}>{g}</td>)}
          <td><strong className={n.series === r.highSeries?.value && n.week === r.highSeries?.week && n.seasonName === r.highSeries?.seasonName ? "record-cell" : ""}>{n.series}</strong></td>
          <td className="muted-cell">{n.average ?? "–"}</td></tr>)}
        </tbody></table></div>
    </section>
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
