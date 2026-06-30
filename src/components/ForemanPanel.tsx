// Foreman panel — the quote review supervisor's card in the Quote Workspace.
//
// Shows Foreman's verdict (READY / WARN / BLOCK), a plain-language summary, the
// blockers / warnings / advisories it found, and the single next best action.
// It is a REPORT only: Foreman never edits, sends or approves the quote. The
// export gate elsewhere reads `report.canExport` to hold export on BLOCK.

import { useState } from 'react'
import type { ForemanIssue, ForemanReport, ForemanStatus } from '../engine/foreman'
import { IconCheck, IconHard, IconWarning } from './icons'

const STATUS_STYLE: Record<ForemanStatus, { border: string; badge: string; bar: string; icon: string }> = {
  READY: { border: 'border-sage-500/40', badge: 'bg-sage-500/15 text-sage-400 border-sage-500/40', bar: 'bg-sage-500', icon: 'text-sage-400' },
  WARN: { border: 'border-amber/45', badge: 'bg-amber/15 text-amber border-amber/40', bar: 'bg-amber', icon: 'text-amber' },
  BLOCK: { border: 'border-danger/50', badge: 'bg-danger/15 text-danger border-danger/40', bar: 'bg-danger', icon: 'text-danger' },
}

const DOT: Record<ForemanIssue['severity'], string> = {
  block: 'bg-danger',
  warn: 'bg-amber',
  info: 'bg-slate-500',
}

export default function ForemanPanel({ report }: { report: ForemanReport }) {
  const s = STATUS_STYLE[report.status]
  const [openItem, setOpenItem] = useState<string | null>(null)

  return (
    <div className={`overflow-hidden rounded-2xl border ${s.border} bg-ink-600 shadow-card`}>
      <div className={`h-1 w-full ${s.bar}`} />
      <div className="p-4">
        {/* Header: FOREMAN REVIEW + verdict */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            <IconHard size={13} className={s.icon} /> Foreman review
          </div>
          <span className={`pill border ${s.badge}`}>
            {report.status === 'READY' ? <IconCheck size={11} /> : <IconWarning size={11} />}
            {report.status}
          </span>
        </div>

        {/* Plain-language verdict */}
        <div className="mb-3 rounded-xl border border-ink-400 bg-ink-700 p-3">
          <p className="text-sm font-medium leading-relaxed text-slate-100">{report.summary}</p>
        </div>

        {/* Issue list — blockers first, each expandable to detail + fix */}
        {report.issues.length > 0 ? (
          <>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {report.blockers.length > 0 ? 'Fix before sending' : 'Worth a look'}
              </span>
              <span className="text-[10px] text-slate-500">
                {report.blockers.length > 0 && `${report.blockers.length} block`}
                {report.blockers.length > 0 && report.warnings.length > 0 && ' · '}
                {report.warnings.length > 0 && `${report.warnings.length} warn`}
              </span>
            </div>
            <div className="space-y-1">
              {report.issues.map((it) => (
                <div key={it.id} className="overflow-hidden rounded-lg border border-ink-400 bg-ink-700">
                  <button onClick={() => setOpenItem(openItem === it.id ? null : it.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[it.severity]}`} />
                    <span className="flex-1 truncate text-sm text-slate-200">{it.title}</span>
                    <span className={`pill border text-[9px] ${it.severity === 'block' ? 'border-danger/40 text-danger' : it.severity === 'warn' ? 'border-amber/40 text-amber' : 'border-ink-300 text-slate-400'}`}>
                      {it.severity}
                    </span>
                    <span className={`shrink-0 text-slate-600 transition ${openItem === it.id ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {openItem === it.id && (
                    <div className="border-t border-ink-400 px-3 py-2.5 animate-fade-up">
                      <p className="text-xs leading-relaxed text-slate-400">{it.detail}</p>
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-300">
                        <IconWrenchHint />
                        <span><span className="font-semibold text-slate-200">Fix:</span> {it.fix}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-sage-500/30 bg-sage-500/[0.06] px-3.5 py-2.5 text-sm text-slate-200">
            <IconCheck size={16} className="text-sage-400" /> Nothing missing. Good to send.
          </div>
        )}

        {/* Next best action */}
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-ink-400 bg-ink-700 px-3.5 py-2.5">
          <span className={`mt-0.5 shrink-0 ${s.icon}`}>
            <IconHard size={15} />
          </span>
          <div className="text-xs leading-relaxed text-slate-300">
            <span className="font-semibold text-slate-200">Next:</span> {report.nextAction}
          </div>
        </div>

        {/* Honest scope note — Foreman flags, it never acts */}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
          Foreman reviews and flags. It never edits your quote, changes a rate, or sends anything — that's always your call.
        </p>
      </div>
    </div>
  )
}

function IconWrenchHint() {
  return <span className="mt-0.5 text-sage-500/80">→</span>
}
