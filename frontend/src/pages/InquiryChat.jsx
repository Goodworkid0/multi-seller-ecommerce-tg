import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ArrowLeft, Send, Package, ShoppingCart, X, Check,
  MoreVertical, AlertCircle, User
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'

export default function InquiryChat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { branding } = useBrandingStore()
  const addItem = useCartStore(state => state.addItem)
  
  const [inquiry, setInquiry] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    loadInquiry()
    loadMessages()
    
    // Poll for new messages
    const interval = setInterval(loadMessages, 5000)
    return () => clearInterval(interval)
  }, [id])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadInquiry = async () => {
    try {
      const { data } = await api.get(`/api/inquiries/${id}`)
      setInquiry(data)
    } catch (err) {
      console.error('Failed to load inquiry:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async () => {
    try {
      const { data } = await api.get(`/api/inquiries/${id}/messages`)
      setMessages(data)
    } catch (err) {
      console.error('Failed to load messages:', err)
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
      const { data } = await api.post(`/api/inquiries/${id}/messages`, {
        content: newMessage.trim()
      })
      setMessages(prev => [...prev, data])
      setNewMessage('')
      inputRef.current?.focus()
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const handleClose = async () => {
    try {
      await api.post(`/api/inquiries/${id}/close`)
      navigate('/inquiries')
    } catch (err) {
      console.error('Failed to close inquiry:', err)
    }
  }

  const handleAddToCart = async () => {
    if (!inquiry) return
    try {
      const { data } = await api.get(`/api/products/${inquiry.product_id}`)
      addItem(data, 1)
      // Show feedback or navigate to cart
    } catch (err) {
      console.error('Failed to load product:', err)
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

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const date = formatDate(msg.created_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  const isBuyer = inquiry?.buyer_id === user?.id

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-dark-700 border-t-primary-500" />
      </div>
    )
  }

  if (!inquiry) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-4" />
        <div className="text-dark-400 mb-4">Inquiry not found</div>
        <Link 
          to="/inquiries" 
          className="text-sm px-4 py-2 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          Back to Messages
        </Link>
      </div>
    )
  }

  const otherUser = isBuyer ? 
    { name: inquiry.seller_username, avatar: inquiry.seller_avatar } :
    { name: inquiry.buyer_username, avatar: inquiry.buyer_avatar }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-dark-800 mb-4">
        <Link to="/inquiries" className="p-1 hover:bg-dark-800 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-dark-400" />
        </Link>
        
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-dark-700 overflow-hidden flex-shrink-0">
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
          <div className="min-w-0">
            <div className="font-medium truncate">@{otherUser.name || 'user'}</div>
            <Link 
              to={`/products/${inquiry.product_id}`}
              className="text-xs text-dark-400 hover:text-primary-400 transition-colors truncate block"
            >
              {inquiry.product_name}
            </Link>
          </div>
        </div>

        {/* Actions Menu */}
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
          >
            <MoreVertical size={18} className="text-dark-400" />
          </button>
          
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-dark-800 border border-dark-700 rounded-xl overflow-hidden z-20 min-w-[160px]">
                <Link
                  to={`/products/${inquiry.product_id}`}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-dark-200 hover:bg-dark-700 transition-colors"
                >
                  <Package size={16} />
                  View Product
                </Link>
                {isBuyer && (
                  <button
                    onClick={() => { handleAddToCart(); setShowMenu(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-dark-200 hover:bg-dark-700 transition-colors"
                  >
                    <ShoppingCart size={16} />
                    Add to Cart
                  </button>
                )}
                {inquiry.is_active && (
                  <button
                    onClick={() => { handleClose(); setShowMenu(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-dark-700 transition-colors"
                  >
                    <X size={16} />
                    Close Chat
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date}>
            <div className="flex items-center justify-center mb-3">
              <span className="px-3 py-1 bg-dark-800 rounded-full text-xs text-dark-400">
                {date}
              </span>
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
                        {isOwn && msg.is_read && (
                          <Check size={12} />
                        )}
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

      {/* Closed Notice */}
      {!inquiry.is_active && (
        <div className="py-3 px-4 bg-dark-800 rounded-xl text-center text-dark-400 text-sm mt-4">
          This conversation has been closed
        </div>
      )}

      {/* Input */}
      {inquiry.is_active && (
        <form onSubmit={handleSend} className="flex items-center gap-2 pt-4 mt-auto">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-dark-50 placeholder:text-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-all disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </form>
      )}
    </div>
  )
}
