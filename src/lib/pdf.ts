// PDF generation for quotes and invoices using jsPDF.
// Produces a clean, branded, trade-ready document entirely client-side.

import { jsPDF } from 'jspdf'
import type { Quote } from '../engine/types'
import type { CompanyProfile } from '../store/useStore'
import { JOB_TYPE_LABELS, FINISH_LABELS } from '../engine/pricing'

const SAGE: [number, number, number] = [88, 135, 87]
const INK: [number, number, number] = [20, 24, 28]
const GREY: [number, number, number] = [110, 120, 130]

type DocKind = 'quote' | 'invoice'

export function generateDocument(quote: Quote, profile: CompanyProfile, kind: DocKind = 'quote'): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 16
  let y = 18

  const est = quote.estimate

  // ---- Header band ----
  doc.setFillColor(...INK)
  doc.rect(0, 0, W, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(profile.businessName || 'TerrainPro', M, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(180, 190, 195)
  doc.text(
    [`ABN ${profile.abn}`, profile.phone, profile.email].filter(Boolean).join('  ·  '),
    M,
    23,
  )
  if (profile.licence) doc.text(profile.licence, M, 28)

  doc.setTextColor(...SAGE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(kind === 'invoice' ? 'TAX INVOICE' : 'QUOTE', W - M, 18, { align: 'right' })
  doc.setTextColor(180, 190, 195)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`#${quote.id.slice(-6).toUpperCase()}`, W - M, 24, { align: 'right' })
  doc.text(new Date().toLocaleDateString('en-AU'), W - M, 29, { align: 'right' })

  y = 44
  doc.setTextColor(...INK)

  // ---- Client + job summary ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('PREPARED FOR', M, y)
  doc.text('JOB', W / 2, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GREY)
  doc.text(quote.client || 'Valued client', M, y + 6)
  const jobLine = `${quote.spec.area}m² ${JOB_TYPE_LABELS[quote.spec.jobType]}`
  doc.text(jobLine, W / 2, y + 6)
  doc.text(`${FINISH_LABELS[quote.spec.finish]} · ${quote.spec.location || '—'}`, W / 2, y + 11)

  y += 20
  doc.setDrawColor(225, 228, 230)
  doc.line(M, y, W - M, y)
  y += 8

  // ---- Line items by category ----
  doc.setTextColor(...INK)
  if (est) {
    for (const cat of est.categories) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...SAGE)
      doc.text(cat.title.toUpperCase(), M, y)
      doc.setTextColor(...INK)
      doc.text(money(cat.subtotal), W - M, y, { align: 'right' })
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...GREY)
      for (const item of cat.items) {
        if (y > 250) {
          doc.addPage()
          y = 20
        }
        doc.text(`${item.label} — ${item.qty} ${item.unit} @ ${money(item.rate)}`, M + 2, y)
        doc.text(money(item.total), W - M, y, { align: 'right' })
        y += 4.5
      }
      y += 3
    }

    // ---- Totals ----
    if (y > 235) {
      doc.addPage()
      y = 20
    }
    y += 2
    doc.setDrawColor(225, 228, 230)
    doc.line(W / 2, y, W - M, y)
    y += 6
    const totalRow = (label: string, value: string, bold = false, color = INK) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(bold ? 11 : 9.5)
      doc.setTextColor(...color)
      doc.text(label, W / 2, y)
      doc.text(value, W - M, y, { align: 'right' })
      y += bold ? 7 : 5.5
    }
    totalRow('Build cost', money(est.baseCost))
    if (est.contingency > 0) totalRow('Risk contingency', money(est.contingency))
    totalRow(`Margin (${est.marginPct}%)`, money(est.marginAmount))
    totalRow('Subtotal (ex GST)', money(est.subtotalExGst))
    totalRow('GST (10%)', money(est.gst))
    y += 1
    doc.setFillColor(...SAGE)
    doc.roundedRect(W / 2, y - 4, W / 2 - M, 11, 1.5, 1.5, 'F')
    doc.setTextColor(255, 255, 255)
    totalRow(kind === 'invoice' ? 'TOTAL DUE (inc GST)' : 'TOTAL (inc GST)', money(est.expected), true, [255, 255, 255])

    // ---- Hidden cost / exclusions notes (quote only) ----
    if (kind === 'quote' && est.hiddenCosts.length) {
      y += 6
      if (y > 250) {
        doc.addPage()
        y = 20
      }
      doc.setTextColor(...INK)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('NOTES & EXCLUSIONS', M, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...GREY)
      for (const h of est.hiddenCosts.filter((x) => !x.included).slice(0, 6)) {
        const lines = doc.splitTextToSize(`• ${h.title}: allow approx ${money(h.estImpact)} if applicable.`, W - 2 * M)
        doc.text(lines, M, y)
        y += lines.length * 4
      }
    }
  }

  // ---- Footer ----
  doc.setDrawColor(225, 228, 230)
  doc.line(M, 282, W - M, 282)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GREY)
  doc.text(
    kind === 'invoice'
      ? `Payment due within 14 days. Please reference invoice #${quote.id.slice(-6).toUpperCase()}.`
      : 'Quote valid 30 days. Prices ex-site conditions noted above. Generated with TerrainPro Estimator.',
    M,
    287,
  )
  doc.text('TerrainPro Estimator', W - M, 287, { align: 'right' })

  return doc
}

export function downloadDocument(quote: Quote, profile: CompanyProfile, kind: DocKind = 'quote') {
  const doc = generateDocument(quote, profile, kind)
  const name = `${kind}-${(quote.client || 'client').replace(/\s+/g, '-').toLowerCase()}-${quote.id.slice(-6)}.pdf`
  doc.save(name)
}

export function documentDataUri(quote: Quote, profile: CompanyProfile, kind: DocKind = 'quote'): string {
  return generateDocument(quote, profile, kind).output('datauristring')
}

const money = (n: number) =>
  '$' + (n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
