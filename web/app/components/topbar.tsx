import { CircleDot } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BroGlyph } from "./bro-mark";

/** Team-first header: brand, then Season and Standings, then whatever the page adds (account, actions). */
export function Topbar({ right }: { right?: ReactNode }) {
  return <header className="topbar">
    <Link className="brand" href="/" aria-label="Big Al's 4 Life home"><span className="brand-icon"><CircleDot size={23}/></span>BA4L</Link>
    <nav className="topbar-right" aria-label="Sections">
      <Link className="league-tag" href="/season"><span/> SEASON</Link>
      <Link className="league-tag" href="/league"><span/> STANDINGS</Link>
      <Link className="league-tag" href="/records"><span/> RECORDS</Link>
      <Link className="league-tag bro" href="/review"><span/><BroGlyph size={13} color="#2d5139"/> BRO’</Link>
      {right}
    </nav>
  </header>;
}
