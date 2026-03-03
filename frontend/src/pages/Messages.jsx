import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageCircle, User, ChevronRight, Tag, Headphones } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

const timeAgo = (dateStr) => {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export default function Messages() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [startingSupport, setStartingSupport] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/dm')
      setConversations(data)
    } catch {
      setConversations([])
    } finally {
      setLoading(false)
    }
    // Also refresh the unread badge in the header
    try {
      const [dmRes, inqRes] = await Promise.all([
        api.get('/api/dm/unread-count'),
        api.get('/api/inquiries/unread-count')
      ])
      const total = (dmRes.data.count || 0) + (inqRes.data.count || 0)
      window.dispatchEvent(new CustomEvent('messages-unread-updated', { detail: { count: total } }))
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Messages</h1>
          <p className="text-dark-400 text-xs">Direct conversations</p>
        </div>
        <button onClick={load} className="text-xs text-dark-400 hover:text-dark-50 transition-colors">Refresh</button>
      </div>

      {/* Message Support Button */}
      {!!user && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={async () => {
            setStartingSupport(true)
            try {
              const { data } = await api.post('/api/dm/start-support', { content: 'Hi, I need help.' })
              navigate(`/messages/${data.conversation_id}`)
            } catch (e) {
              alert(e.response?.data?.detail || 'Failed to start support chat')
            } finally {
              setStartingSupport(false)
            }
          }}
          disabled={startingSupport}
          className="w-full p-4 flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent hover:from-cyan-500/15 hover:border-cyan-500/40 transition-all active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Headphones size={20} className="text-cyan-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-dark-50">Chat with Support</p>
            <p className="text-[11px] text-dark-400">Start a conversation with our team</p>
          </div>
          <ChevronRight size={16} className="text-cyan-500/50" />
        </motion.button>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-dark-800 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-dark-800 rounded" />
                  <div className="h-3 w-2/3 bg-dark-800 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="card p-8 text-center">
          <MessageCircle size={32} className="mx-auto text-dark-600 mb-3" />
          <p className="text-dark-400 text-sm mb-1">No messages yet</p>
          <p className="text-dark-500 text-xs">Send a message from a seller's profile or a WTB post.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {conversations.map((conv, i) => {
            const other = conv.other_user
            return (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Link
                  to={`/messages/${conv.id}`}
                  className="card p-3 flex items-center gap-3 group hover:border-primary-500/30 transition-all"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {other?.avatar_url ? (
                      <img src={other.avatar_url} className="w-10 h-10 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center">
                        <User size={18} className="text-dark-400" />
                      </div>
                    )}
                    {conv.unread_count > 0 && (
                      <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                        <span className="text-[9px] font-bold">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm font-medium truncate ${conv.unread_count > 0 ? 'text-dark-50' : 'text-dark-200'}`}>
                        {other?.first_name || other?.username || 'User'}
                      </span>
                      <span className="text-[10px] text-dark-500 flex-shrink-0 ml-2">{timeAgo(conv.last_message_at)}</span>
                    </div>
                    <p className={`text-xs truncate ${conv.unread_count > 0 ? 'text-dark-300 font-medium' : 'text-dark-500'}`}>
                      {conv.last_message || 'No messages yet'}
                    </p>
                    {conv.context_label && (
                      <div className="flex items-center gap-1 mt-1">
                        <Tag size={10} className="text-dark-600" />
                        <span className="text-[10px] text-dark-600 truncate">{conv.context_label}</span>
                      </div>
                    )}
                  </div>

                  <ChevronRight size={16} className="text-dark-700 group-hover:text-dark-500 flex-shrink-0" />
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
