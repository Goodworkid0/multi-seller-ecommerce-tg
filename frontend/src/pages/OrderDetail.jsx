import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Package, Clock, Check, AlertTriangle, Copy,
  Send, MessageCircle, Shield, X, RefreshCw, Star, ThumbsUp, ThumbsDown
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../components/Toast'

const statusConfig = {
  pending: { color: 'bg-yellow-500/15 text-yellow-400', label: 'Pending' },
  paid: { color: 'bg-blue-500/15 text-blue-400', label: 'Paid' },
  delivered: { color: 'bg-emerald-500/15 text-emerald-400', label: 'Delivered' },
  completed: { color: 'bg-green-500/15 text-green-400', label: 'Completed' },
  disputed: { color: 'bg-red-500/15 text-red-400', label: 'Under Review' },
  cancelled: { color: 'bg-dark-700 text-dark-400', label: 'Cancelled' },
  refunded: { color: 'bg-orange-500/15 text-orange-400', label: 'Refunded' },
}

const getApiErrorMessage = (err, fallback) => {
  const detail = err?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail) && detail.length) {
    const first = detail[0]
    if (typeof first === 'string' && first.trim()) return first
    if (first?.msg) return first.msg
    if (first?.message) return first.message
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message
    if (typeof detail.msg === 'string' && detail.msg.trim()) return detail.msg
  }

  if (typeof err?.message === 'string' && err.message.trim()) return err.message
  return fallback
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, haptic } = useAuthStore()
  const { addToast } = useToast()
  const messagesEndRef = useRef(null)

  const [order, setOrder] = useState(null)
  const [messages, setMessages] = useState([])
  const [dispute, setDispute] = useState(null)
  const [loading, setLoading] = useState(true)

  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeError, setDisputeError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [resolving, setResolving] = useState(null) // 'refund' | 'complete' | null
  const [adminNote, setAdminNote] = useState('')
  const [showAdminResolve, setShowAdminResolve] = useState(false)
  const [buyerResolving, setBuyerResolving] = useState(false)

  // Review state
  const [reviewedProducts, setReviewedProducts] = useState({}) // product_id -> { rating, comment, created_at } or true
  const [reviewForms, setReviewForms] = useState({}) // product_id -> { rating, comment, open }
  const [submittingReview, setSubmittingReview] = useState(null)
  const prevMsgCount = useRef(null)
  
  // Feedback/Rep state
  const [feedbacks, setFeedbacks] = useState([])
  const [myFeedback, setMyFeedback] = useState(null)
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [feedbackComment, setFeedbackComment] = useState('')

  useEffect(() => {
    window.scrollTo(0, 0)
    loadOrder()
    loadMessages()
    loadDispute()
    loadFeedback()
    // Poll messages every 10s
    const interval = setInterval(loadMessages, 10000)
    return () => clearInterval(interval)
  }, [id])

  // Check which products have been reviewed for this order
  useEffect(() => {
    if (order && ['completed', 'delivered'].includes(order.status)) {
      checkReviewed()
    }
  }, [order])

  const checkReviewed = async () => {
    if (!order?.items) return
    const reviewed = {}
    for (const item of order.items) {
      // Skip auction items - they don't have product reviews
      if (!item.product_id) continue
      try {
        const { data } = await api.get(`/api/products/${item.product_id}/reviews`)
        const buyerReview = data.find(r => r.reviewer_id === order.buyer_id && r.order_id === order.id)
        if (buyerReview) {
          reviewed[item.product_id] = {
            rating: buyerReview.rating,
            comment: buyerReview.comment,
            created_at: buyerReview.created_at,
            reviewer_username: buyerReview.reviewer?.username || 'Buyer'
          }
        }
      } catch {}
    }
    setReviewedProducts(reviewed)
  }

  useEffect(() => {
    // Only auto-scroll when NEW messages arrive, not on initial load
    if (prevMsgCount.current !== null && messages.length > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMsgCount.current = messages.length
  }, [messages])

  const loadOrder = async () => {
    try {
      const { data } = await api.get(`/api/orders/${id}`)
      setOrder(data)
    } catch {
      navigate('/orders')
    } finally {
      setLoading(false)
      setTimeout(() => window.scrollTo(0, 0), 0)
    }
  }

  const loadMessages = async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const { data } = await api.get(`/api/orders/${id}/messages`)
      setMessages(data)
    } catch {}
  }

  const loadDispute = async () => {
    try {
      const { data } = await api.get(`/api/orders/${id}/dispute`)
      setDispute(data)
    } catch {
      setDispute(null)
    }
  }

  const loadFeedback = async () => {
    try {
      const { data } = await api.get(`/api/orders/${id}/feedback`)
      setFeedbacks(data)
      // Check if current user already left feedback
      const mine = data.find(f => f.from_user_id === user?.id)
      setMyFeedback(mine || null)
    } catch {
      setFeedbacks([])
    }
  }

  const submitFeedback = async (isPositive) => {
    setSubmittingFeedback(true)
    try {
      await api.post(`/api/orders/${id}/feedback`, { 
        is_positive: isPositive,
        comment: feedbackComment.trim() || null
      })
      loadFeedback()
      setFeedbackComment('')
    } catch (err) {
      console.error(err)
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!messageInput.trim() || sending) return
    setSending(true)
    try {
      await api.post(`/api/orders/${id}/messages`, { content: messageInput.trim() })
      setMessageInput('')
      loadMessages()
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to send'), { type: 'error' })
    } finally {
      setSending(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await api.post(`/api/orders/${id}/confirm`)
      haptic?.('success')
      loadOrder()
      loadMessages()
      window.dispatchEvent(new Event('refresh-signals'))
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to confirm'), { type: 'error' })
    } finally {
      setConfirming(false)
    }
  }

  const handleOpenDispute = async (e) => {
    e.preventDefault()
    const reason = disputeReason.trim()
    if (!reason) {
      setDisputeError('Report message is required.')
      return
    }
    if (reason.length < 10) {
      setDisputeError('Report must have at least 10 characters.')
      return
    }
    setDisputeError('')
    try {
      await api.post(`/api/orders/${id}/dispute`, { reason })
      setShowDisputeForm(false)
      setDisputeReason('')
      setDisputeError('')
      haptic?.('warning')
      loadOrder()
      loadMessages()
      loadDispute()
      window.dispatchEvent(new Event('refresh-signals'))
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to request review'), { type: 'error' })
    }
  }

  const handleEscalate = async () => {
    setEscalating(true)
    try {
      await api.post(`/api/orders/${id}/dispute/escalate`)
      haptic?.('warning')
      loadDispute()
      loadMessages()
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to escalate'), { type: 'error' })
    } finally {
      setEscalating(false)
    }
  }

  const handleBuyerResolve = async () => {
    setBuyerResolving(true)
    try {
      await api.post(`/api/orders/${id}/dispute/resolve-buyer`)
      haptic?.('success')
      loadOrder()
      loadDispute()
      loadMessages()
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to resolve'), { type: 'error' })
    } finally {
      setBuyerResolving(false)
    }
  }

  const handleAdminResolve = async (action) => {
    setResolving(action)
    try {
      await api.post(`/api/admin/disputes/${dispute.id}/resolve`, {
        action,
        resolution: adminNote.trim() || (action === 'refund_buyer' ? 'Refunded by admin' : 'Completed by admin')
      })
      haptic?.('success')
      setShowAdminResolve(false)
      setAdminNote('')
      loadOrder()
      loadDispute()
      loadMessages()
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to resolve'), { type: 'error' })
    } finally {
      setResolving(null)
    }
  }

  const copyKey = (key) => {
    navigator.clipboard.writeText(key)
    haptic?.('light')
  }

  const toggleReviewForm = (productId) => {
    setReviewForms(prev => ({
      ...prev,
      [productId]: prev[productId]?.open
        ? { ...prev[productId], open: false }
        : { rating: 5, comment: '', open: true, ...(prev[productId] || {}) }
    }))
  }

  const setReviewRating = (productId, rating) => {
    setReviewForms(prev => ({
      ...prev,
      [productId]: { ...prev[productId], rating }
    }))
  }

  const setReviewComment = (productId, comment) => {
    setReviewForms(prev => ({
      ...prev,
      [productId]: { ...prev[productId], comment }
    }))
  }

  const submitReview = async (productId) => {
    const form = reviewForms[productId]
    if (!form || submittingReview) return
    setSubmittingReview(productId)
    try {
      await api.post(`/api/products/${productId}/reviews`, {
        product_id: productId,
        order_id: parseInt(id),
        rating: form.rating,
        comment: form.comment || null
      })
      haptic?.('success')
      setReviewedProducts(prev => ({ ...prev, [productId]: { rating: form.rating, comment: form.comment || null, created_at: new Date().toISOString() } }))
      setReviewForms(prev => ({ ...prev, [productId]: { ...prev[productId], open: false } }))
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to submit review'), { type: 'error' })
    } finally {
      setSubmittingReview(null)
    }
  }

  const timeLeft = (autoComplete) => {
    if (!autoComplete) return null
    const diff = new Date(autoComplete) - new Date()
    if (diff <= 0) return 'Auto-completing soon...'
    const hours = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    return `${hours}h ${mins}m left`
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-dark-800 rounded animate-pulse" />
        <div className="card animate-pulse p-6"><div className="h-6 w-1/3 bg-dark-800 rounded mb-3" /><div className="h-4 w-1/2 bg-dark-800 rounded" /></div>
      </div>
    )
  }

  if (!order) return null

  const status = statusConfig[order.status] || statusConfig.pending
  const isBuyer = order.buyer_id === user?.id
  const isAdmin = user?.role === 'admin'
  const canConfirm = isBuyer && order.status === 'delivered' && !order.is_buyer_confirmed
  const canDispute = isBuyer && order.status === 'delivered'
  const canMessage = !['pending', 'cancelled', 'completed'].includes(order.status)
  const showMessages = !['pending', 'cancelled'].includes(order.status)
  const canReview = isBuyer && ['completed', 'delivered'].includes(order.status)
  const showBuyerReview = !isBuyer && ['completed', 'delivered'].includes(order.status)

  // Warranty info from order items
  const maxWarranty = Math.max(...(order.items || []).map(i => i.product?.warranty_hours ?? 48), 0)
  const hasWarranty = maxWarranty > 0
  const warrantyLabel = maxWarranty < 24 ? `${maxWarranty}h` : `${Math.round(maxWarranty / 24)} day`
  const warrantyExpired = order.auto_complete_at && new Date(order.auto_complete_at) <= new Date()

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/orders')} className="p-2 rounded-lg hover:bg-dark-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-lg font-bold">Order #{order.id}</h1>
          <p className="text-xs text-dark-400">{new Date(order.created_at).toLocaleString()}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
      </div>

      {/* Auto-complete countdown */}
      {order.status === 'delivered' && order.auto_complete_at && (
        <div className={`card p-3 flex items-center gap-2.5 ${hasWarranty ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-dark-800/50 border border-dark-700'}`}>
          <Clock size={16} className={`flex-shrink-0 ${hasWarranty ? 'text-amber-400' : 'text-dark-500'}`} />
          <div className="flex-1">
            {hasWarranty ? (
              <>
                <p className="text-xs font-medium text-amber-300">Warranty expires in {timeLeft(order.auto_complete_at)}</p>
                <p className="text-[11px] text-dark-400">{warrantyLabel} warranty — report issues before it expires</p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-dark-300">Auto-completes in {timeLeft(order.auto_complete_at)}</p>
                <p className="text-[11px] text-dark-500">No warranty — you can still rate & report the seller</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dispute banner */}
      {dispute && dispute.status === 'open' && (
        <div className="card p-3 space-y-2 bg-red-500/5 border border-red-500/20">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium text-red-300">Under Review</p>
              <p className="text-[11px] text-dark-400">{dispute.reason}</p>
              <p className="text-[10px] text-dark-500 mt-1">Communicate with the other party below. Request admin if you can't resolve it.</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isBuyer && (
              <button onClick={handleBuyerResolve} disabled={buyerResolving} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors">
                {buyerResolving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                Release Funds
              </button>
            )}
            <button onClick={handleEscalate} disabled={escalating} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-colors">
              {escalating ? <RefreshCw size={13} className="animate-spin" /> : <Shield size={13} />}
              Request Admin Review
            </button>
          </div>
        </div>
      )}

      {dispute && dispute.status === 'escalated' && (
        <div className="card p-3 space-y-2 bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-start gap-2.5">
            <Shield size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-300">Admin Review Requested</p>
              <p className="text-[11px] text-dark-400">{dispute.reason}</p>
              <p className="text-[10px] text-dark-500 mt-1">An admin will join this conversation and make a decision.</p>
            </div>
          </div>
          {isBuyer && (
            <button onClick={handleBuyerResolve} disabled={buyerResolving} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors">
              {buyerResolving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
              Release Funds & Complete
            </button>
          )}
        </div>
      )}

      {/* Admin Resolve Actions */}
      {isAdmin && dispute && ['open', 'escalated'].includes(dispute.status) && (
        <div className="card p-3 space-y-3 bg-purple-500/5 border border-purple-500/20">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-purple-400" />
            <h3 className="text-sm font-semibold text-purple-300">Admin Actions</h3>
          </div>
          
          {!showAdminResolve ? (
            <button
              onClick={() => setShowAdminResolve(true)}
              className="w-full text-xs font-medium py-2 rounded-xl bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
            >
              Resolve This Dispute
            </button>
          ) : (
            <div className="space-y-2.5">
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                className="input min-h-[60px] text-sm"
                placeholder="Resolution note (optional)..."
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleAdminResolve('refund_buyer')}
                  disabled={!!resolving}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
                >
                  {resolving === 'refund_buyer' ? <RefreshCw size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                  Refund Buyer
                </button>
                <button
                  onClick={() => handleAdminResolve('favor_seller')}
                  disabled={!!resolving}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
                >
                  {resolving === 'favor_seller' ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                  Complete Order
                </button>
              </div>
              <button
                onClick={() => { setShowAdminResolve(false); setAdminNote('') }}
                className="w-full text-[11px] text-dark-500 hover:text-dark-300 py-1"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {dispute && !['open', 'escalated'].includes(dispute.status) && (
        <div className={`card p-3 space-y-1.5 ${order.status === 'refunded' ? 'bg-orange-500/5 border border-orange-500/20' : 'bg-emerald-500/5 border border-emerald-500/20'}`}>
          <div className="flex items-start gap-2.5">
            {order.status === 'refunded' ? (
              <AlertTriangle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
            ) : (
              <Check size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-xs font-medium ${order.status === 'refunded' ? 'text-orange-300' : 'text-emerald-300'}`}>
                {order.status === 'refunded' ? 'Buyer Refunded' : 'Dispute Resolved'}
              </p>
              {dispute.resolution && <p className="text-[11px] text-dark-400 mt-0.5">{dispute.resolution}</p>}
              {order.status === 'refunded' && (
                <p className="text-[11px] text-orange-400/70 mt-0.5 font-medium">${order.total_amount?.toFixed(2)} returned to buyer</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Items & Keys */}
      <div className="card p-3 space-y-3">
        <h3 className="text-sm font-semibold">Items</h3>
        {order.items?.map((item, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-dark-800 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package size={16} className="text-dark-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.auction?.title || item.product?.name || `Item #${item.product_id || item.auction_id}`}
                  {item.variant && <span className="text-primary-400 ml-1">({item.variant.name})</span>}
                  {item.auction_id && <span className="text-accent-cyan ml-1">(Auction)</span>}
                </p>
                <p className="text-[11px] text-dark-400">Qty {item.quantity} × ${item.price?.toFixed(2)}</p>
              </div>
              <span className="text-sm font-bold">${(item.price * item.quantity).toFixed(2)}</span>
            </div>

            {/* Delivered keys */}
            {item.delivered_keys?.length > 0 && (
              <div className="ml-13 space-y-1.5">
                <p className="text-[11px] text-dark-400">Your keys:</p>
                {item.delivered_keys.map((keyObj, k) => {
                  const keyVal = keyObj?.key_value || keyObj
                  return (
                    <div key={k} className="bg-dark-800 rounded-lg px-3 py-2 flex items-center justify-between">
                      <code className="text-xs text-primary-400 font-mono">{keyVal}</code>
                      <button onClick={() => copyKey(keyVal)} className="p-1 hover:bg-dark-700 rounded"><Copy size={12} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-dark-800">
          <span className="text-sm text-dark-400">Total</span>
          <span className="font-bold">${order.total_amount?.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      {(canConfirm || canDispute) && (
        <div className="flex gap-2">
          {canConfirm && (
            <button onClick={handleConfirm} disabled={confirming} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-2.5">
              {confirming ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              Confirm Order
            </button>
          )}
          {canDispute && !showDisputeForm && (
            <button onClick={() => { setShowDisputeForm(true); setDisputeError('') }} className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl flex items-center justify-center gap-2 text-sm py-2.5 transition-colors">
              <AlertTriangle size={14} /> Report Issue
            </button>
          )}
        </div>
      )}

      {/* Dispute Form */}
      <AnimatePresence>
        {showDisputeForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} onSubmit={handleOpenDispute} className="card p-4 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-400">Report Issue</h3>
              <button type="button" onClick={() => { setShowDisputeForm(false); setDisputeError('') }} className="p-1 hover:bg-dark-800 rounded"><X size={14} /></button>
            </div>
            {!hasWarranty && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                <p className="text-[11px] text-amber-300 font-medium">No Warranty</p>
                <p className="text-[10px] text-dark-400">This product has no warranty. Funds won't be returned, but your report helps keep sellers accountable.</p>
              </div>
            )}
            {hasWarranty && warrantyExpired && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                <p className="text-[11px] text-amber-300 font-medium">Warranty Expired</p>
                <p className="text-[10px] text-dark-400">The {warrantyLabel} warranty has expired. You can still report but a refund is not guaranteed.</p>
              </div>
            )}
            <textarea
              value={disputeReason}
              onChange={(e) => {
                setDisputeReason(e.target.value)
                if (disputeError) setDisputeError('')
              }}
              className="input min-h-[80px] text-sm"
              placeholder="Describe the issue with your order..."
              required
            />
            {disputeError && <p className="text-xs text-red-400">{disputeError}</p>}
            <p className="text-[11px] text-dark-500">
              {hasWarranty && !warrantyExpired 
                ? 'The auto-complete timer will be paused. An admin will review and may issue a refund.'
                : 'The seller will be notified. Repeated complaints may result in seller penalties.'
              }
            </p>
            <button type="submit" className="btn-primary w-full py-2 text-sm bg-red-500 hover:bg-red-600">Submit Report</button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Buyer Review (visible to seller/admin) */}
      {showBuyerReview && Object.keys(reviewedProducts).length > 0 && (
        <div className="card p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-yellow-400" />
            <h3 className="text-sm font-semibold">Buyer Review</h3>
          </div>
          {order.items?.map((item) => {
            const pid = item.product_id
            const review = reviewedProducts[pid]
            if (!review) return null
            return (
              <div key={pid} className="space-y-2">
                <p className="text-xs font-medium truncate">
                  {item.product?.name || `Product #${pid}`}
                  {item.variant && <span className="text-primary-400 ml-1">({item.variant.name})</span>}
                </p>
                <div className="bg-dark-800/50 rounded-lg px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(star => (
                      <Star key={star} size={13} className={star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-dark-600'} />
                    ))}
                    <span className="text-[10px] text-dark-500 ml-1">{review.rating}/5</span>
                  </div>
                  {review.comment && <p className="text-xs text-dark-300">{review.comment}</p>}
                  <p className="text-[10px] text-dark-500">by {review.reviewer_username} · {new Date(review.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reviews Section */}
      {canReview && (
        <div className="card p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-yellow-400" />
            <h3 className="text-sm font-semibold">Leave a Review</h3>
          </div>
          {order.items?.map((item) => {
            const pid = item.product_id
            const existingReview = reviewedProducts[pid]
            const isReviewed = !!existingReview
            const form = reviewForms[pid]
            return (
              <div key={pid} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium truncate flex-1">
                    {item.product?.name || `Product #${pid}`}
                    {item.variant && <span className="text-primary-400 ml-1">({item.variant.name})</span>}
                  </p>
                  {isReviewed ? (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Check size={12} /> Reviewed</span>
                  ) : (
                    <button onClick={() => toggleReviewForm(pid)} className="text-[11px] text-primary-400 hover:text-primary-300">
                      {form?.open ? 'Cancel' : 'Write Review'}
                    </button>
                  )}
                </div>

                {/* Show existing review */}
                {isReviewed && existingReview.rating && (
                  <div className="bg-dark-800/50 rounded-lg px-3 py-2 space-y-1">
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(star => (
                        <Star key={star} size={13} className={star <= existingReview.rating ? 'fill-yellow-400 text-yellow-400' : 'text-dark-600'} />
                      ))}
                      <span className="text-[10px] text-dark-500 ml-1">{existingReview.rating}/5</span>
                    </div>
                    {existingReview.comment && <p className="text-[11px] text-dark-300">{existingReview.comment}</p>}
                    <p className="text-[9px] text-dark-500">{new Date(existingReview.created_at).toLocaleDateString()}</p>
                  </div>
                )}
                <AnimatePresence>
                  {form?.open && !isReviewed && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                      {/* Star rating */}
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(star => (
                          <button key={star} onClick={() => setReviewRating(pid, star)} className="p-0.5">
                            <Star size={20} className={star <= (form?.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-dark-600'} />
                          </button>
                        ))}
                        <span className="text-xs text-dark-400 ml-2">{form?.rating}/5</span>
                      </div>
                      <textarea
                        value={form?.comment || ''}
                        onChange={e => setReviewComment(pid, e.target.value)}
                        className="input min-h-[60px] text-sm"
                        placeholder="Share your experience (optional)..."
                      />
                      <button
                        onClick={() => submitReview(pid)}
                        disabled={submittingReview === pid}
                        className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2"
                      >
                        {submittingReview === pid ? <RefreshCw size={14} className="animate-spin" /> : <Star size={14} />}
                        Submit Review
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      {/* Feedback / Reputation Section */}
      {['completed', 'delivered'].includes(order?.status) && (
        <div className="card p-3 space-y-3">
          <div className="flex items-center gap-2">
            <ThumbsUp size={14} className="text-emerald-400" />
            <h3 className="text-sm font-semibold">Reputation Feedback</h3>
          </div>
          
          {/* Show existing feedback */}
          {feedbacks.length > 0 && (
            <div className="space-y-2">
              {feedbacks.map(fb => (
                <div key={fb.id} className="bg-dark-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    {fb.is_positive ? (
                      <ThumbsUp size={14} className="text-emerald-400" />
                    ) : (
                      <ThumbsDown size={14} className="text-red-400" />
                    )}
                    <span className="text-xs">
                      <span className="font-medium">{fb.from_user?.username || fb.from_user?.shop_name || 'User'}</span>
                      <span className="text-dark-400"> left </span>
                      <span className={fb.is_positive ? 'text-emerald-400' : 'text-red-400'}>
                        rep{fb.is_positive ? '+' : '-'}
                      </span>
                    </span>
                  </div>
                  {fb.comment && <p className="text-[11px] text-dark-300 mt-1">{fb.comment}</p>}
                </div>
              ))}
            </div>
          )}
          
          {/* Leave feedback form */}
          {!myFeedback && (
            <div className="space-y-2">
              <p className="text-xs text-dark-400">
                How was your experience with the {order?.buyer_id === user?.id ? 'seller' : 'buyer'}?
              </p>
              <textarea
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value)}
                className="input min-h-[50px] text-sm"
                placeholder="Optional comment..."
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => submitFeedback(true)}
                  disabled={submittingFeedback}
                  className="btn flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 py-2 text-sm flex items-center justify-center gap-2"
                >
                  <ThumbsUp size={14} />
                  Rep+
                </button>
                <button 
                  onClick={() => submitFeedback(false)}
                  disabled={submittingFeedback}
                  className="btn flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2 text-sm flex items-center justify-center gap-2"
                >
                  <ThumbsDown size={14} />
                  Rep-
                </button>
              </div>
            </div>
          )}
          
          {myFeedback && (
            <p className="text-xs text-dark-400 text-center">
              <Check size={12} className="inline mr-1" />
              You already left feedback for this order
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      {showMessages && (messages.length > 0 || canMessage) && (
        <div className="card p-3 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-primary-400" />
            <h3 className="text-sm font-semibold">Messages</h3>
            <span className="text-[10px] text-dark-500">{messages.length}</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-xs text-dark-500 text-center py-4">No messages yet. Start a conversation.</p>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_id === user?.id
                const isSystem = msg.is_system
                if (isSystem) {
                  return (
                    <div key={msg.id} className="text-center">
                      <span className="text-[10px] text-dark-500 bg-dark-800/50 px-2 py-0.5 rounded-full">{msg.content}</span>
                    </div>
                  )
                }

                const labelColor = msg.sender_label === 'admin' ? '#f87171' : msg.sender_label === 'seller' ? '#34d399' : '#60a5fa'
                const labelText = msg.sender_label === 'admin'
                  ? '🛡 Admin'
                  : msg.sender_label === 'seller'
                    ? `Seller${msg.shop_name ? ' · ' + msg.shop_name : ''}`
                    : 'Buyer'

                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isMe ? 'bg-primary-500/15 text-primary-100' : 'bg-dark-800'}`}>
                      <p className="text-[10px] font-medium mb-0.5" style={{ color: labelColor }}>
                        {labelText}{isMe ? ' (You)' : ''}
                      </p>
                      <p className="text-xs">{msg.content}</p>
                      <p className="text-[9px] text-dark-500 mt-1">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input - only when conversation is active */}
          {canMessage && (
            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="input flex-1 py-2 text-sm"
                placeholder="Type a message..."
              />
              <button type="submit" disabled={sending || !messageInput.trim()} className="btn-primary p-2.5 rounded-xl">
                <Send size={16} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
