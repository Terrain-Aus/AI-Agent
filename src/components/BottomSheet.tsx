// Slide-up bottom sheet on mobile, centered modal on desktop.
// Used for the Apprentice drawer and compact edit forms — keeps the
// workflow on one screen instead of navigating to full pages.

import { useEffect, type ReactNode } from 'react'

export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const heights: Record<string, string> = {
    sm: 'max-h-[55vh]',
    md: 'max-h-[80vh]',
    lg: 'max-h-[90vh]',
    full: 'h-[94vh]',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-up" onClick={onClose} />
      <div
        className={`relative flex w-full flex-col overflow-hidden border-ink-400 bg-ink-700 shadow-card
          ${heights[size]}
          rounded-t-3xl border-x border-t
          sm:max-w-lg sm:rounded-3xl sm:border
          animate-[fade-up_0.2s_ease-out]`}
        style={{ animation: 'sheet-up 0.26s cubic-bezier(0.22,1,0.36,1)' }}
      >
        {/* Grab handle (mobile) */}
        <div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-ink-300" />
        </div>

        {(title || subtitle) && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-3">
            <div className="min-w-0">
              {title && <div className="truncate text-base font-bold text-slate-100">{title}</div>}
              {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
            </div>
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-500 text-slate-400 hover:text-slate-100" aria-label="Close">
              ✕
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>

        {footer && <div className="shrink-0 border-t border-ink-400 bg-ink-700 p-3">{footer}</div>}
      </div>
    </div>
  )
}
