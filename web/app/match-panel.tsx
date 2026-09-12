"use client";
import { useEffect, useRef, useState } from "react";
import { Beer, Swords, X } from "lucide-react";
import type { Match, Night } from "@/lib/scorebook";
import { GAMES_PER_NIGHT, nightMatchPoints, ourGames } from "@/lib/league/night-points";
import { bestLineup, evaluate, firstMoverNote, type LineupBowler } from "@/lib/league/lineup";
import type { WeekSummary } from "@/lib/season";

type TeamOption = { number: number; name: string; bowlers: { name: string; average: number; handicap: number; games: number; bowledLastWeek: boolean }[] };
const ourNames = ["Doug", "Mustafa", "Kyle", "Pete"];
const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".5", "½");
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/'S\b/i, "'s");
const first = (s: string) => title(s).split(" ")[0];

export default function MatchPanel({ night, setNight, disabled }: { night: Night; setNight: (u: (n: Night) => Night) => void; disabled: boolean }) {
  const [modal, setModal] = useState<"setup" | "chalk" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (modal) dialog.current?.showModal(); else dialog.current?.close(); }, [modal]);
  const match = night.match;
  const points = nightMatchPoints(night);
  const games = ourGames(night);
  const setOpponentScore = (g: number, i: number, value: string) => {
    const score = value.trim() === "" ? null : Math.max(0, Math.min(300, Math.round(Number(value))));
    if (score !== null && Number.isNaN(score)) return;
    setNight(n => { if (!n.match) return n; const grid = n.match.opponentGames.map(r => [...r]); while (grid.length <= g) grid.push(n.match.opponent.bowlers.map(() => null)); grid[g][i] = score; return { ...n, match: { ...n.match, opponentGames: grid } }; });
  };
  return <section className="match-panel">
    <div className="match-head"><div className="eyebrow"><Swords size={15}/> {match ? `WEEK ${match.week} · VS ${title(match.opponent.name).toUpperCase()}` : "LEAGUE MATCH"}</div><button className="text-button" disabled={disabled} onClick={() => setModal("setup")}>{match ? "Change" : "Set up match"}</button></div>
    {match && points ? <>
      <div className="points-strip" aria-live="polite">
        <div><span className="small-label">BIG AL&rsquo;S</span><strong>{fmt(points.total[0])}</strong></div>
        <div className="points-remaining"><span className="small-label">LEFT</span><strong>{fmt(points.remaining)}</strong></div>
        <div><span className="small-label">{first(match.opponent.name).toUpperCase()}</span><strong>{fmt(points.total[1])}</strong></div>
      </div>
      <div className="points-breakdown">
        {points.games.map(g => <div key={g.game} className="summary-row"><span>Game {g.game} team{g.ours != null && g.theirs != null ? ` · ${g.ours} v ${g.theirs}` : ""}</span><strong>{g.split[0] || g.split[1] ? `${fmt(g.split[0])}–${fmt(g.split[1])}` : "open"}</strong></div>)}
        <div className="summary-row"><span>Series team{points.series.ours != null && points.series.theirs != null ? ` · ${points.series.ours} v ${points.series.theirs}` : ""}</span><strong>{points.series.split[0] || points.series.split[1] ? `${fmt(points.series.split[0])}–${fmt(points.series.split[1])}` : "open"}</strong></div>
        {points.bowlers.map(b => <div key={b.name} className="summary-row"><span>{b.name} v {first(b.opponent)}</span><strong>{fmt(b.total[0])}–{fmt(b.total[1])}</strong></div>)}
      </div>
      <div className="opponent-grid-scroll"><table className="opponent-grid"><thead><tr><th scope="col" className="left">{title(match.opponent.name)}</th>{Array.from({ length: GAMES_PER_NIGHT }, (_, g) => <th scope="col" key={g}>G{g + 1}</th>)}<th scope="col">HDCP</th></tr></thead>
        <tbody>{match.opponent.bowlers.map((b, i) => <tr key={i}><th scope="row" className="left">{first(b.name)}<small>vs {ourNames[i] ?? "–"}</small></th>{Array.from({ length: GAMES_PER_NIGHT }, (_, g) => <td key={g}><input inputMode="numeric" pattern="[0-9]*" aria-label={`${b.name} game ${g + 1} score`} disabled={disabled} value={match.opponentGames[g]?.[i] ?? ""} onChange={e => setOpponentScore(g, i, e.target.value)}/></td>)}<td className="muted-cell">{b.handicap}</td></tr>)}
        <tr className="ours-row"><th scope="row" className="left">Big Al&rsquo;s (scratch)</th>{games.map((g, k) => <td key={k}>{g.every(v => v != null) ? g.reduce((s, v) => s + (v ?? 0), 0) : "–"}</td>)}<td className="muted-cell">{match.ours.reduce((s, b) => s + b.handicap, 0)}</td></tr></tbody></table></div>
      <p className="score-note">Type the other team&rsquo;s game totals as they finish. Handicap is added automatically. Points settle when both sides finish a game.</p>
    </> : <p className="score-note">Pick tonight&rsquo;s opponent to see match points tick up as the games finish.</p>}
    <div className="chalkboard"><Beer size={16}/><div><span className="small-label">CHALKBOARD</span>{night.drinkTargets ? <strong>{night.drinkTargets.high} high · {night.drinkTargets.low} low</strong> : <strong>not set</strong>}</div><button className="text-button" disabled={disabled} onClick={() => setModal("chalk")}>Edit</button></div>
    <dialog ref={dialog} onCancel={() => setModal(null)} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="dialog-inner">
      <button className="close-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20}/></button>
      {modal === "setup" && <MatchSetup night={night} onSave={m => { setNight(n => ({ ...n, match: m })); setModal(null); }}/>}
      {modal === "chalk" && <Chalkboard night={night} onSave={t => { setNight(n => ({ ...n, drinkTargets: t })); setModal(null); }}/>}
    </div></dialog>
  </section>;
}

