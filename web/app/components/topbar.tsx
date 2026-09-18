"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "./brand-mark";

/** A single set of section and account controls, disclosed when space is tight. */
export function Topbar({ right }: { right?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navigationId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  return <header className="topbar" onKeyDown={event => {
    // An account dialog owns Escape while it is open.
    if (event.key === "Escape" && open && !(event.target as HTMLElement).closest("dialog")) {
      setOpen(false); toggle.current?.focus();
    }
  }}>
    <Link className="brand" href="/" aria-label="Big Al's 4 Life home"><span className="brand-icon"><BrandMark size={36}/></span>BA4L</Link>
    <button ref={toggle} type="button" className="nav-toggle" aria-expanded={open} aria-controls={navigationId} onClick={() => setOpen(value => !value)}>
      {open ? <X size={19} aria-hidden="true"/> : <Menu size={19} aria-hidden="true"/>}{open ? "Close" : "Menu"}
    </button>
    <nav id={navigationId} className="topbar-right command-shell" data-open={open} aria-label="Sections" onClick={event => {
      // Account actions can open a modal on desktop before the viewport narrows.
      const target = event.target as HTMLElement;
      if (target.closest("button") && !target.closest("dialog")) setOpen(true);
    }}>
      <div className="command-links">
        <Link className={pathname === "/" ? "active" : ""} href="/" onClick={() => setOpen(false)}>Tonight</Link>
        <Link className={pathname.startsWith("/night") ? "active" : ""} href="/night?latest=1" onClick={() => setOpen(false)}>Score</Link>
        <Link className={pathname.startsWith("/league") || pathname.startsWith("/records") ? "active" : ""} href="/league" onClick={() => setOpen(false)}>League</Link>
        <Link className={pathname.startsWith("/review") ? "active" : ""} href="/review" onClick={() => setOpen(false)}>Review</Link>
      </div>
      <Link className={`command-live ${pathname.startsWith("/studio") ? "active" : ""}`} href="/studio" onClick={() => setOpen(false)}><span/> Live Lane</Link>
      <div className="command-account">{right}</div>
    </nav>
  </header>;
}
