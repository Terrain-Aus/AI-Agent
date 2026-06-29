// AI Apprentice as a slide-up drawer over the quote workspace.
// Keeps the whole quoting flow on one screen — no full-page navigation.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { nextQuestions, parseDescription } from '../engine/apprentice'
import type { ChatMessage } from '../engine/types'
import { uid } from '../lib/format'
import { IconBrain, IconCheck, IconSend } from './icons'
import { Logo, Progress } from './ui'
import { isLiveAI } from '../lib/ai'
import BottomSheet from './BottomSheet'

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
  const updateSpec = useStore((s) => s.updateSpec)
  const addMessage = useStore((s) => s.addMessage)
  const runEstimate = useStore((s) => s.runEstimate)

  const [input, setInput] = useState('')
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scheduledRef = useRef<string | null>(null)

  const pending = useMemo(
    () => (quote ? nextQuestions(quote.spec).filter((q) => !answered.has(q.id)) : []),
    [quote, answered],
  )
  const current = pending[0]
  const progress = ((6 - pending.length) / 6) * 100

  // Post the next apprentice message when due (typing is not a dep — see notes).
  useEffect(() => {
    if (!open || !quote) return
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
    if (scheduledRef.current === target) return
    scheduledRef.current = target
    setTyping(true)
    const t = setTimeout(() => {
      if (current) addMessage(id, { id: uid('m_'), role: 'apprentice', text: current.text, chips: current.chips, ts: Date.now() })
      else addMessage(id, { id: 'ready', role: 'apprentice', text: READY_TEXT, ts: Date.now() })
      setTyping(false)
      scheduledRef.current = null
    }, 480)
    return () => {
      clearTimeout(t)
      scheduledRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote, current, id, addMessage])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [quote?.chat.length, typing])

  if (!quote) return null

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    addMessage(id, { id: uid('m_'), role: 'user', text, ts: Date.now() })
    setInput('')
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
      subtitle={`${isLiveAI ? 'Live model' : 'On-device'} · stops you underquoting`}
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
            placeholder={current ? 'Type your answer…' : 'Add anything else…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn-primary !px-3.5" disabled={!input.trim()}>
            <IconSend size={18} />
          </button>
        </form>
      }
    >
      <div className="sticky top-0 z-10 -mx-4 mb-3 bg-ink-700/95 px-4 pb-2 pt-1 backdrop-blur">
        <Progress value={progress} />
      </div>

      <div ref={scrollRef} className="space-y-3">
        {quote.chat.map((m) => (
          <Bubble key={m.id} msg={m} onChip={send} disabled={m !== lastApprentice(quote.chat)} />
        ))}
        {typing && <TypingBubble />}
        {!current && !typing && (
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
          <span key={i} className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-sage-400" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  )
}
