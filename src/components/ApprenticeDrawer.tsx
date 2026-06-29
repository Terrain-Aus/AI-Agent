// AI Apprentice slide-up drawer. Same UI either way; the brain behind it is
// either the live server LLM (OpenAI Responses API, streamed) or the on-device
// deterministic flow when no provider is configured.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { nextQuestions, parseDescription } from '../engine/apprentice'
import type { ChatMessage, Quote } from '../engine/types'
import { uid } from '../lib/format'
import { IconBrain, IconCheck, IconSend } from './icons'
import { Logo, Progress } from './ui'
import BottomSheet from './BottomSheet'
import { apprenticeHealth, streamApprentice } from '../lib/apprenticeClient'
import type { ApprenticeContext, ApprenticeHealth, PayloadMessage } from '../lib/apprenticeProtocol'
import type { BusinessProfile } from '../store/useStore'
import type { RateBook } from '../engine/pricing'

const READY_TEXT =
  "Righto, I've got enough to price this properly. Hit the button and I'll crunch the numbers — low, expected and high, with the hidden costs flagged. Don't send it before you read those."

export default function ApprenticeDrawer({
  id,
  open,
  onClose,
  onEstimated,
}: {
  id: string
  open: boolean
  onClose: () => void
  onEstimated: () => void
}) {
  const quote = useStore((s) => s.getQuote(id))
  const profile = useStore((s) => s.profile)
  const ratebook = useStore((s) => s.ratebook)
  const quotes = useStore((s) => s.quotes)
  const updateSpec = useStore((s) => s.updateSpec)
  const addMessage = useStore((s) => s.addMessage)
  const updateMessage = useStore((s) => s.updateMessage)
  const runEstimate = useStore((s) => s.runEstimate)

  const [health, setHealth] = useState<ApprenticeHealth | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const scheduledRef = useRef<string | null>(null)
  const kickedRef = useRef(false)

  const live = health?.live === true

  // Resolve which brain to use, once.
  useEffect(() => {
    apprenticeHealth().then(setHealth)
  }, [])

  // ---- LOCAL (on-device) question scheduler — only when not live ----
  const pending = useMemo(
    () => (quote && health && !live ? nextQuestions(quote.spec).filter((q) => !answered.has(q.id)) : []),
    [quote, answered, health, live],
  )
  const current = pending[0]

  useEffect(() => {
    if (!open || !quote || !health || live) return
    const last = quote.chat[quote.chat.length - 1]
    let needPost: boolean
    if (current) {
      const alreadyAsked = last?.role === 'apprentice' && last.text === current.text
      const waitingOnUser = last?.role === 'apprentice' && (last.chips?.length ?? 0) > 0
      needPost = !alreadyAsked && !waitingOnUser
    } else {
      needPost = !quote.chat.some((m) => m.id === 'ready')
    }
    const target = current ? current.id : 'ready'
    if (!needPost) {
      setBusy(false)
      return
    }
    if (scheduledRef.current === target) return
    scheduledRef.current = target
    setBusy(true)
    const t = setTimeout(() => {
      if (current) addMessage(id, { id: uid('m_'), role: 'apprentice', text: current.text, chips: current.chips, ts: Date.now() })
      else addMessage(id, { id: 'ready', role: 'apprentice', text: READY_TEXT, ts: Date.now() })
      setBusy(false)
      scheduledRef.current = null
    }, 480)
    return () => {
      clearTimeout(t)
      scheduledRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote, current, id, addMessage, health, live])

  // ---- LIVE kickoff: let the model ask the first question on open ----
  useEffect(() => {
    if (!open || !quote || !live || kickedRef.current) return
    const hasUserTurn = quote.chat.some((m) => m.role === 'user')
    const hasModelTurn = quote.chat.some((m) => m.role === 'apprentice' && m.id !== 'seed-opening')
    if (!hasUserTurn && !hasModelTurn) {
      kickedRef.current = true
      void runLive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote, live])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [quote?.chat.length, busy, streamingId])

  if (!quote) return null

  const buildContext = (): ApprenticeContext => ({
    rawDescription: quote.spec.rawDescription || quote.title,
    spec: quote.spec,
    ratebook: ratebook as RateBook,
    prefs: {
      businessName: (profile as BusinessProfile).businessName,
      defaultMarginPct: ratebook.defaultMarginPct,
      region: quote.spec.location || undefined,
    },
    priorQuotes: quotes
      .filter((q) => q.id !== id && q.estimate)
      .slice(0, 8)
      .map((q: Quote) => ({
        jobType: q.spec.jobType,
        finish: q.spec.finish,
        area: q.spec.area,
        location: q.spec.location,
        expected: q.estimate!.expected,
        perM2: q.spec.area ? Math.round(q.estimate!.expected / q.spec.area) : 0,
        status: q.status,
        hiddenCostTitles: q.estimate!.hiddenCosts.map((h) => h.title),
      })),
  })

  const payloadMessages = (): PayloadMessage[] => {
    const turns: PayloadMessage[] = [{ role: 'user', content: `Job: ${quote.spec.rawDescription || quote.title}` }]
    for (const m of quote.chat) {
      if (m.role === 'user') turns.push({ role: 'user', content: m.text })
      else if (m.role === 'apprentice' && m.id !== 'seed-opening' && m.text.trim()) turns.push({ role: 'assistant', content: m.text })
    }
    return turns
  }

  // Run one live turn: stream the apprentice's reply into a fresh bubble.
  async function runLive() {
    setBusy(true)
    let placeholderId: string | null = null
    let acc = ''
    const ensure = () => {
      if (!placeholderId) {
        placeholderId = uid('m_')
        addMessage(id, { id: placeholderId, role: 'apprentice', text: '', ts: Date.now() })
        setStreamingId(placeholderId)
      }
    }
    try {
      await streamApprentice({ quoteId: id, messages: payloadMessages(), context: buildContext() }, (ev) => {
        if (ev.type === 'text') {
          ensure()
          acc += ev.delta
          updateMessage(id, placeholderId!, { text: acc })
        } else if (ev.type === 'chips') {
          ensure()
          updateMessage(id, placeholderId!, { chips: ev.chips })
        } else if (ev.type === 'spec') {
          updateSpec(id, ev.patch)
        } else if (ev.type === 'ready') {
          setReady(true)
        } else if (ev.type === 'error') {
          if (!acc && !placeholderId) {
            // Live brain unavailable — fall back to the on-device flow.
            setHealth({ live: false, provider: 'local' })
          }
        }
      })
    } catch {
      if (!acc) setHealth({ live: false, provider: 'local' })
    } finally {
      setStreamingId(null)
      setBusy(false)
    }
  }

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return
    addMessage(id, { id: uid('m_'), role: 'user', text, ts: Date.now() })
    setInput('')

    if (live) {
      void runLive()
      return
    }
    // Local flow.
    if (current) {
      updateSpec(id, current.apply(quote.spec, text))
      setAnswered((s) => new Set(s).add(current.id))
    } else {
      updateSpec(id, parseDescription(`${quote.spec.rawDescription} ${text}`))
    }
  }

  const generate = () => {
    runEstimate(id)
    onEstimated()
    onClose()
  }

  const showCrunch = (live ? ready : !current) && !busy
  const showTyping = busy && !streamingId

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-500/20 text-sage-400">
            <IconBrain size={13} />
          </span>
          AI Apprentice
        </span>
      }
      subtitle={`${live ? 'Live model' : 'On-device'} · stops you underquoting`}
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-center gap-2"
        >
          <input
            className="input flex-1"
            placeholder={busy ? 'Apprentice is typing…' : 'Type your answer…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn-primary !px-3.5" disabled={!input.trim() || busy}>
            <IconSend size={18} />
          </button>
        </form>
      }
    >
      <div className="sticky top-0 z-10 -mx-4 mb-3 bg-ink-700/95 px-4 pb-2 pt-1 backdrop-blur">
        <Progress value={live ? (ready ? 100 : busy ? 60 : 30) : ((6 - pending.length) / 6) * 100} />
      </div>

      <div ref={scrollRef} className="space-y-3">
        {quote.chat.map((m) => (
          <Bubble key={m.id} msg={m} onChip={send} disabled={busy || m !== lastApprentice(quote.chat)} />
        ))}
        {showTyping && <TypingBubble />}
        {showCrunch && (
          <button onClick={generate} className="btn-primary mt-1 w-full animate-fade-up">
            <IconCheck size={18} /> Crunch the numbers
          </button>
        )}
      </div>
    </BottomSheet>
  )
}

function lastApprentice(chat: ChatMessage[]): ChatMessage | undefined {
  return [...chat].reverse().find((m) => m.role === 'apprentice')
}

function Bubble({ msg, onChip, disabled }: { msg: ChatMessage; onChip: (c: string) => void; disabled: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex animate-fade-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] ${isUser ? 'order-2' : ''}`}>
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sage-500/80">
            <Logo size={13} withWordmark={false} /> Apprentice
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser ? 'rounded-br-sm bg-sage-500 text-ink-900' : 'rounded-bl-sm border border-ink-400 bg-ink-600 text-slate-200'
          }`}
        >
          {msg.text || '…'}
        </div>
        {!isUser && msg.chips && msg.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.chips.map((c) => (
              <button key={c} className="chip disabled:opacity-40" disabled={disabled} onClick={() => onChip(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-ink-400 bg-ink-600 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-sage-400" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  )
}
