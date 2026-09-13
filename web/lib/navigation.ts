export type NavigationCrumb = { label: string; href?: string };
const base = 'https://bigals4life.com';
const route = /^\/(?:$|season(?:\/[a-zA-Z0-9-]+(?:\/game\/[1-3])?)?|night|live|review(?:\/[a-zA-Z0-9-]+)?|league|records(?:\/\d+)?)$/;
/** Keep a small, inert set of local navigation state. Never accept redirects or arbitrary paths. */
export function safeOrigin(value: string | null | undefined, depth = 0): string | null {
  if (!value || value.length > 2048 || depth > 4 || !/^\/(?!\/)/.test(value) || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const u = new URL(value, base);
    if (u.origin !== base || !route.test(u.pathname)) return null;
    const out = new URL(u.pathname, base);
    for (const key of ['night', 'season', 'bowler']) {
      const v = u.searchParams.get(key);
      if (v && v.length <= 100 && !/[\u0000-\u001f]/.test(v)) out.searchParams.set(key, v);
    }
    const parent = safeOrigin(u.searchParams.get('from'), depth + 1);
    if (parent && identity(parent) !== identity(out.pathname + out.search)) out.searchParams.set('from', parent);
    return out.pathname + out.search;
  } catch { return null; }
}
const pathOf = (value: string) => new URL(value, base).pathname;
function identity(value: string): string { const u = new URL(value, base); u.searchParams.delete('from'); u.searchParams.sort(); return u.pathname + u.search; }
export function withOrigin(target: string, current: string): string {
  const destination = safeOrigin(target), origin = safeOrigin(current);
  if (!destination || !origin || pathOf(destination) === '/' || identity(destination) === identity(origin)) return target;
  const to = new URL(target, base), from = new URL(origin, base);
  let ancestor = safeOrigin(from.searchParams.get('from'));
  for (let depth = 0; ancestor && depth < 4; depth++) {
    const previous = new URL(ancestor, base);
    if (identity(ancestor) === identity(destination)) {
      const parent = safeOrigin(previous.searchParams.get('from'));
      to.searchParams.delete('from');
      if (parent) to.searchParams.set('from', parent);
      return to.pathname + to.search + to.hash;
    }
    ancestor = safeOrigin(previous.searchParams.get('from'));
  }
  // Game tabs are siblings, not another level in the journey.
  const siblings = /\/game\/[1-3]$/.test(from.pathname) && /\/game\/[1-3]$/.test(to.pathname) && to.pathname.replace(/\/game\/[1-3]$/, '') === from.pathname.replace(/\/game\/[1-3]$/, '');
  const parent = siblings ? safeOrigin(from.searchParams.get('from')) : origin;
  to.searchParams.delete('from');
  if (parent) to.searchParams.set('from', parent);
  return to.pathname + to.search + to.hash;
}
function labelFor(path: string, fallback: NavigationCrumb[]): string {
  const known = fallback.find(c => c.href && pathOf(c.href) === path);
  if (known) return known.label;
  if (path === '/') return 'Tonight';
  if (path === '/season') return 'Season';
  if (path === '/night') return 'Scorebook';
  if (path === '/live') return 'Live Lane';
  if (path.startsWith('/review')) return 'Review';
  if (path === '/league') return 'Standings';
  if (path === '/records') return 'Record book';
  if (path.startsWith('/records/')) return 'Bowler record';
  const game = path.match(/\/game\/([1-3])$/); return game ? `Game ${game[1]}` : 'Week';
}
export function contextCrumbs(items: NavigationCrumb[], current: string): NavigationCrumb[] {
  const here = safeOrigin(current);
  if (!here) return items;
  let next = safeOrigin(new URL(here, base).searchParams.get('from'));
  if (!next) return items;
  const seen = new Set([identity(here)]), parents: NavigationCrumb[] = [];
  while (next && parents.length < 4) {
    const u = new URL(next, base);
    if (seen.has(identity(next))) break;
    seen.add(identity(next)); parents.unshift({label:labelFor(u.pathname, items), href:next});
    next = safeOrigin(u.searchParams.get('from'));
  }
  return parents.length ? [...parents, items.at(-1) ?? {label:labelFor(pathOf(here), items)}] : items;
}
