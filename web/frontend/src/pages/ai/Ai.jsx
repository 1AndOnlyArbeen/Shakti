import { MessageSquare } from '@/components/ui/icons'
import { PageHeader } from '../../components/shared/PageHeader'
import { EmptyState } from '../../components/shared/EmptyState'
import { ChatPanel } from '../../components/ai/ChatPanel'
import { AGENTIC_SUGGESTIONS, agenticStorageKey } from '../../components/ai/agentic'
import { knowledgeApi } from '../../api/knowledge.api'
import { useAuthStore, hasPermission } from '../../store/authStore'
import agentLogo from '@/assets/agent-logo.png'

// Tempu Ai — a tool-calling chat over LIVE app data. The knowledge base (Tempu
// Rag) lives on its own page (/knowledge); this page is purely the agent.
export default function Ai() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        sticky
        title={
          <span className="inline-flex items-center gap-3">
            <img
              src={agentLogo}
              alt="Tempu Ai"
              className="h-16 w-16 rounded-full object-cover bg-white ring-2 ring-orange-200 p-0.5"
            />
            <span className="text-2xl sm:text-3xl w-40 text-left">AGENT</span>
          </span>
        }
      />
      <AgenticSection />
    </div>
  )
}

// ── Agentic: a tool-calling chat over LIVE app data that can also PREPARE
// changes (notifications, ticket replies, approvals, payouts, pricing…). Gated
// by the useAgenticAI permission since it surfaces personal data; each write
// action additionally re-checks the same permission its admin screen requires,
// and only runs once the admin confirms the card. ────────────────────────────
function AgenticSection() {
  const admin = useAuthStore((s) => s.admin)
  const canUse = hasPermission(admin, 'useAgenticAI')

  if (!canUse) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 p-10">
        <EmptyState
          icon={MessageSquare}
          title="No access to Tempu Ai"
          description="Ask a superadmin to grant you the “Use Agentic AI” permission to query live app data through chat."
        />
      </section>
    )
  }

  return (
    <ChatPanel
      icon={MessageSquare}
      title="Chat"
      emptyTitle="How can Tempu Ai help?"
      emptyHint="Ask about anything in the app — or tell it to send a message, reply to a ticket, or approve something."
      suggestions={AGENTIC_SUGGESTIONS}
      placeholder="Message Tempu Ai… or attach an image"
      sendFn={(text, history, image) => knowledgeApi.agenticChat(text, history, image)}
      actionFn={(token) => knowledgeApi.agenticAction(token)}
      allowImage
      storageKey={agenticStorageKey(admin)}
    />
  )
}
