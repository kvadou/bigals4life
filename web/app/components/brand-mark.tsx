export function BrandMark({ size = 36 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
    <path fill="currentColor" fillRule="evenodd" d="M575 150H735L700 505H805L790 630H686L666 758H521L543 630H298L315 508ZM562 334L424 505H564Z"/>
    <path fill="currentColor" d="M246 725C259 809 406 834 517 758L599 827C437 972 185 907 150 770Z"/>
    <circle cx="213" cy="704" r="65" fill="currentColor"/>
    <g fill="var(--brand-mark-background, #203B2F)"><circle cx="188" cy="680" r="10"/><circle cx="221" cy="672" r="10"/><circle cx="213" cy="710" r="12"/></g>
  </svg>;
}
