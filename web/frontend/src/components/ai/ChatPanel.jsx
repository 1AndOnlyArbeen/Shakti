import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Sparkles, Send, MessageSquare, Plus, Paperclip, X } from '@/components/ui/icons'
import { cn } from '../../utils/cn'
import { Markdown, KbImage } from './Markdown'
import { hasInlineKbImage } from './kbImages'
import { ActionCard } from './ActionCard'
import toast from 'react-hot-toast'

// Shared multi-turn chat panel used by BOTH Tempu Ai (agentic) and Tempu Rag, so
// they get the exact same experience: conversation history, a "New chat" button
// to start fresh, suggestion chips, streamed-in markdown replies, an optional
// sources line, optional image attachment, and (when `storageKey` is set)
// localStorage persistence so the conversation survives a refresh or tab switch.
// `sendFn(text, history, image)` posts to whichever endpoint the caller wants.
//
// Only the last N turns are persisted — plenty for continuity without letting
// localStorage grow unbounded over weeks of use.
const HISTORY_LIMIT = 60

// Screenshots to show beneath an answer that didn't place any itself. A query
// can ground on 9 of them across several documents; four is enough to be useful
// without turning the reply into a contact sheet.
const KB_IMAGE_FALLBACK = 4

function loadStoredMessages(storageKey) {
  if (!storageKey) return []
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Images are dropped before persisting (kept only as a `hadImage` flag) — a
// full base64 attachment can be 8MB+ and would blow past localStorage's ~5MB
// per-origin quota after just a couple of turns.
//
// Action cards keep their preview so the transcript still reads correctly, but
// lose their confirmation token: tokens expire server-side after 15 minutes, so
// a card restored from storage must never look clickable. One still awaiting a
// decision comes back as 'expired'; a settled one keeps its real outcome.
function toStorable(messages) {
  return messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.role,
    text: m.text,
    ...(m.sources?.length ? { sources: m.sources } : {}),
    // Just short URLs — the bytes are fetched on demand, so these are safe to
    // persist (unlike an attached base64 image).
    ...(m.images?.length ? { images: m.images } : {}),
    ...(m.image ? { hadImage: true } : {}),
    ...(m.actions?.length
      ? {
          actions: m.actions.map(({ token, ...a }) => ({
            ...a,
            status: ['done', 'cancelled', 'error'].includes(a.status) ? a.status : 'expired',
          })),
        }
      : {}),
  }))
}

