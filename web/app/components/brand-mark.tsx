export function BrandMark({ size = 36 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
    <g fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" textAnchor="middle">
      <text x="512" y="420" fill="currentColor" fontSize="414" letterSpacing="4">BA</text>
      <text x="512" y="835" fill="var(--brand-mark-accent, currentColor)" fontSize="414" letterSpacing="4">4L</text>
    </g>
  </svg>;
}
