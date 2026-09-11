/** Sheet names are shouted ("BIG AL'S 4 LIFE") and seasons are long ("Thursday Men's Early 2025-26"). */
export const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/'S\b/i, "'s");
export const shortSeason = (s: string) => s.replace(/^Thursday Men's Early /, "");
export const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".5", "½");
export const day = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
