"use client";

import { CircleDot, Menu, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { BroGlyph } from "./bro-mark";

/** A single set of section and account controls, disclosed when space is tight. */
export function Topbar({ right }: { right?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  return <header className="topbar" onKeyDown={event => {
    // An account dialog owns Escape while it is open.
    if (event.key === "Escape" && open && !(event.target as HTMLElement).closest("dialog")) {
      setOpen(false); toggle.current?.focus();
    }
  }}>
    <Link className="brand" href="/" aria-label="Big Al's 4 Life home"><span className="brand-icon"><CircleDot size={23}/></span>BA4L</Link>
    <button ref={toggle} type="button" className="nav-toggle" aria-expanded={open} aria-controls={navigationId} onClick={() => setOpen(value => !value)}>
      {open ? <X size={19} aria-hidden="true"/> : <Menu size={19} aria-hidden="true"/>}{open ? "Close" : "Menu"}
    </button>
    <nav id={navigationId} className="topbar-right" data-open={open} aria-label="Sections" onClick={event => {
      // Account actions can open a modal on desktop before the viewport narrows.
      const target = event.target as HTMLElement;
      if (target.closest("button") && !target.closest("dialog")) setOpen(true);
    }}>
      <Link className="league-tag" href="/season" onClick={() => setOpen(false)}><span/> SEASON</Link>
      <Link className="league-tag" href="/league" onClick={() => setOpen(false)}><span/> STANDINGS</Link>
      <Link className="league-tag" href="/records" onClick={() => setOpen(false)}><span/> RECORDS</Link>
      <Link className="league-tag bro" href="/review" onClick={() => setOpen(false)}><span/><BroGlyph size={13} color="#2d5139"/> BRO’</Link>
      {right}
    </nav>
  </header>;
}
