import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from '@/components/ui/icons'
import { cn } from '../../utils/cn'
import { Sidebar } from './Sidebar'
import { AiWidget } from '../ai/AiWidget'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)   // mobile drawer
  const [collapsed, setCollapsed] = useState(false)        // desktop collapse

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        isCollapsed={collapsed}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setCollapsed((c) => !c)}
      />

      {/* Mobile-only open button - desktop always shows the (slim or full) rail */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-20 p-2 rounded-lg bg-white border border-gray-200 text-gray-600 shadow-sm"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Main content - padding tracks the rail width on desktop */}
      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        <main className="min-h-screen">
          <div className="p-3 sm:p-5 mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Tempu Ai, one click away from every screen */}
      <AiWidget />
    </div>
  )
}
