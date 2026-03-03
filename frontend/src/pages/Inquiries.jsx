import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  MessageCircle, ArrowLeft, Package, User, Clock, 
  MessageSquare, ChevronRight, Store
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

export default function Inquiries() {
  const { user } = useAuthStore()
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'seller'
  
  const isSeller = user?.role === 'seller' || user?.role === 'admin'

  useEffect(() => {
    loadInquiries()
  }, [filter])

  const loadInquiries = async () => {
    try {
      setLoading(true)
      const params = filter === 'seller' ? '?role=seller' : ''
      const { data } = await api.get(`/api/inquiries${params}`)
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

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/" className="p-1 hover:bg-dark-800 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-dark-400" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Messages</h1>
          <p className="text-dark-400 text-sm">Your conversations</p>
        </div>
      </div>

      {/* Filter Tabs - Only show for sellers */}
      {isSeller && (
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('seller')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
              filter === 'seller'
                ? 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            <Store size={14} />
            Shop Inquiries
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded-xl bg-dark-700" />
                <div className="flex-1">
                  <div className="h-4 bg-dark-700 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-dark-700 rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inquiry List */}
      {!loading && inquiries.length > 0 && (
        <div className="space-y-2">
          {inquiries.map((inq, i) => {
            const isBuyer = inq.buyer_id === user?.id
            const otherUser = isBuyer ? 
              { name: inq.seller_username, avatar: inq.seller_avatar } :
              { name: inq.buyer_username, avatar: inq.buyer_avatar }
            
            return (
              <motion.div
                key={inq.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  to={`/inquiries/${inq.id}`}
                  className="card p-3 flex items-center gap-3 hover:border-primary-500/30 transition-all"
                >
                  {/* Avatar / Product Image */}
                  <div className="w-11 h-11 rounded-xl bg-dark-700 overflow-hidden flex-shrink-0">
                    {otherUser.avatar ? (
                      <img 
                        src={otherUser.avatar.startsWith('http') ? otherUser.avatar : `${import.meta.env.VITE_API_URL || ''}${otherUser.avatar}`}
                        alt={otherUser.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-500/20 to-accent-purple/20">
                        <User size={18} className="text-primary-400" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">@{otherUser.name || 'user'}</span>
                      {isSeller && !isBuyer && (
                        <span className="px-1.5 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan text-[9px] font-medium">
                          SHOP
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-dark-400 truncate">{inq.product_name}</span>
                    </div>
                    {inq.last_message && (
                      <p className="text-xs text-dark-500 mt-1 truncate">
                        {inq.last_message}
                      </p>
                    )}
                  </div>

                  {/* Right side */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-dark-500">{timeAgo(inq.last_message_at)}</span>
                    {inq.unread_count > 0 && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-[10px] font-semibold bg-primary-500 text-white">
                        {inq.unread_count}
                      </span>
                    )}
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && inquiries.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-dark-800 rounded-full flex items-center justify-center mb-4">
            <MessageSquare size={28} className="text-dark-600" />
          </div>
          <div className="text-dark-300 mb-1">No conversations yet</div>
          <div className="text-dark-500 text-sm">
            Contact sellers from product pages to start a chat
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
          >
            <Package size={18} />
            Browse Products
          </Link>
        </div>
      )}
    </div>
  )
}