function MatchSetup({ night, onSave }: { night: Night; onSave: (m: Match) => void }) {
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [season, setSeason] = useState(night.match?.season ?? "");
  const [error, setError] = useState("");
  const [week, setWeek] = useState(night.match?.week ?? 1);
  const [opponent, setOpponent] = useState(night.match?.opponent.number ?? 0);
  const [picked, setPicked] = useState<string[]>(night.match?.opponent.bowlers.map(b => b.name) ?? []);
  const [handicaps, setHandicaps] = useState<Record<string, number>>({});
  const [ours, setOurs] = useState<Match["ours"]>(night.match?.ours ?? ourNames.map(name => ({ name, handicap: 0 })));
  const [lane, setLane] = useState<"odd" | "even">(night.match?.lane ?? "even");
  const [averages, setAverages] = useState<Record<string, number>>({});
  const [known, setKnown] = useState<Record<string, number[]>>({});
  const [take, setTake] = useState<{ text: string; busy: boolean }>({ text: "", busy: false });
  useEffect(() => { void (async () => {
    try {
      const r = await fetch("/api/league/teams"); const d = await r.json(); if (!r.ok) throw Error(d.error);
      setTeams(d.teams); if (!season) setSeason(d.season);
      const h: Record<string, number> = {}, av: Record<string, number> = {}; for (const t of d.teams as TeamOption[]) for (const b of t.bowlers) { h[b.name] = b.handicap; av[b.name] = b.average; } setHandicaps(h); setAverages(av);
      const usTeam = (d.teams as TeamOption[]).find(t => t.bowlers.some(b => b.name.toUpperCase().startsWith("DOUG KVAMME")));
      if (!night.match) setOurs(ourNames.map(name => { const hit = usTeam?.bowlers.find(b => b.name.toUpperCase().startsWith(name.toUpperCase() + " ")); return { name, handicap: hit?.handicap ?? 0 }; }));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load league teams."); setTeams([]); }
  })(); }, []);
  // Anyone who pre-bowled this week is a known quantity: their three games are in, so the draft uses them.
  useEffect(() => { void (async () => {
    try { const r = await fetch("/api/season", { cache: "no-store" }); if (!r.ok) return; const weeks = (await r.json()).weeks as WeekSummary[]; const k: Record<string, number[]> = {};
      for (const w of weeks) if (w.prebowl?.week === week) for (const i of w.prebowl.bowlers) { const g = w.games.filter(x => x.complete[i]).map(x => x.scores[i] ?? 0); if (g.length === GAMES_PER_NIGHT) k[ourNames[i]] = g; }
      setKnown(k);
    } catch { /* optional */ }
  })(); }, [week]);
  const team = teams?.find(t => t.number === opponent);
  useEffect(() => { if (team && (!night.match || night.match.opponent.number !== opponent)) setPicked(team.bowlers.slice(0, 4).map(b => b.name)); }, [opponent, teams]);
  const toggle = (name: string) => setPicked(p => p.includes(name) ? p.filter(x => x !== name) : p.length < 4 ? [...p, name] : p);
  const canSave = !!team && picked.length === 4;
  // Our averages come from our own roster on Gary's sheet, never from a same-named bowler on another team.
  const usTeam = teams?.find(t => t.bowlers.some(b => b.name.toUpperCase().startsWith("DOUG KVAMME")));
  const ourAverage = (name: string) => usTeam?.bowlers.find(b => b.name.toUpperCase().startsWith(name.toUpperCase() + " "))?.average ?? 0;
  const ourSide: LineupBowler[] = ours.map(b => ({ name: b.name, average: ourAverage(b.name), handicap: b.handicap, known: known[b.name] }));
  const theirSide: LineupBowler[] = picked.map(name => ({ name, average: averages[name] ?? 0, handicap: handicaps[name] ?? 0 }));
  const ready = picked.length === 4 && ourSide.every(b => b.average > 0);
  const current = ready ? evaluate(ourSide, theirSide) : null;
  const best = ready && lane === "even" ? bestLineup(ourSide, theirSide) : null;
  const move = (i: number, dir: -1 | 1) => setOurs(o => { const j = i + dir; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const applyBest = () => { if (best) setOurs(best.order.map(b => ({ name: b.name, handicap: b.handicap }))); };
  const askCoach = async () => {
    if (!ready || !team) return; setTake({ text: "", busy: true });
    try { const r = await fetch("/api/league/lineup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lane, opponent: team.name, ours: ourSide, theirs: theirSide }) }); const d = await r.json(); if (!r.ok) throw Error(d.error); setTake({ text: d.take, busy: false }); }
    catch (e) { setTake({ text: e instanceof Error ? e.message : "The coach is not answering right now.", busy: false }); }
  };
  return <>
    <div className="eyebrow">TONIGHT&rsquo;S MATCH</div><h2>Who are we bowling?</h2>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {!teams && !error && <p>Loading league teams…</p>}
    {teams && teams.length > 0 && <>
      <label className="field">Week<input inputMode="numeric" value={week} onChange={e => setWeek(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}/></label>
      <label className="field">Opponent<select value={opponent} onChange={e => setOpponent(Number(e.target.value))}><option value={0}>Choose a team</option>{teams.filter(t => !t.bowlers.some(b => b.name.toUpperCase().startsWith("DOUG KVAMME"))).map(t => <option key={t.number} value={t.number}>{title(t.name)}</option>)}</select></label>
      {team && <fieldset className="lineup-pick"><legend>Their four tonight (in lane order)</legend>{team.bowlers.map(b => <label key={b.name} className={picked.includes(b.name) ? "on" : ""}><input type="checkbox" checked={picked.includes(b.name)} onChange={() => toggle(b.name)}/><span>{title(b.name)}</span><small>{b.average} avg · {b.handicap} hdcp{picked.includes(b.name) ? ` · #${picked.indexOf(b.name) + 1}` : ""}</small></label>)}</fieldset>}
      <fieldset className="lineup-pick lane"><legend>Our lane</legend><label className={lane === "odd" ? "on" : ""}><input type="radio" name="lane" checked={lane === "odd"} onChange={() => setLane("odd")}/><span>Odd</span><small>we hand names in first</small></label><label className={lane === "even" ? "on" : ""}><input type="radio" name="lane" checked={lane === "even"} onChange={() => setLane("even")}/><span>Even</span><small>they go first, we stack</small></label></fieldset>
      {team && picked.length === 4 && <section className="lineup-draft" aria-label="Lineup">
        <div className="eyebrow"><Swords size={13}/> THE DRAFT · {lane === "even" ? "WE SEE THEIR FOUR FIRST" : "WE GO FIRST"}</div>
        {!ready && <p className="score-note">Averages load from Gary’s sheet. Pick their four in lane order and the matchups appear here.</p>}
        {ready && current && <>
          <div className="draft-grid">
            {ours.map((b, i) => { const p = current.pairings[i]; const t = picked[i]; return <div key={b.name} className={`draft-row ${p.edge > 5 ? "won" : p.edge < -5 ? "lost" : ""}`}>
              <div className="draft-controls"><button type="button" className="text-button" aria-label={`Move ${b.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button><button type="button" className="text-button" aria-label={`Move ${b.name} down`} disabled={i === ours.length - 1} onClick={() => move(i, 1)}>▼</button></div>
              <div className="draft-us"><strong>{i + 1}. {b.name}</strong><small>{known[b.name] ? `pre-bowled ${known[b.name].join(", ")}` : `${ourAverage(b.name)} avg`} · +{b.handicap}</small></div>
              <div className="draft-vs"><b>{p.expected.toFixed(1)}</b><small>of 4 pts</small></div>
              <div className="draft-them"><strong>{first(t)}</strong><small>{averages[t] ?? "–"} avg · +{handicaps[t] ?? 0}</small></div>
            </div>; })}
          </div>
          <div className="draft-total"><span>This order</span><strong>{current.expected.toFixed(1)} of {current.max} head-to-head points</strong></div>
          {best && best.expected > current.expected + 0.05 && <div className="draft-suggest"><div><span className="small-label">BEST STACK</span><strong>{best.order.map(b => b.name).join(" · ")}</strong><small>{best.expected.toFixed(1)} expected, +{(best.expected - current.expected).toFixed(1)} over this order</small></div><button type="button" className="secondary" onClick={applyBest}>Use it</button></div>}
          {best && best.expected <= current.expected + 0.05 && <p className="score-note">This is the best stack against their four.</p>}
          {lane === "odd" && <p className="score-note">{firstMoverNote(ourSide)}</p>}
          <div className="draft-coach">{take.text ? <p>{take.text}</p> : null}<button type="button" className="text-button" disabled={take.busy} onClick={() => void askCoach()}>{take.busy ? "Thinking…" : take.text ? "Ask again" : "Coach’s take on this matchup"}</button></div>
        </>}
      </section>}
      <fieldset className="lineup-pick ours"><legend>Our handicaps tonight</legend>{ours.map((b, i) => <label key={b.name}><span>{b.name}</span><input inputMode="numeric" aria-label={`${b.name} handicap`} value={b.handicap} onChange={e => setOurs(o => o.map((x, j) => j === i ? { ...x, handicap: Math.max(0, Math.min(120, Number(e.target.value) || 0)) } : x))}/></label>)}</fieldset>
      <button className="primary" disabled={!canSave} onClick={() => team && onSave({ season, week, lane, opponent: { number: team.number, name: team.name, bowlers: picked.map(name => ({ name, handicap: handicaps[name] ?? 0 })) }, ours, opponentGames: night.match?.opponent.number === team.number ? night.match.opponentGames : [] })}>Start the match</button>
    </>}
  </>;
}

function Chalkboard({ night, onSave }: { night: Night; onSave: (t: Night["drinkTargets"]) => void }) {
  const [high, setHigh] = useState(String(night.drinkTargets?.high ?? ""));
  const [low, setLow] = useState(String(night.drinkTargets?.low ?? ""));
  const ok = /^\d{1,3}$/.test(high) && /^\d{1,3}$/.test(low) && Number(high) <= 300 && Number(low) <= 300;
  return <>
    <div className="eyebrow">THE CHALKBOARD</div><h2>Tonight&rsquo;s beer numbers</h2><p>Whatever is written on the board when you walk in. Hit it exactly and the round is on the house rules.</p>
    <label className="field">High<input inputMode="numeric" value={high} onChange={e => setHigh(e.target.value)}/></label>
    <label className="field">Low<input inputMode="numeric" value={low} onChange={e => setLow(e.target.value)}/></label>
    <button className="primary" disabled={!ok} onClick={() => onSave({ high: Number(high), low: Number(low), qualificationRule: night.drinkTargets?.qualificationRule ?? null })}>Save</button>
  </>;
}
