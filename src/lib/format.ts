// Formatting helpers used across the UI.

export const aud = (n: number, withCents = false): string =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(isFinite(n) ? n : 0)

export const num = (n: number, dp = 0): string =>
  new Intl.NumberFormat('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)

export const pct = (n: number): string => `${Math.round(n)}%`

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
