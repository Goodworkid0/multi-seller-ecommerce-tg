import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, MessageSquare, Gavel, ChevronRight, ShoppingCart, CheckCircle, AlertTriangle, ArrowUpCircle, Wallet, XCircle, Gift, ShieldAlert } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'

const TYPE_META = {
  order_paid:          { icon: ShoppingCart,    color: 'text-green-400',  bg: 'bg-green-500/10' },
  order_status_update: { icon: CheckCircle,     color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
  order_confirmed:     { icon: CheckCircle,     color: 'text-green-400',  bg: 'bg-green-500/10' },
  order_completed:     { icon: CheckCircle,     color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
  status_changed:      { icon: CheckCircle,     color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
  seller_expiring_soon:{ icon: AlertTriangle,   color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  seller_expired:      { icon: XCircle,         color: 'text-red-400',    bg: 'bg-red-500/10' },
  admin_announcement:  { icon: Bell,            color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
  dispute_opened:      { icon: AlertTriangle,   color: 'text-red-400',    bg: 'bg-red-500/10' },
  dispute_escalated:   { icon: ArrowUpCircle,   color: 'text-orange-400', bg: 'bg-orange-500/10' },
  dispute_message:     { icon: MessageSquare,    color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  dispute_resolved:    { icon: Gavel,            color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  deposit_credited:    { icon: Wallet,           color: 'text-green-400',  bg: 'bg-green-500/10' },
  withdrawal_approved: { icon: Wallet,           color: 'text-green-400',  bg: 'bg-green-500/10' },
  withdrawal_rejected: { icon: XCircle,          color: 'text-red-400',    bg: 'bg-red-500/10' },
  promo_bonus200:      { icon: Gift,             color: 'text-purple-400', bg: 'bg-purple-500/10' },
  admin_warning:       { icon: ShieldAlert,      color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  wtb_reply:           { icon: MessageSquare,    color: 'text-teal-400',   bg: 'bg-teal-500/10' },
  giveaway_won:        { icon: Gift,             color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  giveaway_ended:      { icon: Gift,             color: 'text-dark-400',   bg: 'bg-dark-700' },
}

export default function Notifications() {
  const { token } = useAuthStore()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const loadNotifications = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const { data: items } = await api.get('/api/notifications')
      setNotifications(items)
      const count = items.filter(n => !n.is_read).length
      window.dispatchEvent(new CustomEvent('notifications-unread-updated', { detail: { count } }))
    } catch (e) {
      console.error('Failed to load notifications', e)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [token, loadNotifications])

  const markAllRead = async () => {
    try {
      await api.post('/api/notifications/mark-read')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      window.dispatchEvent(new CustomEvent('notifications-unread-updated', { detail: { count: 0 } }))
    } catch (e) {
      console.error(e)
    }
  }

  const handleClick = async (notif) => {
    // Mark as read
    if (!notif.is_read) {
      try {
        await api.post(`/api/notifications/${notif.id}/read`)
        setNotifications(prev => {
          const next = prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
          const count = next.filter(n => !n.is_read).length
          window.dispatchEvent(new CustomEvent('notifications-unread-updated', { detail: { count } }))
          return next
        })
      } catch (e) { /* ignore */ }
    }
    if (notif.link) navigate(notif.link)
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={22} className="text-primary-400" />
          <h1 className="text-xl font-display font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-primary-500 text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            <CheckCheck size={14} />
            Read all
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-dark-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-dark-700 rounded w-3/4" />
                  <div className="h-3 bg-dark-700 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card p-8 text-center">
          <Bell size={40} className="mx-auto text-dark-600 mb-3" />
          <p className="text-dark-400">No notifications yet</p>
          <p className="text-dark-500 text-sm mt-1">Orders, deposits, disputes — all updates show up here</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {notifications.map((notif, idx) => {
              const meta = TYPE_META[notif.type] || { icon: Bell, color: 'text-dark-400', bg: 'bg-dark-700' }
              const Icon = meta.icon
              return (
                <motion.button
                  key={notif.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left card p-3 flex items-start gap-3 transition-colors hover:bg-dark-800/60 ${
                    !notif.is_read ? 'border-l-2 border-l-primary-500 bg-primary-500/5' : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={18} className={meta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-tight ${!notif.is_read ? 'text-dark-50' : 'text-dark-300'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-dark-400 mt-0.5 line-clamp-2">{notif.body}</p>
                    )}
                    <p className="text-[10px] text-dark-500 mt-1">{timeAgo(notif.created_at)}</p>
                  </div>
                  <ChevronRight size={16} className="text-dark-600 flex-shrink-0 mt-1" />
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
