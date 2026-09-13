"use client";
import type { Night } from "@/lib/scorebook";
import { liveStakes } from "@/lib/league/live-stakes";
import "./stakes.css";

export default function LiveStakesPanel({ night }: { night: Night }) {
  const all = liveStakes(night), cards = all.filter(card => card.status !== "waiting");
  if (!all.length) return null;
  return <section className="live-stakes" aria-label="Live matchup stakes">
    <header><h2>What’s on the line</h2><span>Game {night.game} · Individual points</span></header>
    {!cards.length ? <p className="live-stakes-waiting">Targets appear when the opponent’s final scores are entered.</p> : <div className="live-stakes-list">{cards.map(card => <article key={card.rosterIndex} className={`live-stake live-stake-${card.status}`}>
      <h3>{card.title}</h3><p>{card.detail}</p>
    </article>)}</div>}
    {cards.length > 0 && cards.length < all.length && <p className="live-stakes-waiting">Other matchups are waiting for opponent final scores.</p>}
    <p className="live-stakes-note">Based on entered scores and handicaps. Each game matchup is worth 1 point; a tie splits it.</p>
  </section>;
}