// `actionFn(token)` confirms a prepared write action. Omit it and action cards
// are never rendered — the agent's proposals are simply ignored.
export function ChatPanel({
  icon: Icon = MessageSquare, title, subtitle, emptyTitle, emptyHint,
  suggestions = [], placeholder, footerNote, sendFn, actionFn = null,
  showSources = false, allowImage = false, storageKey = null,
  // Layout knobs so the same panel works full-page and inside the floating
  // widget: `className`/`style` size the shell, `dense` tightens the padding for
  // a narrow column, `suggestionLayout="list"` stacks the starter prompts as
  // full-width rows instead of wrapped chips, and `onClose` adds a dismiss
  // button beside "New chat".
  className, style = { height: '85vh' }, dense = false,
  suggestionLayout = 'chips', onClose = null,
}) {
  const [messages, setMessages] = useState(() => loadStoredMessages(storageKey)) // { role: 'user' | 'model', text, sources?, images?, image?, hadImage?, actions? }
  const [input, setInput] = useState('')
  const [image, setImage] = useState(null) // base64 data URL, attached to the next message
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const imageInputRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(toStorable(messages)))
    } catch {
      // Quota exceeded or unavailable (private browsing) — history just won't
      // survive a refresh this time; not worth surfacing to the admin.
    }
  }, [messages, storageKey])

  const send = useMutation({
    mutationFn: ({ text, history, image: img }) => sendFn(text, history, img),
    onSuccess: (res) => {
      const data = res?.data || {}
      setMessages((prev) => [...prev, {
        role: 'model',
        text: data.reply || data.answer || '…',
        sources: data.sources || [],
        // Screenshots that were in the grounding context. The model is asked to
        // place them inline beside the step they illustrate and often does, but
        // it skips them on plenty of runs — including on an explicit "show me
        // screenshots". These are the safety net for exactly that case.
        images: Array.isArray(data.images) ? data.images : [],
        // Write actions the agent prepared. Nothing has run yet — each renders
        // as a card the admin has to confirm.
        actions: Array.isArray(data.pendingActions) ? data.pendingActions : [],
      }])
    },
    onError: (e) => {
      toast.error(e?.message || 'Chat failed. Is the AI service running?')
      setMessages((prev) => prev.slice(0, -1)) // drop the optimistic user turn so they can retry
    },
  })

  const onPickImage = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) toast.error('Please choose an image file')
      else if (file.size > 8 * 1024 * 1024) toast.error('Image too large (max 8MB)')
      else {
        const reader = new FileReader()
        reader.onload = () => setImage(reader.result) // data URL
        reader.readAsDataURL(file)
      }
    }
    e.target.value = '' // allow re-picking the same file
  }

  const sendMessage = (text) => {
    const trimmed = (text || '').trim()
    if ((!trimmed && !image) || send.isPending) return
    const history = messages.map((m) => ({ role: m.role, text: m.text }))
    const sentImage = image
    setMessages((prev) => [...prev, { role: 'user', text: trimmed, image: sentImage }])
    setInput('')
    setImage(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    send.mutate({ text: trimmed, history, image: sentImage })
  }

  // Action cards are addressed by their position in the transcript, which is
  // stable because messages are only ever appended.
  const patchAction = (msgIndex, actionIndex, patch) => {
    setMessages((prev) => prev.map((m, i) => (
      i !== msgIndex ? m : { ...m, actions: (m.actions || []).map((a, j) => (j !== actionIndex ? a : { ...a, ...patch })) }
    )))
  }

  const confirmAction = async (msgIndex, actionIndex) => {
    const action = messages[msgIndex]?.actions?.[actionIndex]
    if (!actionFn || !action?.token || ['sending', 'done'].includes(action.status)) return
    patchAction(msgIndex, actionIndex, { status: 'sending' })
    try {
      const res = await actionFn(action.token)
      const message = res?.data?.message || res?.message || 'Done.'
      // Drop the token once it has been spent so the card can't be re-fired.
      patchAction(msgIndex, actionIndex, { status: 'done', result: message, token: undefined })
      toast.success(message)
    } catch (e) {
      // Keep the token on failure — a transient error is worth a retry, and an
      // expired or tampered one is rejected again by the server anyway.
      const message = e?.message || 'That action could not be completed.'
      patchAction(msgIndex, actionIndex, { status: 'error', result: message })
      toast.error(message)
    }
  }

  const cancelAction = (msgIndex, actionIndex) =>
    patchAction(msgIndex, actionIndex, { status: 'cancelled', token: undefined })

  const newChat = () => {
    setMessages([])
    setInput('')
    setImage(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const submit = (e) => { e.preventDefault(); sendMessage(input) }
  const onInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }
  const autoGrow = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  return (
    <section className={cn('bg-white rounded-xl border border-gray-200 flex flex-col', className)} style={style}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 shrink-0">
        <Icon className="h-4 w-4 text-orange-500" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <span className="text-[11px] text-gray-400 hidden sm:inline">· {subtitle}</span>}
        <button
          onClick={newChat}
          disabled={messages.length === 0 && !input}
          className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Start a new chat"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close chat"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className={cn('max-w-4xl mx-auto', dense ? 'px-4 py-4' : 'px-6 py-6')}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <Sparkles className="h-7 w-7 text-orange-300 mb-3" />
              <p className="text-base font-semibold text-gray-900">{emptyTitle}</p>
              <p className="text-sm text-gray-400 mt-1 mb-5">{emptyHint}</p>
              <div
                className={cn(
                  suggestionLayout === 'list'
                    ? 'w-full max-w-sm flex flex-col gap-1.5'
                    : 'flex flex-wrap gap-2 justify-center max-w-md'
                )}
              >
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className={cn(
                      'text-xs bg-white border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600 transition-colors',
                      suggestionLayout === 'list'
                        ? 'w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50/40'
                        : 'px-3 py-1.5 rounded-full'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900">
                      {m.image && (
                        <img src={m.image} alt="attachment" className="mb-2 max-h-48 rounded-lg object-contain" />
                      )}
                      {!m.image && m.hadImage && (
                        <p className="mb-1 flex items-center gap-1 text-xs text-gray-400">
                          <Paperclip className="h-3 w-3" /> image attached
                        </p>
                      )}
                      {m.text && <span className="whitespace-pre-wrap">{m.text}</span>}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="text-sm text-gray-800">
                    <Markdown>{m.text}</Markdown>
                    {/* Only when the answer didn't already place them itself —
                        otherwise the same screens appear twice. */}
                    {m.images?.length > 0 && !hasInlineKbImage(m.text) && (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs text-gray-400">Screenshots from these sources</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {m.images.slice(0, KB_IMAGE_FALLBACK).map((src) => (
                            <KbImage key={src} src={src} />
                          ))}
                        </div>
                      </div>
                    )}
                    {actionFn && m.actions?.map((a, j) => (
                      <ActionCard
                        key={j}
                        action={a}
                        onConfirm={() => confirmAction(i, j)}
                        onCancel={() => cancelAction(i, j)}
                      />
                    ))}
                    {showSources && m.sources?.length > 0 && (
                      <p className="mt-2 text-xs text-gray-400">Sources: {m.sources.join(', ')}</p>
                    )}
                  </div>
                )
              )}
              {send.isPending && (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={cn('border-t border-gray-100 shrink-0', dense ? 'p-3' : 'p-4')}>
        <form onSubmit={submit} className="max-w-4xl mx-auto">
          {/* Attached-image preview */}
          {image && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
              <img src={image} alt="attachment" className="h-12 w-12 rounded object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="p-1 rounded-md hover:bg-gray-200 text-gray-500"
                aria-label="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="relative rounded-2xl border border-gray-300 focus-within:border-orange-400 focus-within:ring-1 focus-within:ring-orange-400 bg-white shadow-sm transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={autoGrow}
              onKeyDown={onInputKeyDown}
              placeholder={placeholder}
              className={cn(
                'w-full resize-none bg-transparent rounded-2xl py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none',
                allowImage ? 'pl-11 pr-12' : 'pl-4 pr-12'
              )}
              style={{ maxHeight: 200 }}
            />
            {allowImage && (
              <>
                <input ref={imageInputRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="absolute bottom-2 left-2 h-8 w-8 rounded-full text-gray-400 hover:text-orange-500 hover:bg-gray-100 grid place-items-center transition-colors"
                  aria-label="Attach image"
                  title="Attach an image"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              type="submit"
              disabled={(!input.trim() && !image) || send.isPending}
              className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white grid place-items-center transition-colors"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {footerNote && <p className="text-center text-[11px] text-gray-400 mt-2">{footerNote}</p>}
        </form>
      </div>
    </section>
  )
}
