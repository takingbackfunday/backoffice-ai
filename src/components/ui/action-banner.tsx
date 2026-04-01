'use client'

interface ActionBannerProps {
  icon: string
  label: string
  detail: string
  color: 'red' | 'amber' | 'blue' | 'green'
  onClick: () => void
  cta?: string
}

export function ActionBanner({ icon, label, detail, color, onClick, cta = 'View →' }: ActionBannerProps) {
  const colors = {
    red:   { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444' },
    amber: { bg: '#fffbeb', border: '#fde68a', icon: '#f59e0b' },
    blue:  { bg: '#eff6ff', border: '#bfdbfe', icon: '#3b82f6' },
    green: { bg: '#f0fdf4', border: '#bbf7d0', icon: '#16a34a' },
  }
  const c = colors[color]
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, border: `1px solid ${c.border}`, background: c.bg, padding: '12px 14px', width: '100%', cursor: 'pointer', textAlign: 'left' }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${c.icon}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.icon, fontSize: 16, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: c.icon, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, opacity: 0.7, color: c.icon, margin: 0 }}>{detail}</p>
      </div>
      <span style={{ fontSize: 11, color: c.icon, opacity: 0.5 }}>{cta}</span>
    </button>
  )
}
