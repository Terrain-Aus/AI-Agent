import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { nextQuestions, parseDescription } from '../engine/apprentice'
import type { ChatMessage } from '../engine/types'
import { uid } from '../lib/format'
import { IconBack, IconBrain, IconCheck, IconSend } from '../components/icons'
import { Logo, Progress } from '../components/ui'
import { isLiveAI } from '../lib/ai'

export default function ApprenticeChat() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const quote = useStore((s) => s.getQuote(id))
  const updateSpec = useStore((s) => s.updateSpec)
  const addMessage = useStore((s) => s.addMessage)
  const runEstimate = useStore((s) => s.runEstimate)

  const [input, setInput] = useState('')
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Guards against scheduling the same message twice across rapid re-renders.
  const scheduledRef = useRef<string | null>(null)

  const pending = useMemo(
    () => (quote ? nextQuestions(quote.spec).filter((q) => !answered.has(q.id)) : []),
    [quote, answered],
  )
  const current = pending[0]
  const totalQ = 6
  const progress = ((totalQ - pending.length) / totalQ) * 100

  const READY_TEXT =
    "Righto, I've got enough to price this properly. Hit the button and I'll crunch the numbers — low, expected and high, with the hidden costs flagged. Don't send it before you read those."

  // Post the next apprentice message (question, or the green light) when due.
  // `typing` is intentionally NOT a dependency — toggling it must not cancel
  // the pending timeout.
  useEffect(() => {
    if (!quote) return
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
      setTyping(false)
      return
    }
    if (scheduledRef.current === target) return // already in flight

    scheduledRef.current = target
    setTyping(true)
    const t = setTimeout(() => {
      if (current) {
        addMessage(id, { id: uid('m_'), role: 'apprentice', text: current.text, chips: current.chips, ts: Date.now() })
      } else {
        addMessage(id, { id: 'ready', role: 'apprentice', text: READY_TEXT, ts: Date.now() })
      }
      setTyping(false)
      scheduledRef.current = null
    }, 500)
    return () => {
      clearTimeout(t)
      scheduledRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, current, id, addMessage])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [quote?.chat.length, typing])

  if (!quote) {
    return (
      <div className="py-20 text-center text-slate-400">
        Quote not found.{' '}
        <button className="text-sage-400 underline" onClick={() => navigate('/new')}>
          Start a new one
        </button>
      </div>
    )
  }

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    addMessage(id, { id: uid('m_'), role: 'user', text, ts: Date.now() })
    setInput('')

    if (current) {
      const patch = current.apply(quote.spec, text)
      updateSpec(id, patch)
      setAnswered((s) => new Set(s).add(current.id))
    } else {
      // Free-form after completion — merge any new detail.
      updateSpec(id, parseDescription(`${quote.spec.rawDescription} ${text}`))
    }
  }

  const chooseChip = (chip: string) => send(chip)

  const generate = () => {
    runEstimate(id)
    navigate(`/quote/${id}/preview`)
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col lg:min-h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="btn-ghost !px-2.5 !py-2">
          <IconBack size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-500/20 text-sage-400">
            <IconBrain size={16} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-100">AI Apprentice</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {isLiveAI ? 'Live model' : 'On-device'} · stops you underquoting
            </div>
          </div>
        </div>
        <button onClick={() => navigate(`/quote/${id}/details`)} className="btn-ghost !px-3 !py-2 text-xs">
          Details
        </button>
      </div>

      <div className="mb-3">
        <Progress value={progress} />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-ink-400 bg-ink-700/40 p-3 sm:p-4">
        {quote.chat.map((m) => (
          <Bubble key={m.id} msg={m} onChip={chooseChip} disabled={m !== lastApprentice(quote.chat)} />
        ))}
        {typing && <TypingBubble />}
        {!current && !typing && (
          <div className="animate-fade-up pt-1">
            <button onClick={generate} className="btn-primary w-full">
              <IconCheck size={18} /> Crunch the numbers
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          className="input flex-1"
          placeholder={current ? 'Type your answer…' : 'Add anything else…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-primary !px-3.5" disabled={!input.trim()}>
          <IconSend size={18} />
        </button>
      </form>
    </div>
  )
}

function lastApprentice(chat: ChatMessage[]): ChatMessage | undefined {
  return [...chat].reverse().find((m) => m.role === 'apprentice')
}

function Bubble({ msg, onChip, disabled }: { msg: ChatMessage; onChip: (c: string) => void; disabled: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex animate-fade-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : ''}`}>
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sage-500/80">
            <Logo size={14} withWordmark={false} /> Apprentice
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser ? 'rounded-br-sm bg-sage-500 text-ink-900' : 'rounded-bl-sm border border-ink-400 bg-ink-600 text-slate-200'
          }`}
        >
          {msg.text}
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
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-sage-400"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  )
}
