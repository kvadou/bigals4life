/** In-memory per-key limiter for the AI routes. One instance per server; good enough to stop a runaway tap or a script. */
const hits = new Map<string, number[]>();
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now); hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every(t => now - t >= windowMs)) hits.delete(k);
  return true;
}
