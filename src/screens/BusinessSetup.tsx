// Business Setup — the wizard where a contractor configures the commercial
// source of truth: labour, plant, materials, subbies and billing rules.
// Doubles as the ongoing profile editor once configured. Saves project into
// the engine rate book that every quote consumes.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import {
  PLANT_UNIT_OPTIONS,
  SUBBIE_CATEGORIES,
  SUBBIE_UNIT_OPTIONS,
  TRAVEL_OPTIONS,
  UNIT_OPTIONS,
  businessCompleteness,
  type LabourRole,
  type MaterialItem,
  type PlantItem,
  type SubcontractorItem,
} from '../engine/business'
import { IconArrow, IconBack, IconCheck, IconCube, IconHard, IconPlant, IconReceipt, IconUsers } from '../components/icons'
import { Progress } from '../components/ui'
import { aud, uid } from '../lib/format'

type StepKey = 'labour' | 'plant' | 'materials' | 'subbies' | 'billing'
const STEPS: { key: StepKey; label: string; icon: typeof IconHard }[] = [
  { key: 'labour', label: 'Labour', icon: IconHard },
  { key: 'plant', label: 'Plant', icon: IconPlant },
  { key: 'materials', label: 'Materials', icon: IconCube },
  { key: 'subbies', label: 'Subbies', icon: IconUsers },
  { key: 'billing', label: 'Billing', icon: IconReceipt },
]

