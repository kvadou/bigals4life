import { Award, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Topbar } from "../components/topbar";
import { Crumbs } from "../components/crumbs";
import { loadRecordBook } from "@/lib/league/records-server";
import { topBy } from "@/lib/league/records";
import { shortSeason, title } from "../components/format";

export const dynamic = "force-dynamic";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season } = await searchParams;
  const book = await loadRecordBook(season).catch(() => null);
  const gaps = book?.coverage.filter(c => c.missing.length) ?? [];
  return <main>
    <Topbar/>
    <Crumbs items={[{ label: "Record book" }]}/>
    {!book || !book.records.length ? <section className="intro"><div><div className="eyebrow">RECORD BOOK</div><h1>No records <em>yet.</em></h1><p>Ingest Gary&rsquo;s weekly sheets and every high game in the league shows up here.</p></div></section> : <>
      <section className="intro"><div>
        <div className="eyebrow"><Award size={14}/> RECORD BOOK · {book.scope ? shortSeason(book.scope).toUpperCase() : "EVERY SEASON WE HAVE"}</div>
        <h1>Who owns <em>the night.</em></h1>
        <p>High game, high series and where every average is headed. Computed from the standings sheets, not from anyone&rsquo;s memory.</p>
        <nav className="season-nav" aria-label="Season">
          <Link href="/records" className={book.scope ? "" : "active"}>All time</Link>
          {book.seasons.map(s => <Link key={s.name} href={`/records?season=${encodeURIComponent(s.name)}`} className={s.name === book.scope ? "active" : ""}>{shortSeason(s.name)}</Link>)}
        </nav>
      </div></section>

      {gaps.length > 0 && <p className="score-note coverage-note" role="note">
        {gaps.map(g => `${shortSeason(g.name)} is missing week${g.missing.length > 1 ? "s" : ""} ${g.missing.join(", ")}`).join("; ")}. A record set on one of those nights is not in here yet.
      </p>}

      <div className="league-columns records-columns">
        <section className="league-section" aria-label="High game">
          <div className="eyebrow">HIGH GAME</div>
          <ol className="leaderboard">{topBy(book.records, r => r.highGame).map(({ place, record, mark }) => <li key={record.blsId} className={record.teamName === book.ourTeam ? "ours" : ""}>
            <span className="rank">{place}</span>
            <span className="who"><Link href={`/records/${record.blsId}`}><strong>{title(record.name)}</strong></Link><small>{shortSeason(mark.seasonName)} · week {mark.week}</small></span>
            <span className="pts">{mark.value}</span></li>)}
          </ol>
        </section>
        <section className="league-section" aria-label="High series">
          <div className="eyebrow">HIGH SERIES</div>
          <ol className="leaderboard">{topBy(book.records, r => r.highSeries).map(({ place, record, mark }) => <li key={record.blsId} className={record.teamName === book.ourTeam ? "ours" : ""}>
            <span className="rank">{place}</span>
            <span className="who"><Link href={`/records/${record.blsId}`}><strong>{title(record.name)}</strong></Link><small>{shortSeason(mark.seasonName)} · week {mark.week}</small></span>
            <span className="pts">{mark.value}</span></li>)}
          </ol>
        </section>
      </div>

      <section className="league-section" aria-label="Every bowler">
        <div className="eyebrow">EVERY BOWLER · {book.records.length} · TAP FOR THE FULL CARD</div>
        <div className="league-scroll" tabIndex={0} role="region" aria-label="Bowler records, scroll for more columns"><table className="league-table"><thead><tr>
          <th scope="col" className="left">Bowler</th><th scope="col" className="left">Team</th><th scope="col">Avg</th><th scope="col">Hdcp</th><th scope="col">High game</th><th scope="col">High series</th><th scope="col">Games</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{book.records.map(r => <tr key={r.blsId} className={r.teamName === book.ourTeam ? "ours" : ""}>
            <td className="left"><Link href={`/records/${r.blsId}`}><strong>{title(r.name)}</strong></Link></td>
            <td className="left muted-cell">{title(r.teamName)}</td>
            <td>{r.average ?? "–"}</td><td className="muted-cell">{r.handicap ?? "–"}</td>
            <td><strong>{r.highGame?.value ?? "–"}</strong></td><td><strong>{r.highSeries?.value ?? "–"}</strong></td>
            <td className="muted-cell">{r.gamesBowled || "–"}</td>
            <td><Link href={`/records/${r.blsId}`} aria-label={`Open ${title(r.name)}`}><ChevronRight size={14}/></Link></td></tr>)}
          </tbody></table></div>
      </section>
    </>}
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
