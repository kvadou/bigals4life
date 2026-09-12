/** Bowling Bro' marks: the BA4L ball hooking into the rack. Direction A from docs/design/review/Logo.dc.html. */

/** App-tile mark: forest tile, faint lane, ball at the bottom hooking into five pins. */
export function BroMark({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
    <rect width="96" height="96" rx="22" fill="#2d5139"/>
    <g stroke="#ddf29a" strokeWidth="2" opacity="0.35" strokeLinecap="round"><line x1="30" y1="82" x2="40" y2="16"/><line x1="66" y1="82" x2="56" y2="16"/></g>
    <g fill="#f4efe6"><circle cx="48" cy="17" r="3.2"/><circle cx="41" cy="22" r="3.2"/><circle cx="55" cy="22" r="3.2"/><circle cx="34" cy="27" r="3.2"/><circle cx="62" cy="27" r="3.2"/></g>
    <path d="M 38 80 C 40 64, 44 52, 52 42 C 55 38, 52 34, 50 31" fill="none" stroke="#ddf29a" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="38" cy="78" r="9" fill="#ddf29a"/>
    <circle cx="35.5" cy="75.5" r="1.4" fill="#2d5139"/><circle cx="40.5" cy="75.5" r="1.4" fill="#2d5139"/><circle cx="38" cy="80" r="1.6" fill="#2d5139"/>
  </svg>;
}

/** Single-color glyph for nav and chips. */
export function BroGlyph({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
    <g fill={color}><circle cx="48" cy="17" r="7"/><circle cx="34" cy="27" r="7"/><circle cx="62" cy="27" r="7"/></g>
    <path d="M 38 80 C 40 64, 44 52, 52 42 C 55 38, 52 34, 50 31" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"/>
    <circle cx="38" cy="78" r="13" fill={color}/>
  </svg>;
}

/** The chenille patch, type on the curve. For the review header and empty states. */
export function BroPatch({ size = 120 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 240 240" role="img" aria-label="Bowling Bro'">
    <defs><path id="bro-patch-bottom" d="M 40 120 A 80 80 0 0 0 200 120"/><path id="bro-patch-top" d="M 46 120 A 74 74 0 0 1 194 120"/></defs>
    <circle cx="120" cy="120" r="114" fill="#ddf29a" stroke="#f4efe6" strokeWidth="6" strokeDasharray="3 5"/>
    <circle cx="120" cy="120" r="102" fill="none" stroke="#2d5139" strokeWidth="3"/>
    <text fontFamily="DM Sans, sans-serif" fontSize="10" fontWeight="700" fill="#2d5139" letterSpacing="3"><textPath href="#bro-patch-top" startOffset="50%" textAnchor="middle">BIG AL’S · EST. 2026</textPath></text>
    <g fill="#2d5139"><circle cx="120" cy="66" r="6"/><circle cx="108" cy="75" r="6"/><circle cx="132" cy="75" r="6"/><circle cx="96" cy="84" r="6"/><circle cx="144" cy="84" r="6"/></g>
    <path d="M 92 150 C 94 132, 100 118, 112 106 C 118 100, 118 94, 117 88" fill="none" stroke="#2d5139" strokeWidth="6" strokeLinecap="round"/>
    <circle cx="92" cy="148" r="18" fill="#2d5139"/>
    <circle cx="87" cy="143" r="3" fill="#ddf29a"/><circle cx="97" cy="143" r="3" fill="#ddf29a"/><circle cx="92" cy="152" r="3.4" fill="#ddf29a"/>
    <text fontFamily="'Alfa Slab One', 'Space Grotesk', sans-serif" fontSize="19" fill="#2d5139" letterSpacing="2"><textPath href="#bro-patch-bottom" startOffset="50%" textAnchor="middle">BOWLING BRO’</textPath></text>
  </svg>;
}

/** Horizontal lockup with the endorsement line. Needs about 200px; use BroGlyph below that. */
export function BroLockup() {
  return <span className="bro-lockup" aria-label="Bowling Bro', a BA4L thing">
    <BroGlyph size={18} color="#2d5139"/>
    <span className="bro-lockup-name">Bowling Bro’</span>
    <span className="bro-lockup-tag">A BA4L THING</span>
  </span>;
}
