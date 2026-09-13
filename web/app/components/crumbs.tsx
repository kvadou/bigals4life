"use client";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense, type ComponentProps } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { contextCrumbs, withOrigin, type NavigationCrumb } from "@/lib/navigation";

export type Crumb = NavigationCrumb;
function CrumbList({ items }: { items: Crumb[] }) {
  const back = [...items].reverse().find((c, i) => i > 0 && c.href);
  return <nav className="crumbs" aria-label="Breadcrumb">
    {back && <Link className="crumb-back" href={back.href!} aria-label={`Back to ${back.label}`}><ChevronLeft size={16}/></Link>}
    {items.map((c, i) => <span key={i} className="crumb">{i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}{c.href && i < items.length - 1 ? <Link href={c.href}>{c.label}</Link> : <strong aria-current="page">{c.label}</strong>}</span>)}
  </nav>;
}
function ContextCrumbs({ items }: { items: Crumb[] }) {
  const path = usePathname(), search = useSearchParams();
  return <CrumbList items={contextCrumbs(items, `${path}?${search}`)}/>;
}
export function Crumbs({ items }: { items: Crumb[] }) {
  return <Suspense fallback={<CrumbList items={items}/>}><ContextCrumbs items={items}/></Suspense>;
}
type LinkProps = ComponentProps<typeof Link>;
function ContextLink(props: LinkProps) {
  const path = usePathname(), search = useSearchParams();
  const href = typeof props.href === 'string' ? withOrigin(props.href, `${path}?${search}`) : props.href;
  return <Link {...props} href={href}/>;
}
/** Explicit URL context survives reloads, new tabs and browser back without tracking history. */
export function OriginLink(props: LinkProps) {
  return <Suspense fallback={<Link {...props}/>}><ContextLink {...props}/></Suspense>;
}
