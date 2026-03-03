import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Send, Check, User, Tag, AlertCircle } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

export default function DMChat() {
  const { id } = useParams()
  const { user } = useAuthStore()
  const [conv, setConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    loadConversation()
    const interval = setInterval(loadConversation, 5000)
    return () => clearInterval(interval)
  }, [id])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadConversation = async () => {
    try {
      const { data } = await api.get(`/api/dm/${id}`)
      setConv(data)
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Failed to load conversation:', err)
    } finally {
      setLoading(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || sending) return
    setSending(true)
    try {
      const { data } = await api.post(`/api/dm/${id}/messages`, {
        content: newMessage.trim()
      })
      setMessages(prev => [...prev, data])
      setNewMessage('')
      inputRef.current?.focus()
    } catch (err) {
      console.error('Failed to send:', err)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const groupedMessages = messages.reduce((groups, msg) => {
    const date = formatDate(msg.created_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-dark-700 border-t-primary-500" />
      </div>
    )
  }

  if (!conv) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-4" />
        <div className="text-dark-400 mb-4">Conversation not found</div>
        <Link
          to="/messages"
          className="text-sm px-4 py-2 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          Back to Messages
        </Link>
      </div>
    )
  }

  const other = conv.other_user

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-dark-800 mb-4">
        <Link to="/messages" className="p-1 hover:bg-dark-800 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-dark-400" />
        </Link>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-dark-700 overflow-hidden flex-shrink-0">
            {other?.avatar_url ? (
              <img
                src={other.avatar_url.startsWith('http') ? other.avatar_url : `${import.meta.env.VITE_API_URL || ''}${other.avatar_url}`}
                alt={other.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-500/20 to-accent-purple/20">
                <User size={18} className="text-primary-400" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <Link
              to={other?.role === 'seller' || other?.role === 'admin' ? `/shop/${other.id}` : '#'}
              className="font-medium truncate block hover:text-primary-400 transition-colors"
            >
              {other?.first_name || `@${other?.username}` || 'User'}
            </Link>
            {conv.context_label && (
              <div className="flex items-center gap-1">
                <Tag size={10} className="text-dark-500" />
                <span className="text-xs text-dark-500 truncate">{conv.context_label}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date}>
            <div className="flex items-center justify-center mb-3">
              <span className="px-3 py-1 bg-dark-800 rounded-full text-xs text-dark-400">{date}</span>
            </div>
            <div className="space-y-2">
              {msgs.map((msg, i) => {
                const isOwn = msg.sender_id === user?.id
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${
                        isOwn
                          ? 'bg-primary-500 text-white rounded-br-md'
                          : 'bg-dark-800 text-dark-100 rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 ${isOwn ? 'text-white/60' : 'text-dark-500'}`}>
                        <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                        {isOwn && msg.is_read && <Check size={12} />}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}

        {messages.length === 0 && (
          <div className="text-center py-8 text-dark-500 text-sm">
            No messages yet. Start the conversation!
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 pt-4 mt-auto">
        <input
          ref={inputRef}
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-dark-50 placeholder:text-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
          disabled={sending}
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="p-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-all disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
