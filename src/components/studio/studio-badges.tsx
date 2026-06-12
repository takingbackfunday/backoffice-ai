import { STATUS_COLORS, STATUS_LABELS } from '@/components/studio/studio-shared'

/* ------------------------------------------------------------------ */
/*  StatusBadge                                                         */
/* ------------------------------------------------------------------ */

export function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.DRAFT
  return (
    <span style={{ background: c.bg, color: c.text, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  KpiCard                                                             */
/* ------------------------------------------------------------------ */

export function KpiCard({ label, value, sub, color, onClick, active }: { label: string; value: string | number; sub?: string; color: 'green' | 'amber' | 'red' | 'neutral'; onClick?: () => void; active?: boolean }) {
  const colors = {
    green:   { border: '#bbf7d0', bg: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', text: '#15803d' },
    amber:   { border: '#fde68a', bg: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)', text: '#a16207' },
    red:     { border: '#fecaca', bg: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)', text: '#dc2626' },
    neutral: { border: '#e8e6df', bg: '#fafaf8', text: '#1a1a1a' },
  }
  const c = colors[color]
  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 10, border: `1.5px solid ${active ? c.text : c.border}`, background: c.bg, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.15s, box-shadow 0.15s', boxShadow: active ? `0 0 0 3px ${c.text}18` : 'none' }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = c.text }}
      onMouseLeave={e => { if (onClick && !active) (e.currentTarget as HTMLDivElement).style.borderColor = c.border }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, color: '#888', margin: 0, lineHeight: 1.3 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1, margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>{sub}</p>}
        {onClick && <span style={{ marginLeft: 'auto', fontSize: 10, color: c.text, opacity: 0.6 }}>↓</span>}
      </div>
    </div>
  )
}
