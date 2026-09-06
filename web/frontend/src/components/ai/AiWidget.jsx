import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquare, X } from '@/components/ui/icons'
import { cn } from '../../utils/cn'
import { ChatPanel } from './ChatPanel'
import { AGENTIC_SUGGESTIONS, agenticStorageKey } from './agentic'
import { knowledgeApi } from '../../api/knowledge.api'
import { useAuthStore, hasPermission } from '../../store/authStore'
import agentLogo from '@/assets/agent-logo.png'

// Tempu Ai, always within reach: a launcher pinned to the bottom-right corner of
// every admin screen that opens the agentic chat in place, so an admin never has
// to leave the page they're working on to ask about it. It shares its
// `storageKey` with the full /agentic page, so the same conversation continues in
// either surface.
export function AiWidget() {
  const [open, setOpen] = useState(false)
  const admin = useAuthStore((s) => s.admin)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Redundant on the agent's own page, and gated by the same permission that
  // page is — the widget must never be a way around it.
  if (pathname.startsWith('/agentic') || !hasPermission(admin, 'useAgenticAI')) return null

  return (
    <>
      {open && (
        <div
          className={cn(
            'fixed z-40 flex flex-col overflow-hidden rounded-2xl shadow-2xl',
            'bottom-24 right-4 sm:right-6',
            'w-[calc(100vw-2rem)] sm:w-[420px]',
            'h-[min(620px,calc(100vh-9rem))]'
          )}
        >
          <ChatPanel
            icon={MessageSquare}
            title="Tempu Ai"
            emptyTitle="How can Tempu Ai help?"
            emptyHint="Ask about anything in the app — or tell it to send a message, reply to a ticket, or approve something."
            suggestions={AGENTIC_SUGGESTIONS}
            suggestionLayout="list"
            placeholder="Message Tempu Ai…"
            sendFn={(text, history, image) => knowledgeApi.agenticChat(text, history, image)}
            actionFn={(token) => knowledgeApi.agenticAction(token)}
            allowImage
            storageKey={agenticStorageKey(admin)}
            onClose={() => setOpen(false)}
            dense
            className="h-full w-full rounded-2xl"
            style={{}}
          />
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Tempu Ai' : 'Ask Tempu Ai'}
        aria-expanded={open}
        title={open ? 'Close Tempu Ai' : 'Ask Tempu Ai'}
        className={cn(
          'fixed bottom-5 right-4 sm:right-6 z-40 h-14 w-14 rounded-full grid place-items-center',
          'shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95',
          open ? 'bg-white text-gray-500 hover:text-gray-700' : 'bg-white'
        )}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <img src={agentLogo} alt="" className="h-11 w-11 rounded-full object-cover" />
        )}
      </button>
    </>
  )
}
