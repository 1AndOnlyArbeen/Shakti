// Shared Tempu Ai (agentic) wiring, used by BOTH the full /agentic page and the
// floating widget in the corner of every admin screen. Keeping it here means the
// two entry points ask the same questions and — crucially — share the same
// `storageKey`, so a conversation started in the bubble continues on the page.
export const AGENTIC_SUGGESTIONS = [
  'How many support tickets do we have?',
  'Show me the pending document queue',
  'How much revenue did we make this month?',
  'Any API errors today?',
]

export const agenticStorageKey = (admin) => `tempu-agentic-chat:${admin?._id || 'anon'}`
