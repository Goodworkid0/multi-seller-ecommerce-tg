import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Settings, ArrowLeft, DollarSign, ShoppingCart, Briefcase, Gavel, ChevronRight, MessageSquare, AlertTriangle, Clock } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { motion } from 'framer-motion'
import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'

export default function SellerLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [stats, setStats] = useState({ pending_balance: 0, open_disputes: 0 })

  // Role guard — only users with a shop set up can access seller dashboard
  useEffect(() => {
    if (user && !user.shop_name && user.role !== 'admin') {
      navigate('/settings?upgrade=true', { replace: true })
    }
  }, [user, navigate])

  // Only go home from dashboard, otherwise go back in history
  const handleBack = () => {
    if (location.pathname === '/seller') {
      navigate('/')
    } else {
      navigate(-1)
    }
  }

  const refreshData = useCallback(async () => {
    if (!user || !token) return
    try {
      const [unreadRes, statsRes] = await Promise.all([
        api.get('/api/inquiries/unread-count?role=seller'),
        api.get('/api/sellers/stats')
      ])
      setUnreadMessages(unreadRes.data.count || 0)
      setStats({
        escrow_amount: statsRes.data.escrow_amount || 0,
        open_disputes: statsRes.data.open_disputes || 0
      })
    } catch {}
  }, [user, token])

  useEffect(() => {
    refreshData()
    const interval = setInterval(refreshData, 30000)
    return () => clearInterval(interval)
  }, [refreshData])

  const navItems = [
    { path: '/seller', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/seller/messages', icon: MessageSquare, label: 'Messages', badge: unreadMessages },
    { path: '/seller/orders', icon: ShoppingCart, label: 'Orders' },
  ]

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-dark-900 border-r border-dark-800">
        <div className="p-4 border-b border-dark-800">
          <button onClick={handleBack} className="flex items-center gap-2 text-dark-400 hover:text-dark-50 mb-4">
            <ArrowLeft size={18} />
            <span>{location.pathname === '/seller' ? 'Back to Home' : 'Back'}</span>
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center font-bold">
              {user?.shop_name?.[0] || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{user?.shop_name || 'My Shop'}</h3>
                {(user?.collateral || 0) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded font-medium shrink-0">
                    ${user.collateral.toFixed(0)}
                  </span>
                )}
              </div>
              {user?.shop_description && (
                <p className="text-xs text-dark-400 truncate">{user.shop_description}</p>
              )}
            </div>
          </div>
          
          {/* Wallet Stats */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-dark-400 flex items-center gap-1.5">
                <DollarSign size={12} className="text-green-400" />
                Available
              </span>
              <span className="font-semibold text-green-400">${(user?.balance || 0).toFixed(2)}</span>
            </div>
            {stats.pending_balance > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-dark-400 flex items-center gap-1.5">
                  <Clock size={12} className="text-amber-400" />
                  Pending
                </span>
                <span className="font-semibold text-amber-400">${stats.pending_balance.toFixed(2)}</span>
              </div>
            )}
            {stats.open_disputes > 0 && (
              <Link 
                to="/seller/orders?filter=disputed" 
                className="flex justify-between items-center bg-red-500/10 px-2 py-1.5 rounded-lg -mx-2 hover:bg-red-500/15 transition-colors"
              >
                <span className="text-red-400 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  {stats.open_disputes} Dispute{stats.open_disputes > 1 ? 's' : ''}
                </span>
                <ChevronRight size={14} className="text-red-400" />
              </Link>
            )}
          </div>
        </div>
        
        <nav className="flex-1 p-4">
          {navItems.map(item => {
            const isActive = location.pathname === item.path
            const Icon = item.icon
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                  isActive
                    ? 'bg-primary-500/10 text-primary-400'
                    : 'text-dark-400 hover:bg-dark-800 hover:text-dark-50'
                }`}
              >
                <Icon size={20} />
                <span className="flex-1">{item.label}</span>
                {item.badge > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-[10px] font-semibold bg-primary-500 text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
          <Link
            to="/seller/settings"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
              location.pathname === '/seller/settings'
                ? 'bg-primary-500/10 text-primary-400'
                : 'text-dark-400 hover:bg-dark-800 hover:text-dark-50'
            }`}
          >
            <Settings size={20} />
            <span>Settings</span>
          </Link>
        </nav>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-50 glass border-b border-dark-800">
        <div className="px-4 py-2">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={handleBack} className="text-dark-400 hover:text-dark-50">
              <ArrowLeft size={20} />
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-sm font-bold">
              {user?.shop_name?.[0] || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-sm truncate">{user?.shop_name || 'My Shop'}</h1>
                {(user?.collateral || 0) > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded font-medium shrink-0">
                    ${user.collateral.toFixed(0)}
                  </span>
                )}
              </div>
              {user?.shop_description && (
                <p className="text-[10px] text-dark-400 truncate">{user.shop_description}</p>
              )}
            </div>
          </div>
          
          {/* Wallet Stats */}
          <div className="flex items-center gap-3 text-[10px] pl-8">
            <div className="flex items-center gap-1">
              <DollarSign size={10} className="text-green-400" />
              <span className="text-dark-400">Available</span>
              <span className="text-green-400 font-semibold">${(user?.balance || 0).toFixed(2)}</span>
            </div>
            {stats.pending_balance > 0 && (
              <div className="flex items-center gap-1">
                <Clock size={10} className="text-amber-400" />
                <span className="text-dark-400">Pending</span>
                <span className="text-amber-400 font-semibold">${stats.pending_balance.toFixed(2)}</span>
              </div>
            )}
            {stats.open_disputes > 0 && (
              <Link to="/seller/orders?filter=disputed" className="flex items-center gap-1 text-red-400">
                <AlertTriangle size={10} />
                <span>{stats.open_disputes} Dispute{stats.open_disputes > 1 ? 's' : ''}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="md:ml-64 p-4 md:p-8 pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-dark-800">
        <div className="max-w-4xl mx-auto px-2">
          <div className="flex justify-around py-1.5">
            {navItems.map(item => {
              const isActive = location.pathname === item.path
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
                      layoutId="seller-nav-indicator"
                      className="absolute inset-0 bg-primary-500/10 rounded-lg"
                    />
                  )}
                  <div className="relative">
                    <Icon size={18} />
                    {item.badge > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] flex items-center justify-center px-0.5 rounded-full text-[8px] font-bold bg-primary-500 text-white">
                        {item.badge > 9 ? '9+' : item.badge}
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