export default function BusinessSetup() {
  const navigate = useNavigate()
  const business = useStore((s) => s.business)
  const updateBusiness = useStore((s) => s.updateBusiness)
  const [stepIdx, setStepIdx] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  const step = STEPS[stepIdx]
  const isFirstRun = !business.configured
  const completeness = businessCompleteness(business)
  const isLast = stepIdx === STEPS.length - 1

  // List helpers (immutable).
  const setLabour = (labourRoles: LabourRole[]) => updateBusiness({ labourRoles })
  const setPlant = (plant: PlantItem[]) => updateBusiness({ plant })
  const setMaterials = (materials: MaterialItem[]) => updateBusiness({ materials })
  const setSubbies = (subcontractors: SubcontractorItem[]) => updateBusiness({ subcontractors })

  const next = () => {
    if (isLast) {
      updateBusiness({ configured: true })
      navigate('/')
    } else {
      setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))
      setOpenId(null)
    }
  }

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-ink-400 bg-ink-900/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-4 lg:px-4">
        <div className="flex items-center gap-2 py-2">
          <button onClick={() => navigate('/')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-500 text-slate-300">
            <IconBack size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-slate-100">{isFirstRun ? 'Business setup' : 'Business profile'}</div>
            <div className="truncate text-[11px] text-slate-500">
              {isFirstRun ? 'Your commercial source of truth — drives every quote' : `Configured · ${completeness.pct}% complete`}
            </div>
          </div>
          {isFirstRun ? (
            <button onClick={() => navigate('/')} className="text-[11px] font-semibold text-slate-500 hover:text-slate-300">
              Skip for now →
            </button>
          ) : (
            <span className="pill border border-sage-500/30 bg-sage-500/10 text-sage-400">
              <IconCheck size={11} /> Live
            </span>
          )}
        </div>

        {/* Advanced: low-level engine rate book (kept out of primary nav) */}
        {!isFirstRun && (
          <div className="flex justify-end pb-1.5">
            <button onClick={() => navigate('/pricing')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-sage-400">
              Advanced · Rate book <IconArrow size={12} />
            </button>
          </div>
        )}

        {/* Step rail */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const active = i === stepIdx
            const done = i < stepIdx || !isFirstRun
            return (
              <button
                key={s.key}
                onClick={() => {
                  setStepIdx(i)
                  setOpenId(null)
                }}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-semibold transition ${
                  active ? 'bg-sage-500/15 text-sage-400' : done ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                <Icon size={16} />
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Section intro */}
      <div className="mb-3 flex items-center gap-2.5 px-1">
        <step.icon size={18} className="text-sage-400" />
        <div>
          <h2 className="text-sm font-bold text-slate-100">{SECTION_TITLE[step.key]}</h2>
          <p className="text-[11px] text-slate-500">{SECTION_HINT[step.key]}</p>
        </div>
      </div>

      {/* Active section */}
      {step.key === 'labour' && (
        <ListEditor
          items={business.labourRoles}
          openId={openId}
          setOpenId={setOpenId}
          title={(r) => r.name || 'New role'}
          subtitle={(r) => `cost ${aud(r.costPerHour)}/h · charge ${aud(r.chargePerHour)}/h`}
          onAdd={() => {
            const item: LabourRole = { id: uid('lr_'), name: '', costPerHour: 45, chargePerHour: 80, overtimeMultiplier: 1.5, weekendMultiplier: 2, minBillableHours: 4 }
            setLabour([...business.labourRoles, item])
            setOpenId(item.id)
          }}
          onRemove={(id) => setLabour(business.labourRoles.filter((x) => x.id !== id))}
          addLabel="Add labour role"
          render={(r) => {
            const up = (patch: Partial<LabourRole>) => setLabour(business.labourRoles.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
            return (
              <div className="grid grid-cols-2 gap-2.5">
                <Txt label="Role" value={r.name} onChange={(v) => up({ name: v })} placeholder="e.g. Concreter" full />
                <Money label="Cost / hr" value={r.costPerHour} onChange={(v) => up({ costPerHour: v })} />
                <Money label="Charge / hr" value={r.chargePerHour} onChange={(v) => up({ chargePerHour: v })} />
                <Num label="Overtime ×" value={r.overtimeMultiplier} onChange={(v) => up({ overtimeMultiplier: v })} step={0.1} />
                <Num label="Weekend ×" value={r.weekendMultiplier} onChange={(v) => up({ weekendMultiplier: v })} step={0.1} />
                <Num label="Min billable hrs" value={r.minBillableHours} onChange={(v) => up({ minBillableHours: v })} />
                <Margin cost={r.costPerHour} charge={r.chargePerHour} />
              </div>
            )
          }}
        />
      )}

      {step.key === 'plant' && (
        <ListEditor
          items={business.plant}
          openId={openId}
          setOpenId={setOpenId}
          title={(p) => p.name || 'New machine'}
          subtitle={(p) => `charge ${aud(p.chargePerHour)}/h · ${p.productivityDefault} ${p.productivityUnit}`}
          onAdd={() => {
            const item: PlantItem = { id: uid('pl_'), name: '', operatingCostPerHour: 40, chargePerHour: 150, floatCost: 250, attachments: [], productivityDefault: 8, productivityUnit: 'm³/hr' }
            setPlant([...business.plant, item])
            setOpenId(item.id)
          }}
          onRemove={(id) => setPlant(business.plant.filter((x) => x.id !== id))}
          addLabel="Add machine"
          render={(p) => {
            const up = (patch: Partial<PlantItem>) => setPlant(business.plant.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
            return (
              <div className="grid grid-cols-2 gap-2.5">
                <Txt label="Machine" value={p.name} onChange={(v) => up({ name: v })} placeholder="e.g. 5T Excavator" full />
                <Money label="Operating cost / hr" value={p.operatingCostPerHour} onChange={(v) => up({ operatingCostPerHour: v })} />
                <Money label="Charge / hr" value={p.chargePerHour} onChange={(v) => up({ chargePerHour: v })} />
                <Money label="Float (on/off)" value={p.floatCost} onChange={(v) => up({ floatCost: v })} />
                <div className="grid grid-cols-2 gap-2.5">
                  <Num label="Productivity" value={p.productivityDefault} onChange={(v) => up({ productivityDefault: v })} />
                  <Sel label="Unit" value={p.productivityUnit} onChange={(v) => up({ productivityUnit: v })} options={[...PLANT_UNIT_OPTIONS]} />
                </div>
                <Txt label="Attachments (comma-sep)" value={p.attachments.join(', ')} onChange={(v) => up({ attachments: v.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Rock breaker, Auger" full />
              </div>
            )
          }}
        />
      )}

      {step.key === 'materials' && (
        <ListEditor
          items={business.materials}
          openId={openId}
          setOpenId={setOpenId}
          title={(m) => m.name || 'New material'}
          subtitle={(m) => `${aud(m.costRate)}/${m.unit} · +${m.wastePct}% waste`}
          onAdd={() => {
            const item: MaterialItem = { id: uid('mt_'), name: '', defaultSupplier: '', costRate: 0, unit: 'm³', wastePct: 10, regionalPricing: [] }
            setMaterials([...business.materials, item])
            setOpenId(item.id)
          }}
          onRemove={(id) => setMaterials(business.materials.filter((x) => x.id !== id))}
          addLabel="Add material"
          render={(m) => {
            const up = (patch: Partial<MaterialItem>) => setMaterials(business.materials.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))
            return (
              <div className="grid grid-cols-2 gap-2.5">
                <Txt label="Material" value={m.name} onChange={(v) => up({ name: v })} placeholder="e.g. Concrete 25MPa" full />
                <Txt label="Default supplier" value={m.defaultSupplier} onChange={(v) => up({ defaultSupplier: v })} placeholder="Batch plant" full />
                <Money label="Cost rate" value={m.costRate} onChange={(v) => up({ costRate: v })} />
                <Sel label="Unit" value={m.unit} onChange={(v) => up({ unit: v })} options={[...UNIT_OPTIONS]} />
                <Num label="Waste %" value={m.wastePct} onChange={(v) => up({ wastePct: v })} suffix="%" />
                {/* Regional pricing */}
                <div className="col-span-2">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Regional pricing</label>
                    <button
                      onClick={() => up({ regionalPricing: [...m.regionalPricing, { region: '', costRate: m.costRate }] })}
                      className="text-[11px] font-semibold text-sage-400"
                    >
                      + region
                    </button>
                  </div>
                  {m.regionalPricing.length === 0 ? (
                    <p className="text-[11px] text-slate-600">Base rate applies everywhere. Add a region to override (e.g. remote freight).</p>
                  ) : (
                    <div className="space-y-1.5">
                      {m.regionalPricing.map((rp, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            className="input !py-1.5 flex-1 text-sm"
                            placeholder="Region / town"
                            value={rp.region}
                            onChange={(e) => up({ regionalPricing: m.regionalPricing.map((x, j) => (j === i ? { ...x, region: e.target.value } : x)) })}
                          />
                          <div className="flex w-24 items-center rounded-lg border border-ink-400 bg-ink-500 px-2">
                            <span className="text-slate-500">$</span>
                            <input
                              type="number"
                              className="w-full bg-transparent px-1 py-1.5 text-right text-sm font-mono text-slate-100 outline-none"
                              value={rp.costRate || ''}
                              onChange={(e) => up({ regionalPricing: m.regionalPricing.map((x, j) => (j === i ? { ...x, costRate: parseFloat(e.target.value) || 0 } : x)) })}
                            />
                          </div>
                          <button onClick={() => up({ regionalPricing: m.regionalPricing.filter((_, j) => j !== i) })} className="px-1 text-slate-600 hover:text-danger">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          }}
        />
      )}

      {step.key === 'subbies' && (
        <ListEditor
          items={business.subcontractors}
          openId={openId}
          setOpenId={setOpenId}
          title={(s) => s.name || 'New subcontractor'}
          subtitle={(s) => `${SUBBIE_CATEGORIES.find((c) => c.key === s.category)?.label} · ${aud(s.rate)}/${s.unit}`}
          onAdd={() => {
            const item: SubcontractorItem = { id: uid('sc_'), name: '', category: 'other', rate: 0, unit: 'day', notes: '' }
            setSubbies([...business.subcontractors, item])
            setOpenId(item.id)
          }}
          onRemove={(id) => setSubbies(business.subcontractors.filter((x) => x.id !== id))}
          addLabel="Add subcontractor"
          render={(s) => {
            const up = (patch: Partial<SubcontractorItem>) => setSubbies(business.subcontractors.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
            return (
              <div className="grid grid-cols-2 gap-2.5">
                <Txt label="Name" value={s.name} onChange={(v) => up({ name: v })} placeholder="e.g. ABC Pumping" full />
                <Sel label="Category" value={s.category} onChange={(v) => up({ category: v as SubcontractorItem['category'] })} options={SUBBIE_CATEGORIES.map((c) => c.key)} labels={Object.fromEntries(SUBBIE_CATEGORIES.map((c) => [c.key, c.label]))} />
                <div className="grid grid-cols-2 gap-2.5">
                  <Money label="Rate" value={s.rate} onChange={(v) => up({ rate: v })} />
                  <Sel label="Unit" value={s.unit} onChange={(v) => up({ unit: v })} options={[...SUBBIE_UNIT_OPTIONS]} />
                </div>
                <Txt label="Notes" value={s.notes} onChange={(v) => up({ notes: v })} placeholder="Min charge, lead time…" full />
              </div>
            )
          }}
        />
      )}

      {step.key === 'billing' && <BillingEditor />}

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-ink-400 bg-ink-800/95 px-3 py-2.5 backdrop-blur lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>Step {stepIdx + 1} of {STEPS.length}</span>
              <span>{step.label}</span>
            </div>
            <Progress value={((stepIdx + (isLast ? 1 : 0)) / STEPS.length) * 100 + (isLast ? 0 : 0)} />
          </div>
          {stepIdx > 0 && (
            <button onClick={() => setStepIdx((i) => i - 1)} className="btn-ghost !py-2.5 text-xs">
              Back
            </button>
          )}
          <button onClick={next} className="btn-primary !py-2.5 text-xs">
            {isLast ? (isFirstRun ? 'Finish setup' : 'Save') : 'Next'}
            {isLast ? <IconCheck size={16} /> : <IconArrow size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

const SECTION_TITLE: Record<StepKey, string> = {
  labour: 'Labour rates',
  plant: 'Plant & equipment',
  materials: 'Materials',
  subbies: 'Subcontractors',
  billing: 'Billing rules',
}
const SECTION_HINT: Record<StepKey, string> = {
  labour: 'Roles, cost vs charge, overtime & weekend loadings, minimum billable hours.',
  plant: 'Machines, operating cost vs charge-out, float, attachments & productivity.',
  materials: 'Cost rates, suppliers, waste % and regional price overrides.',
  subbies: 'Cartage, pumps, traffic control, skips and other subbies.',
  billing: 'Call-out, day rates, travel, fuel surcharge and weekend/holiday rules.',
}

/* ─────────────── Billing editor ─────────────── */
function BillingEditor() {
  const billing = useStore((s) => s.business.billing)
  const updateBusiness = useStore((s) => s.updateBusiness)
  const up = (patch: Partial<typeof billing>) => updateBusiness({ billing: { ...billing, ...patch } })
  return (
    <div className="card p-4">
      <div className="grid grid-cols-2 gap-2.5">
        <Money label="Minimum call-out" value={billing.minCallOut} onChange={(v) => up({ minCallOut: v })} />
        <Money label="Half-day rate" value={billing.halfDayRate} onChange={(v) => up({ halfDayRate: v })} />
        <Money label="Full-day rate" value={billing.fullDayRate} onChange={(v) => up({ fullDayRate: v })} />
        <Num label="Fuel surcharge" value={billing.fuelSurchargePct} onChange={(v) => up({ fuelSurchargePct: v })} suffix="%" />
        <Sel label="Travel charging" value={billing.travelCharging} onChange={(v) => up({ travelCharging: v as typeof billing.travelCharging })} options={TRAVEL_OPTIONS.map((t) => t.key)} labels={Object.fromEntries(TRAVEL_OPTIONS.map((t) => [t.key, t.label]))} />
        <Num label={billing.travelCharging === 'per-km' ? 'Travel $/km' : billing.travelCharging === 'per-hour' ? 'Travel $/hr' : 'Travel flat $'} value={billing.travelRate} onChange={(v) => up({ travelRate: v })} step={0.05} disabled={billing.travelCharging === 'none'} />
        <Num label="Weekend ×" value={billing.weekendMultiplier} onChange={(v) => up({ weekendMultiplier: v })} step={0.1} />
        <Num label="Public holiday ×" value={billing.publicHolidayMultiplier} onChange={(v) => up({ publicHolidayMultiplier: v })} step={0.1} />
      </div>
    </div>
  )
}

/* ─────────────── Generic list editor ─────────────── */
function ListEditor<T extends { id: string }>({
  items,
  openId,
  setOpenId,
  title,
  subtitle,
  render,
  onAdd,
  onRemove,
  addLabel,
}: {
  items: T[]
  openId: string | null
  setOpenId: (id: string | null) => void
  title: (item: T) => string
  subtitle: (item: T) => string
  render: (item: T) => React.ReactNode
  onAdd: () => void
  onRemove: (id: string) => void
  addLabel: string
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const open = openId === item.id
        return (
          <div key={item.id} className="card-flat overflow-hidden">
            <div className="flex items-center">
              <button onClick={() => setOpenId(open ? null : item.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-3 text-left">
                <span className={`text-slate-500 transition ${open ? 'rotate-90' : ''}`}>›</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-100">{title(item)}</span>
                  <span className="block truncate text-[11px] text-slate-500">{subtitle(item)}</span>
                </span>
              </button>
              <button onClick={() => onRemove(item.id)} className="px-3 text-slate-600 hover:text-danger" aria-label="Remove">
                ✕
              </button>
            </div>
            {open && <div className="border-t border-ink-400 p-3.5 animate-fade-up">{render(item)}</div>}
          </div>
        )
      })}
      <button onClick={onAdd} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-300 bg-ink-700/60 py-2.5 text-xs font-semibold text-slate-400 hover:border-sage-500 hover:text-sage-400">
        + {addLabel}
      </button>
    </div>
  )
}

/* ─────────────── Field primitives ─────────────── */
function FieldShell({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  )
}
function Txt({ label, value, onChange, placeholder, full }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; full?: boolean }) {
  return (
    <FieldShell label={label} full={full}>
      <input className="input !py-2 text-sm" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </FieldShell>
  )
}
function Num({ label, value, onChange, suffix, step, disabled }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number; disabled?: boolean }) {
  return (
    <FieldShell label={label}>
      <div className={`flex items-center rounded-xl border border-ink-400 bg-ink-500 px-2.5 ${disabled ? 'opacity-50' : 'focus-within:border-sage-500'}`}>
        <input type="number" step={step} disabled={disabled} className="w-full bg-transparent py-2 text-sm font-mono tabular-nums text-slate-100 outline-none" value={value || ''} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
      </div>
    </FieldShell>
  )
}
function Money({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <FieldShell label={label}>
      <div className="flex items-center rounded-xl border border-ink-400 bg-ink-500 px-2.5 focus-within:border-sage-500">
        <span className="text-slate-500">$</span>
        <input type="number" className="w-full bg-transparent px-1.5 py-2 text-sm font-mono tabular-nums text-slate-100 outline-none" value={value || ''} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
      </div>
    </FieldShell>
  )
}
function Sel({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <FieldShell label={label}>
      <select className="input !py-2 appearance-none text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>{labels?.[o] ?? o}</option>
        ))}
      </select>
    </FieldShell>
  )
}
function Margin({ cost, charge }: { cost: number; charge: number }) {
  const m = charge > 0 ? Math.round(((charge - cost) / charge) * 100) : 0
  return (
    <div className="col-span-2 flex items-center justify-between rounded-lg border border-ink-400 bg-ink-700 px-3 py-1.5 text-xs">
      <span className="text-slate-500">Margin on this role</span>
      <span className={`stat-num font-bold ${m >= 30 ? 'text-sage-400' : m >= 15 ? 'text-amber' : 'text-danger'}`}>{m}%</span>
    </div>
  )
}
