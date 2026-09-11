"use client";
import { useEffect, useState } from "react";
import { Beer, Target } from "lucide-react";
import { analyze, maximum } from "@/lib/bowling";
import type { Night } from "@/lib/scorebook";
import { GAMES_PER_NIGHT, ourGames } from "@/lib/league/night-points";

type Roster = { name: string; average: number; toRaise: number; toDrop: number }[];
const names = ["Doug", "Mustafa", "Kyle", "Pete"];

/** What each bowler needs tonight: the series that raises their average, and whether the chalkboard number is still reachable. */
export default function TargetsPanel({ night }: { night: Night }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  useEffect(() => { void (async () => {
    try {
      const r = await fetch("/api/league/teams"); const d = await r.json(); if (!r.ok) return;
      const us = (d.teams as { bowlers: { name: string; average: number; toRaise: number; toDrop: number }[] }[]).find(t => t.bowlers.some(b => b.name.toUpperCase().startsWith("DOUG KVAMME")));
      if (us) setRoster(us.bowlers);
    } catch { /* targets are a bonus; the scorebook works without them */ }
  })(); }, []);
  const games = ourGames(night);
  const target = night.drinkTargets;
  const rows = names.map((name, i) => {
    const row = roster?.find(b => b.name.toUpperCase().startsWith(name.toUpperCase() + " "));
    const done = games.map(g => g[i]).filter((v): v is number => v != null);
    const series = done.reduce((s, v) => s + v, 0);
    const left = GAMES_PER_NIGHT - done.length;
    const state = analyze(night.rolls[i]); const final = night.finals?.[i];
    const score = final ?? state.score; const ceiling = final ?? maximum(night.rolls[i]); const complete = final != null || state.complete;
    const chalk = !target ? null : [target.high, target.low].map(t => complete ? (score === t ? `hit ${t}` : null) : score <= t && t <= ceiling ? `${t} still live` : null).filter(Boolean).join(" · ") || null;
    return { name, row, series, left, complete, chalk,
      need: row && left > 0 ? Math.max(0, row.toRaise - series) : null,
      raised: row && left === 0 ? series >= row.toRaise : null };
  });
  if (!roster && !target) return null;
  return <section className="targets-panel">
    <div className="eyebrow"><Target size={15}/> TONIGHT&rsquo;S TARGETS</div>
    {rows.map(r => <div key={r.name} className="target-row">
      <strong>{r.name}</strong>
      <span>{r.row ? (r.need != null ? `${r.need} more over ${r.left} game${r.left === 1 ? "" : "s"} raises the ${r.row.average}` : r.raised ? `series ${r.series} raises the average` : `series ${r.series}, average holds`) : "no league average yet"}</span>
      {r.chalk && <em><Beer size={12}/> {r.chalk}</em>}
    </div>)}
    {!target && <p className="score-note">Set the chalkboard numbers in the match panel to see who can still hit them.</p>}
  </section>;
}
