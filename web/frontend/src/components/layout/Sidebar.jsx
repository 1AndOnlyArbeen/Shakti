import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutGrid, Users, Car, Navigation, Repeat, CreditCard, FileText,
  MessageSquare, Building2, BarChart2, Shield, Bell, X, Banknote, Coins, Siren,
  ChevronDown, Settings, ChevronsLeft, LogOut, BookOpen, History, MapPin,
} from '@/components/ui/icons'
import logoIcon from '@/assets/logo-icon.png'
import logoWordmark from '@/assets/logo-wordmark.png'
import { cn } from '../../utils/cn'
import { Avatar } from '../ui/Avatar'
import { NotificationBell } from './NotificationBell'
import { dashboardApi } from '../../api/dashboard.api'
import { authApi } from '../../api/auth.api'
import { useAuthStore, hasPermission, canSeeDashboard, homePath } from '../../store/authStore'
import toast from 'react-hot-toast'

// Claude-style sunburst mark (approximation) used as the HemaWati group icon.
// Radial spokes of alternating length from the centre, matching the icon API
// (accepts a className so it inherits the sidebar's h-4 w-4 text-orange-500).
function ClaudeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6
        const inner = 3
        const outer = i % 2 === 0 ? 9.5 : 7
        return (
          <line
            key={i}
            x1={12 + Math.cos(a) * inner}
            y1={12 + Math.sin(a) * inner}
            x2={12 + Math.cos(a) * outer}
            y2={12 + Math.sin(a) * outer}
          />
        )
      })}
    </svg>
  )
}

// Each group gets an icon + chevron header (collapsible), with its links indented
// underneath - the ShipOS sidebar pattern.
const navSections = [
  {
    label: 'Overview',
    icon: LayoutGrid,
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, permission: null },
      { to: '/analytics', label: 'Analytics', icon: BarChart2, permission: 'viewAnalytics' },
    ],
  },
  {
    label: 'User Management',
    icon: Users,
    items: [
      { to: '/users', label: 'Users', icon: Users, permission: 'manageUsers' },
      { to: '/drivers', label: 'Drivers', icon: Car, permission: 'manageDrivers', badge: 'drivers' },
      { to: '/admins', label: 'Admin Users', icon: Shield, permission: 'manageAdmins' },
    ],
  },
  {
    label: 'Operations',
    icon: Navigation,
    items: [
      { to: '/trips', label: 'Trips', icon: Navigation, permission: 'manageTrips' },
      { to: '/subscriptions', label: 'Subscriptions', icon: Repeat, permission: 'manageSubscriptions' },
      { to: '/documents', label: 'Documents', icon: FileText, permission: 'verifyDocuments', badge: 'documents' },
    ],
  },
  {
    label: 'Finance',
    icon: CreditCard,
    items: [
      { to: '/transactions', label: 'Transactions', icon: CreditCard, permission: 'managePayments' },
      { to: '/withdrawals', label: 'Withdrawals', icon: Banknote, permission: 'managePayments', badge: 'withdrawals' },
      { to: '/pricing', label: 'Pricing Control', icon: Coins, permission: 'managePayments' },
    ],
  },
  {
    label: 'Support & Business',
    icon: MessageSquare,
    items: [
      { to: '/support', label: 'Support', icon: MessageSquare, permission: 'handleSupport', badge: 'support' },
      { to: '/emergencies', label: 'Emergency Alerts', icon: Siren, permission: 'handleSupport', badge: 'emergencies' },
      { to: '/suppliers', label: 'Suppliers', icon: Building2, permission: 'manageSuppliers' },
    ],
  },
  {
    label: 'System',
    icon: Settings,
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell, permission: null },
      { to: '/map-settings', label: 'Map & Location', icon: MapPin, superadmin: true },
      { to: '/api-logs', label: 'API Log', icon: History, superadmin: true },
    ],
  },
  {
    label: 'HemaWati',
    icon: ClaudeIcon,
    items: [
      { to: '/rag', label: 'Tempu RAG', icon: BookOpen, permission: 'manageKnowledge' },
    ],
  },
]

