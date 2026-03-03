import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Home, ShoppingCart, User, Users, Package, Settings, Wallet, Shield, Store, LayoutDashboard, Bell, BarChart3, UserCog, Users2, MessageSquare, Gift, Crown } from 'lucide-react'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import api from '../lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from './Toast'
import ReferralWelcomeModal from './ReferralWelcomeModal'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const cartCount = useCartStore(state => state.items.reduce((sum, i) => sum + i.quantity, 0))
  const { user, token, getEffectiveRole, setViewRole } = useAuthStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const effectiveRole = getEffectiveRole()
  const { appName, logoUrl, showLogo } = useBrandingStore()
  const { addToast } = useToast()
  const prevUnreadRef = useRef(0)

  const refreshSignals = useCallback(async () => {
    if (!user || !token) return
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const [unreadRes, msgRes, dmRes] = await Promise.all([
        api.get('/api/notifications/unread-count'),
        api.get('/api/inquiries/unread-count'),
        api.get('/api/dm/unread-count')
      ])

      const newCount = unreadRes.data.count || 0
      // Show toast if new notifications appeared (but not on first load)
      if (newCount > prevUnreadRef.current && prevUnreadRef.current > 0) {
        const diff = newCount - prevUnreadRef.current
        addToast(
          diff === 1 ? 'You have a new notification' : `You have ${diff} new notifications`,
          { type: 'notification', title: 'New notification' }
        )
      }
      prevUnreadRef.current = newCount
      setUnreadNotifs(newCount)
      setUnreadMessages((msgRes.data.count || 0) + (dmRes.data.count || 0))
    } catch {
    }
  }, [user, token, addToast])

  useEffect(() => {
    refreshSignals()
    const interval = setInterval(refreshSignals, 10000)
    return () => clearInterval(interval)
  }, [refreshSignals])

  // Refresh on route change
  useEffect(() => {
    refreshSignals()
  }, [location.pathname])

  useEffect(() => {
    const onUnreadUpdate = (event) => {
      const count = event?.detail?.count
      if (typeof count === 'number') setUnreadNotifs(count)
    }
    window.addEventListener('notifications-unread-updated', onUnreadUpdate)
    return () => window.removeEventListener('notifications-unread-updated', onUnreadUpdate)
  }, [])

  useEffect(() => {
    const onMessagesUpdate = (event) => {
      const count = event?.detail?.count
      if (typeof count === 'number') setUnreadMessages(count)
    }
    window.addEventListener('messages-unread-updated', onMessagesUpdate)
    return () => window.removeEventListener('messages-unread-updated', onMessagesUpdate)
  }, [])

  useEffect(() => {
    if (!token) return
    const onFocus = () => refreshSignals()
    const onRefresh = () => refreshSignals()
    window.addEventListener('focus', onFocus)
    window.addEventListener('refresh-signals', onRefresh)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('refresh-signals', onRefresh)
    }
  }, [token, refreshSignals])

  const isAdminView = effectiveRole === 'admin'

  const navItems = useMemo(() => {
    if (isAdminView) {
      return [
        { path: '/', icon: Shield, label: 'Admin' },
        { path: '/?tab=users', icon: Users, label: 'Users' },
        { path: '/?tab=orders', icon: ShoppingCart, label: 'Orders' },
        { path: '/?tab=stats', icon: BarChart3, label: 'Stats' },
      ]
    }
    return [
      { path: '/', icon: Home, label: 'Home' },
      { path: '/products', icon: Store, label: 'Marketplace' },
      { path: '/middleman', icon: Users2, label: 'Escrow' },
    ]
  }, [isAdminView, cartCount])

  const isImpersonating = typeof window !== 'undefined' && !!localStorage.getItem('admin_token')

  const returnToAdmin = async () => {
    const ok = await useAuthStore.getState().stopImpersonation()
    if (ok) {
      navigate('/?tab=users')
    } else {
      // Fallback: hard reload
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_refresh')
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 pb-20">
      {/* Referral code modal for new users */}
      {user && <ReferralWelcomeModal userId={user.id} />}

      {isImpersonating && (
        <div className="bg-cyan-500/15 border-b border-cyan-500/30 sticky top-0 z-[60]">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCog size={14} className="text-cyan-400" />
              <span className="text-xs font-medium text-cyan-300">
                Viewing as <span className="font-bold">@{user?.username || '?'}</span>
              </span>
            </div>
            <button
              onClick={returnToAdmin}
              className="text-[11px] font-semibold bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-lg hover:bg-cyan-500/30 transition-all"
            >
              ← Back to Admin
            </button>
          </div>
        </div>
      )}

      <header className={`sticky ${isImpersonating ? 'top-[36px]' : 'top-0'} z-50 glass`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            {showLogo && (logoUrl ? (
              <img src={logoUrl} alt={appName} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-lg font-bold">{appName?.[0] || ''}</span>
              </div>
            ))}
            <span className="font-display font-bold text-xl gradient-text">{appName}</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              to="/deposit"
              className="flex items-center gap-1.5 bg-dark-800/80 px-3 py-1.5 rounded-lg hover:bg-dark-700 transition-colors"
            >
              <Wallet size={14} className="text-primary-400" />
              <span className="font-semibold text-sm">
                ${user?.balance?.toFixed(2) || '0.00'}
              </span>
            </Link>

            {!isAdminView && (
              <>
                <Link
                  to="/cart"
                  className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-dark-800/80 transition-colors"
                >
                  <ShoppingCart size={18} className={cartCount > 0 ? 'text-primary-400' : 'text-dark-400'} />
                  {cartCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-primary-500 text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/orders"
                  className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-dark-800/80 transition-colors"
                >
                  <Package size={18} className="text-dark-400 hover:text-dark-200" />
                </Link>
              </>
            )}

            <Link
              to="/notifications"
              className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-dark-800/80 transition-colors"
            >
              <Bell size={18} className={unreadNotifs > 0 ? 'text-primary-400' : 'text-dark-400'} />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-red-500 text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadNotifs > 99 ? '99+' : unreadNotifs}
                </span>
              )}
            </Link>

            <Link
              to="/messages"
              className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-dark-800/80 transition-colors"
            >
              <MessageSquare size={18} className={unreadMessages > 0 ? 'text-primary-400' : 'text-dark-400'} />
              {unreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-primary-500 text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </Link>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-dark-800/80 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-accent-purple flex items-center justify-center overflow-hidden">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                  )}
                </div>
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden"
                    >
                      <div className="p-3 border-b border-dark-700">
                        <p className="font-medium text-sm">{user?.first_name || user?.username}</p>
                        <p className="text-xs text-dark-400">@{user?.username || 'guest'}</p>
                        {(user?.shop_name || user?.role === 'seller' || user?.role === 'admin') && (
                          <p className="text-[10px] text-primary-400 mt-1">
                            Viewing as: {effectiveRole === 'admin' ? 'Admin' : 'User'}
                          </p>
                        )}
                        {!user?.shop_name && (
                          <Link 
                            to="/settings?upgrade=true" 
                            className="flex items-center justify-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors text-white" 
                            onClick={() => setShowUserMenu(false)}
                          >
                            <Crown size={12} />
                            Start Selling
                          </Link>
                        )}
                      </div>
                      <div className="p-1">
                        <Link to="/settings" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-700 rounded-lg transition-colors" onClick={() => setShowUserMenu(false)}>
                          <Settings size={16} />
                          Settings
                        </Link>
                        <Link to="/deposit" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-700 rounded-lg transition-colors" onClick={() => setShowUserMenu(false)}>
                          <Wallet size={16} />
                          Deposit
                        </Link>
                        <Link to="/referrals" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-700 rounded-lg transition-colors text-pink-400" onClick={() => setShowUserMenu(false)}>
                          <Gift size={16} />
                          Referrals
                        </Link>
                        {(user?.shop_name || user?.role === 'admin') && (
                          <Link
                            to="/seller"
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-700 rounded-lg transition-colors w-full text-primary-400"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <LayoutDashboard size={16} />
                            Seller Dashboard
                          </Link>
                        )}
                        {!user?.shop_name && user?.role !== 'admin' && (
                          <Link
                            to="/settings?upgrade=true"
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-700 rounded-lg transition-colors w-full text-primary-400"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <LayoutDashboard size={16} />
                            Start Selling
                          </Link>
                        )}
                        {user?.role === 'admin' && (
                          <Link
                            to={effectiveRole === 'admin' ? '/?tab=support' : '/messages'}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-700 rounded-lg transition-colors w-full text-cyan-400"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <MessageSquare size={16} />
                            Support Chat
                          </Link>
                        )}
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => {
                              const next = effectiveRole === 'admin' ? 'buyer' : 'admin'
                              setViewRole(next)
                              setShowUserMenu(false)
                            }}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-700 rounded-lg transition-colors w-full text-left text-amber-400"
                          >
                            <User size={16} />
                            Switch to {effectiveRole === 'admin' ? 'User' : 'Admin'}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 glass border-t border-dark-800">
        <div className="max-w-4xl mx-auto px-2">
          <div className="flex justify-around py-1.5">
            {navItems.map(item => {
              const [itemPath, itemQuery] = item.path.split('?')
              const itemTab = itemQuery ? new URLSearchParams('?' + itemQuery).get('tab') : null
              const currentTab = new URLSearchParams(location.search).get('tab')

              let isActive
              if (itemTab) {
                isActive = location.pathname === itemPath && currentTab === itemTab
              } else if (itemPath === '/') {
                isActive = location.pathname === '/' && !currentTab
              } else {
                isActive = location.pathname === itemPath || location.pathname.startsWith(itemPath + '/')
              }
              const Icon = item.icon

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                    isActive ? 'text-primary-400' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute inset-0 bg-primary-500/10 rounded-lg"
                    />
                  )}
                  <div className="relative">
                    <Icon size={18} />
                    {item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary-500 text-[9px] font-bold rounded-full flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px]">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
    </div>
  )
}
