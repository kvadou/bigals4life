"use client";
import { useEffect, useRef, useState } from "react";
import { Beer, Swords, X } from "lucide-react";
import type { Match, Night } from "@/lib/scorebook";
import { GAMES_PER_NIGHT, nightMatchPoints, ourGames } from "@/lib/league/night-points";

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
  useEffect(() => { void (async () => {
    try {
      const r = await fetch("/api/league/teams"); const d = await r.json(); if (!r.ok) throw Error(d.error);
      setTeams(d.teams); if (!season) setSeason(d.season);
      const h: Record<string, number> = {}; for (const t of d.teams as TeamOption[]) for (const b of t.bowlers) h[b.name] = b.handicap; setHandicaps(h);
      const usTeam = (d.teams as TeamOption[]).find(t => t.bowlers.some(b => b.name.toUpperCase().startsWith("DOUG KVAMME")));
      if (!night.match) setOurs(ourNames.map(name => { const hit = usTeam?.bowlers.find(b => b.name.toUpperCase().startsWith(name.toUpperCase() + " ")); return { name, handicap: hit?.handicap ?? 0 }; }));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load league teams."); setTeams([]); }
  })(); }, []);
  const team = teams?.find(t => t.number === opponent);
  useEffect(() => { if (team && (!night.match || night.match.opponent.number !== opponent)) setPicked(team.bowlers.slice(0, 4).map(b => b.name)); }, [opponent, teams]);
  const toggle = (name: string) => setPicked(p => p.includes(name) ? p.filter(x => x !== name) : p.length < 4 ? [...p, name] : p);
  const canSave = !!team && picked.length === 4;
  return <>
    <div className="eyebrow">TONIGHT&rsquo;S MATCH</div><h2>Who are we bowling?</h2>
    {error && <p className="photo-error" role="alert">{error}</p>}
    {!teams && !error && <p>Loading league teams…</p>}
    {teams && teams.length > 0 && <>
      <label className="field">Week<input inputMode="numeric" value={week} onChange={e => setWeek(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}/></label>
      <label className="field">Opponent<select value={opponent} onChange={e => setOpponent(Number(e.target.value))}><option value={0}>Choose a team</option>{teams.filter(t => !t.bowlers.some(b => b.name.toUpperCase().startsWith("DOUG KVAMME"))).map(t => <option key={t.number} value={t.number}>{title(t.name)}</option>)}</select></label>
      {team && <fieldset className="lineup-pick"><legend>Their four tonight (in lane order)</legend>{team.bowlers.map(b => <label key={b.name} className={picked.includes(b.name) ? "on" : ""}><input type="checkbox" checked={picked.includes(b.name)} onChange={() => toggle(b.name)}/><span>{title(b.name)}</span><small>{b.average} avg · {b.handicap} hdcp{picked.includes(b.name) ? ` · #${picked.indexOf(b.name) + 1}` : ""}</small></label>)}</fieldset>}
      <fieldset className="lineup-pick ours"><legend>Our handicaps tonight</legend>{ours.map((b, i) => <label key={b.name}><span>{b.name}</span><input inputMode="numeric" aria-label={`${b.name} handicap`} value={b.handicap} onChange={e => setOurs(o => o.map((x, j) => j === i ? { ...x, handicap: Math.max(0, Math.min(120, Number(e.target.value) || 0)) } : x))}/></label>)}</fieldset>
      <button className="primary" disabled={!canSave} onClick={() => team && onSave({ season, week, opponent: { number: team.number, name: team.name, bowlers: picked.map(name => ({ name, handicap: handicaps[name] ?? 0 })) }, ours, opponentGames: night.match?.opponent.number === team.number ? night.match.opponentGames : [] })}>Start the match</button>
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