export function Sidebar({ open, onClose, isCollapsed, onToggle }) {
  const { admin, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()

  const handleLogout = () => {
    // Best-effort server revoke (fires while the token is still present), but
    // never block the UI on it - clear locally and navigate immediately so the
    // button always works even if the API is slow or unreachable.
    authApi.logout().catch(() => { /* ignore */ })
    logout()
    navigate('/login', { replace: true })
    toast.success('Logged out successfully')
  }

  // Collapse/expand the rail by double-clicking it (ignore links so navigating
  // never collapses), or by dragging its right edge left/right past a threshold.
  const handleDoubleClick = (e) => {
    if (e.target.closest('a')) return
    onToggle?.()
  }
  const startDrag = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const onMove = (ev) => {
      const dx = ev.clientX - startX
      if (dx <= -40 && !isCollapsed) { onToggle?.(); stop() }
      else if (dx >= 40 && isCollapsed) { onToggle?.(); stop() }
    }
    const stop = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
  }

  // Which groups are collapsed. Empty = all expanded.
  const [collapsed, setCollapsed] = useState({})
  const toggleSection = (label) => setCollapsed((c) => ({ ...c, [label]: !c[label] }))

  // Poll counts of NEW (unseen) items so the badges stay fresh.
  const { data: countsRes } = useQuery({
    queryKey: ['nav-counts'],
    queryFn: () => dashboardApi.navCounts(),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  })
  const counts = countsRes?.data || {}

  // Viewing a badged section marks it seen → its "new" badge clears.
  useEffect(() => {
    const path = location.pathname
    const item = navSections.flatMap((s) => s.items).find(
      (it) => it.badge && (path === it.to || path.startsWith(`${it.to}/`))
    )
    if (!item) return
    dashboardApi.markNavSeen(item.badge)
      .then(() => qc.invalidateQueries({ queryKey: ['nav-counts'] }))
      .catch(() => {})
  }, [location.pathname, qc])

  // Collapse every group at once (the bottom button).
  const allCollapsed = navSections.every((s) => collapsed[s.label])
  const collapseAll = () => {
    const next = {}
    if (!allCollapsed) navSections.forEach((s) => { next[s.label] = true })
    setCollapsed(next)
  }

  return (
    <aside
      onDoubleClick={handleDoubleClick}
      className={cn(
        'bg-white text-gray-900 flex flex-col h-screen fixed left-0 top-0 z-30 w-60 transition-all duration-200',
        // On desktop the bar slides between full and a slim icon rail; on mobile it's the drawer (always full width).
        isCollapsed ? 'lg:w-16' : 'lg:w-60',
        'lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Drag the right edge to collapse/expand (desktop) */}
      <div
        onMouseDown={startDrag}
        className="hidden lg:block absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-gray-200 z-40"
        title="Drag to collapse"
      />

      {/* Logo row - wordmark collapses to just the mark on the slim rail */}
      <div className={cn(
        'h-20 flex items-center border-b border-gray-200',
        isCollapsed ? 'lg:flex-col lg:gap-1 lg:justify-center lg:px-0' : 'justify-between px-4'
      )}>
        <button
          onClick={() => { navigate(homePath(admin)); onClose?.() }}
          className="flex items-center gap-2 min-w-0 text-left"
          title="Go to home"
        >
          {/* Full logo when expanded; just the mark on the slim rail. */}
          <img
            src={logoIcon}
            alt="Tempu"
            className={cn('h-9 w-9 shrink-0 object-contain', !isCollapsed && 'hidden')}
          />
          <img
            src={logoWordmark}
            alt="Tempu"
            className={cn('h-8 w-auto object-contain', isCollapsed && 'lg:hidden')}
          />
        </button>
        {/* Mobile drawer close */}
        <button onClick={onClose} className="lg:hidden p-1 rounded-md hover:bg-gray-100 text-gray-500 shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Grouped, collapsible navigation */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin border-r border-gray-200">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => {
            if (item.to === '/dashboard' && !canSeeDashboard(admin)) return false
            if (item.superadmin && admin?.role !== 'superadmin') return false
            return !item.permission || hasPermission(admin, item.permission)
          })
          if (!visibleItems.length) return null
          const isOpen = !collapsed[section.label]
          return (
            <div key={section.label} className="mt-1">
              <button
                onClick={() => (isCollapsed ? onToggle?.() : toggleSection(section.label))}
                title={section.label}
                className={cn(
                  'w-full flex items-center px-3 py-2 text-[15px] font-semibold text-gray-900',
                  isCollapsed ? 'lg:justify-center lg:px-0' : 'justify-between'
                )}
              >
                <span className="flex items-center gap-2">
                  <section.icon className="h-4 w-4 text-orange-500" />
                  <span className={cn(isCollapsed && 'lg:hidden')}>{section.label}</span>
                </span>
                <ChevronDown className={cn('h-3 w-3 text-gray-400 transition-transform', isOpen ? '' : '-rotate-90', isCollapsed && 'lg:hidden')} />
              </button>

              {isOpen && visibleItems.map((item) => {
                const count = item.badge ? (counts[item.badge] || 0) : 0
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'sidebar-link flex items-center justify-between pl-9 pr-3 py-1.5 mx-1 rounded text-sm transition-colors',
                        // black text throughout; the active item is bold with a subtle fill
                        isActive ? 'font-semibold text-gray-900 bg-gray-100' : 'text-gray-800 hover:bg-gray-50',
                        // hidden on the slim desktop rail
                        isCollapsed && 'lg:hidden'
                      )
                    }
                  >
                    <span className="truncate">{item.label}</span>
                    {count > 0 && (
                      <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold grid place-items-center bg-red-500 text-white">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Collapse-all button */}
      <div className={cn('px-3 py-2.5 border-t border-gray-100 border-r border-gray-200', isCollapsed && 'lg:hidden')}>
        <button
          onClick={collapseAll}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600"
        >
          <ChevronsLeft className="h-3 w-3" />
          {allCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        </button>
      </div>

      {/* Admin profile + notifications + logout (replaces the old top header) */}
      <div className={cn(
        'border-t border-gray-100 p-3 border-r border-gray-200 flex items-center gap-1.5',
        isCollapsed && 'lg:flex-col lg:gap-2 lg:p-2'
      )}>
        <button
          onClick={() => { navigate('/profile'); onClose?.() }}
          className={cn('flex items-center gap-2.5 min-w-0 text-left rounded-lg p-1 -m-1 hover:bg-gray-50 transition-colors', isCollapsed ? 'lg:flex-none' : 'flex-1')}
          title={admin?.name || 'View my profile'}
        >
          <Avatar src={admin?.avatarUrl} name={admin?.name} size="sm" />
          <div className={cn('min-w-0', isCollapsed && 'lg:hidden')}>
            <p className="text-sm font-medium text-gray-900 truncate">{admin?.name || 'Admin'}</p>
            <p className="text-xs text-gray-500 capitalize">{admin?.role || 'admin'}</p>
          </div>
        </button>
        <NotificationBell openUp />
        <button
          onClick={handleLogout}
          className="shrink-0 p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
          title="Logout"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </aside>
  )
}
