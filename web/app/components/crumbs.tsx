import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export type Crumb = { label: string; href?: string };
/** Season › Week 1 › Game 2. The last item is the current page; the one before it is the "back" target. */
export function Crumbs({ items }: { items: Crumb[] }) {
  const back = [...items].reverse().find((c, i) => i > 0 && c.href);
  return <nav className="crumbs" aria-label="Breadcrumb">
    {back && <Link className="crumb-back" href={back.href!} aria-label={`Back to ${back.label}`}><ChevronLeft size={16}/></Link>}
    {items.map((c, i) => <span key={i} className="crumb">{i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}{c.href && i < items.length - 1 ? <Link href={c.href}>{c.label}</Link> : <strong aria-current="page">{c.label}</strong>}</span>)}
  </nav>;
}
