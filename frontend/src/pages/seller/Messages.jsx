import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, User, Package, Clock } from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

export default function SellerMessages() {
  const { user } = useAuthStore()
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInquiries()
  }, [])

  const loadInquiries = async () => {
    try {
      setLoading(true)
      // Only load seller inquiries (where user is the seller)
      const { data } = await api.get('/api/inquiries?role=seller')
      setInquiries(data)
    } catch (err) {
      console.error('Failed to load inquiries:', err)
    } finally {
      setLoading(false)
    }
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    return `${days}d`
  }

  const totalUnread = inquiries.reduce((sum, inq) => sum + (inq.unread_count || 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Shop Messages</h1>
          <p className="text-dark-400 text-sm">Inquiries from buyers</p>
        </div>
        {totalUnread > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-primary-500/20 text-primary-400 text-xs font-semibold">
            {totalUnread} unread
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-3 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-dark-700" />
                <div className="flex-1">
                  <div className="h-4 bg-dark-700 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-dark-700 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inquiry List */}
      {!loading && inquiries.length > 0 && (
        <div className="space-y-1.5">
          {inquiries.map((inq, i) => (
            <motion.div
              key={inq.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link
                to={`/inquiries/${inq.id}`}
                className="card px-3 py-2.5 flex items-center gap-3 hover:bg-dark-800/80 transition-all"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-lg bg-dark-700 overflow-hidden flex-shrink-0">
                  {inq.buyer_avatar ? (
                    <img 
                      src={inq.buyer_avatar.startsWith('http') ? inq.buyer_avatar : `${import.meta.env.VITE_API_URL || ''}${inq.buyer_avatar}`}
                      alt={inq.buyer_username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-500/20 to-accent-purple/20">
                      <User size={14} className="text-primary-400" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      @{inq.buyer_username || 'buyer'}
                    </span>
                    <span className="text-[10px] text-dark-500">{timeAgo(inq.last_message_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Package size={10} className="text-dark-500 flex-shrink-0" />
                    <span className="text-[11px] text-dark-400 truncate">{inq.product_name}</span>
                  </div>
                  {inq.last_message && (
                    <p className="text-[11px] text-dark-500 mt-0.5 truncate">
                      {inq.last_message}
                    </p>
                  )}
                </div>

                {/* Unread badge */}
                {inq.unread_count > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-[10px] font-semibold bg-primary-500 text-white flex-shrink-0">
                    {inq.unread_count}
                  </span>
                )}
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && inquiries.length === 0 && (
        <div className="card p-8 text-center">
          <div className="w-14 h-14 mx-auto bg-dark-800 rounded-full flex items-center justify-center mb-3">
            <MessageSquare size={24} className="text-dark-600" />
          </div>
          <div className="text-dark-300 text-sm mb-1">No buyer inquiries yet</div>
          <p className="text-dark-500 text-xs">
            Buyers can message you from your product pages
          </p>
        </div>
      )}
    </div>
  )
}
