import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ChevronLeft, Users2, Shield, CheckCircle, XCircle,
  Send, Edit3, DollarSign, FileText, AlertCircle, Users,
  Clock, Check, X, MessageCircle, Copy, AlertTriangle, Scale, UserPlus
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

const STATUS_CONFIG = {
  pending_invite: { label: 'Waiting for Seller', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  negotiating: { label: 'Negotiating Terms', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  pending_confirmation: { label: 'Pending Confirmation', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  funds_locked: { label: 'Funds Locked', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },

  admin_joined: { label: 'Admin Joined', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  disputed: { label: 'Disputed', color: 'text-red-400', bg: 'bg-red-500/10' },
  completed: { label: 'Completed', color: 'text-green-400', bg: 'bg-green-500/10' },
  cancelled: { label: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/10' },
}

export default function MiddlemanDeal() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, tgConfirm } = useAuthStore()
  const [deal, setDeal] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [showEditTerms, setShowEditTerms] = useState(false)
  const [editForm, setEditForm] = useState({ amount: '', terms: '' })
  const [codeCopied, setCodeCopied] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [resolveForm, setResolveForm] = useState({ decision: 'refund_buyer', buyerPercent: 50, adminNote: '' })

  const [toast, setToast] = useState(null) // { message, type: 'success'|'error' }
  const [showFeeEdit, setShowFeeEdit] = useState(false)
  const [feeValue, setFeeValue] = useState('')
  const [accepting, setAccepting] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadDeal()
    const interval = setInterval(() => {
      loadMessages()
      loadDealMeta()
    }, 5000)
    return () => clearInterval(interval)
  }, [id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleAcceptInvite = async () => {
    setAccepting(true)
    try {
      await api.post(`/api/middleman/deals/${id}/accept`)
      showToast('Invite accepted! You can now negotiate terms.')
      await loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to accept invite', 'error')
    } finally {
      setAccepting(false)
    }
  }


  const loadDeal = async () => {
    try {
      const [dealRes, msgsRes] = await Promise.all([
        api.get(`/api/middleman/deals/${id}`),
        api.get(`/api/middleman/deals/${id}/messages`)
      ])
      setDeal(dealRes.data)
      setMessages(msgsRes.data || [])
      setEditForm({
        amount: dealRes.data.amount?.toString() || '',
        terms: dealRes.data.terms || ''
      })
    } catch (error) {
      console.error(error)
      if (error.response?.status === 404 || error.response?.status === 403) {
        navigate('/middleman')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async () => {
    try {
      const res = await api.get(`/api/middleman/deals/${id}/messages`)
      setMessages(res.data || [])
    } catch (e) {}
  }

  const loadDealMeta = async () => {
    try {
      const res = await api.get(`/api/middleman/deals/${id}`)
      setDeal(res.data)
    } catch (e) {}
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!message.trim() || sending) return
    
    setSending(true)
    try {
      await api.post(`/api/middleman/deals/${id}/messages`, {
        content: message.trim()
      })
      setMessage('')
      loadMessages()
    } catch (error) {
      console.error(error)
    } finally {
      setSending(false)
    }
  }

  const handleUpdateTerms = async () => {
    try {
      await api.put(`/api/middleman/deals/${id}`, {
        amount: parseFloat(editForm.amount) || 0,
        terms: editForm.terms.trim() || null
      })
      setShowEditTerms(false)
      loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to update', 'error')
    }
  }

  const handleConfirm = async () => {
    try {
      await api.post(`/api/middleman/deals/${id}/confirm`)
      loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to confirm', 'error')
    }
  }

  const handleRequestAdmin = async () => {
    try {
      await api.post(`/api/middleman/deals/${id}/request-admin`)
      loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to request admin', 'error')
    }
  }

  const handleCancel = async () => {
    if (!await tgConfirm('Are you sure you want to cancel this deal?')) return
    try {
      await api.post(`/api/middleman/deals/${id}/cancel`)
      setDeal(prev => prev ? { ...prev, status: 'cancelled' } : prev)
      await loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to cancel', 'error')
    }
  }

  const handleComplete = async () => {
    if (!await tgConfirm('Mark this deal as completed?')) return
    try {
      await api.post(`/api/middleman/deals/${id}/complete`)
      loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to complete', 'error')
    }
  }

  const handleMarkComplete = async () => {
    const msg = isBuyer
      ? 'By marking complete you confirm that you have received the product/service and are satisfied with the outcome as described in the Terms & Conditions. Continue?'
      : 'By marking complete you confirm that you have delivered the product/service and fulfilled your obligations as described in the Terms & Conditions. Continue?'
    if (!await tgConfirm(msg)) return
    try {
      const res = await api.post(`/api/middleman/deals/${id}/mark-complete`)
      if (res.data.both_completed) {
        showToast(`Deal completed! $${res.data.transferred?.toFixed(2) || res.data.amount?.toFixed(2)} transferred (Fee: $${res.data.fee?.toFixed(2) || '0.00'})`)
      } else {
        showToast('Marked as complete! Waiting for the other party to confirm.')
      }
      await loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to mark complete', 'error')
    }
  }

  const handleUpdateFee = async () => {
    const feeNum = parseFloat(feeValue)
    if (isNaN(feeNum) || feeNum < 0 || feeNum > 50) {
      showToast('Fee must be between 0% and 50%', 'error')
      return
    }
    try {
      await api.put(`/api/middleman/admin/deals/${id}/fee?fee_percent=${feeNum}`)
      setShowFeeEdit(false)
      loadDeal()
      showToast('Fee updated')
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to update fee', 'error')
    }
  }

  const handleOpenDispute = async () => {
    if (disputeReason.trim().length < 10) {
      showToast('Please provide a detailed reason (at least 10 characters)', 'error')
      return
    }
    if (!await tgConfirm('Are you sure you want to open a dispute? An admin will review and make a decision.')) return
    try {
      await api.post(`/api/middleman/deals/${id}/dispute`, { reason: disputeReason.trim() })
      setShowDisputeForm(false)
      setDisputeReason('')
      loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to open dispute', 'error')
    }
  }

  const handleResolveDispute = async () => {
    const payload = {
      decision: resolveForm.decision,
      admin_note: resolveForm.adminNote.trim() || null
    }
    if (resolveForm.decision === 'partial_split') {
      payload.buyer_percent = resolveForm.buyerPercent
    }
    
    const msg = resolveForm.decision === 'refund_buyer' 
      ? 'Refund full amount to buyer?' 
      : resolveForm.decision === 'pay_seller'
        ? 'Pay full amount to seller (minus fee)?'
        : `Split funds ${resolveForm.buyerPercent}% to buyer / ${100 - resolveForm.buyerPercent}% to seller?`
    
    if (!await tgConfirm(msg)) return
    try {
      const res = await api.post(`/api/middleman/admin/deals/${id}/resolve`, payload)
      showToast(`Resolved! Buyer: $${res.data.buyer_receives?.toFixed(2)}, Seller: $${res.data.seller_receives?.toFixed(2)}`)
      setShowResolveForm(false)
      loadDeal()
    } catch (error) {
      showToast(error.response?.data?.detail || 'Failed to resolve dispute', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse p-4">
          <div className="h-6 bg-dark-700 rounded w-1/2 mb-3" />
          <div className="h-4 bg-dark-700 rounded w-3/4" />
        </div>
        <div className="card animate-pulse h-64" />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="card p-8 text-center">
        <XCircle size={48} className="mx-auto text-dark-600 mb-3" />
        <p className="text-dark-400">Deal not found</p>
        <Link to="/middleman" className="text-primary-400 text-sm mt-2 inline-block">Back to Middleman</Link>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[deal.status] || STATUS_CONFIG.negotiating
  // Dynamic label for pending_invite based on who's missing
  const status = deal.status === 'pending_invite' 
    ? { ...statusConfig, label: deal.buyer_id ? 'Waiting for Seller' : 'Waiting for Buyer' }
    : statusConfig
  const isBuyer = deal.buyer_id === user?.id
  const isSeller = deal.seller_id === user?.id
  const isAdmin = user?.role === 'admin'
  const isParticipant = isBuyer || isSeller
  
  // Check if user is invited by username but hasn't joined yet
  const isInvitedAsSeller = !deal.seller_id && deal.seller_username?.toLowerCase() === user?.username?.toLowerCase()
  const isInvitedAsBuyer = !deal.buyer_id && deal.buyer_username?.toLowerCase() === user?.username?.toLowerCase()
  const isInvitedPending = deal.status === 'pending_invite' && (isInvitedAsSeller || isInvitedAsBuyer)
  
  // Other party - use username fallback when they haven't joined yet
  const otherParty = isBuyer 
    ? (deal.seller || { username: deal.seller_username })
    : isInvitedPending
      ? (isInvitedAsSeller ? (deal.buyer || { username: deal.buyer_username }) : (deal.seller || { username: deal.seller_username }))
      : (deal.buyer || { username: deal.buyer_username })
  const myConfirmed = isBuyer ? deal.buyer_confirmed : deal.seller_confirmed
  const myCompleted = isBuyer ? deal.buyer_completed : deal.seller_completed
  const canEdit = isParticipant && !myConfirmed && !deal.funds_locked && !['completed', 'cancelled', 'funds_locked', 'admin_joined', 'disputed'].includes(deal.status)
  const canConfirm = isParticipant && deal.seller_id && !myConfirmed && !['completed', 'cancelled', 'funds_locked', 'admin_joined', 'disputed'].includes(deal.status)
  const canMarkComplete = isParticipant && ['funds_locked', 'admin_joined'].includes(deal.status) && !myCompleted
  const canRequestAdmin = isParticipant && deal.seller_id && !deal.admin_requested && !['completed', 'cancelled', 'pending_invite', 'disputed'].includes(deal.status)
  const canOpenDispute = isParticipant && deal.funds_locked && !['completed', 'cancelled', 'disputed'].includes(deal.status)
  const canAdminResolve = isAdmin && deal.status === 'disputed' && deal.funds_locked
  const isClosed = ['completed', 'cancelled'].includes(deal.status)
  const isDisputed = deal.status === 'disputed'

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] overflow-hidden">
      {/* Back Link */}
      <Link to="/middleman" className="inline-flex items-center gap-1 text-sm text-dark-400 hover:text-dark-200 mb-2 shrink-0">
        <ChevronLeft size={16} />
        Back
      </Link>
      
      {/* Deal Info - scrollable section */}
      <div className="shrink-0 space-y-3 mb-3 max-h-[45vh] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-3"
        >
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl ${status.bg} flex items-center justify-center shrink-0`}>
              {deal.status === 'completed' ? (
                <CheckCircle size={20} className={status.color} />
              ) : deal.status === 'cancelled' ? (
                <XCircle size={20} className={status.color} />
              ) : deal.status === 'admin_joined' ? (
                <Shield size={20} className={status.color} />
              ) : deal.status === 'disputed' ? (
                <AlertTriangle size={20} className={status.color} />
              ) : (
                <Users2 size={20} className={status.color} />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold truncate">{deal.title}</h1>
              <div className="flex items-center gap-2 text-xs text-dark-400 mt-0.5">
                <span className={status.color}>{status.label}</span>
                <span>•</span>
                <span>with @{otherParty?.username || '?'}</span>
              </div>
            </div>

            {deal.amount > 0 && (
              <div className="text-right shrink-0">
                <span className="text-lg font-bold text-primary-400">${deal.amount.toFixed(2)}</span>
                {deal.fee_percent > 0 && (
                  <p className="text-[10px] text-dark-500">
                    Fee: {deal.fee_percent}% (${(deal.fee_amount || deal.amount * deal.fee_percent / 100).toFixed(2)})
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Invite Code - show when pending invite and user is the creator */}
          {deal.status === 'pending_invite' && isParticipant && deal.invite_code && (
            <div className="mt-3 pt-3 border-t border-dark-800">
              <p className="text-xs text-dark-400 mb-1.5">Share this invite code with the other party:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-dark-800 rounded-lg px-3 py-2 font-mono text-lg font-bold tracking-widest text-center text-primary-400">
                  {deal.invite_code}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(deal.invite_code)
                    setCodeCopied(true)
                    setTimeout(() => setCodeCopied(false), 2000)
                  }}
                  className="btn-secondary px-3 py-2"
                >
                  {codeCopied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Invite Pending Banner - show when user is invited but hasn't accepted */}
          {isInvitedPending && (
            <div className="mt-3 pt-3 border-t border-dark-800">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-yellow-400 mb-1">
                  <UserPlus size={16} />
                  <span className="font-medium text-sm">You're invited to this deal</span>
                </div>
                <p className="text-xs text-dark-300">
                  {isInvitedAsSeller 
                    ? `@${deal.buyer?.username || deal.buyer_username} invited you as the seller.`
                    : `@${deal.seller?.username || deal.seller_username} invited you as the buyer.`
                  } Click "Accept Invite" below to join and start negotiating terms.
                </p>
              </div>
            </div>
          )}

          {/* Confirmation Status */}
          {deal.seller_id && deal.buyer_id && !isClosed && (
            <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-dark-800 text-xs">
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 ${deal.buyer_confirmed ? 'text-emerald-400' : 'text-dark-500'}`}>
                  {deal.buyer_confirmed ? <Check size={12} /> : <Clock size={12} />}
                  Buyer @{deal.buyer?.username || deal.buyer_username} {deal.buyer_confirmed ? 'confirmed' : 'pending'}
                </div>
                <div className={`flex items-center gap-1.5 ${deal.seller_confirmed ? 'text-emerald-400' : 'text-dark-500'}`}>
                  {deal.seller_confirmed ? <Check size={12} /> : <Clock size={12} />}
                  Seller @{deal.seller?.username || deal.seller_username} {deal.seller_confirmed ? 'confirmed' : 'pending'}
                </div>
              </div>
              {/* Funds locked indicator */}
              {deal.funds_locked && (
                <div className="flex items-center gap-1.5 text-cyan-400">
                  <DollarSign size={12} />
                  ${deal.amount.toFixed(2)} locked from buyer's balance
                  {deal.lock_in_days > 0 && <span className="text-dark-500">({deal.lock_in_days} day lock-in)</span>}
                </div>
              )}
              {/* Completion Status - show when funds locked */}
              {deal.funds_locked && (
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 ${deal.buyer_completed ? 'text-green-400' : 'text-dark-500'}`}>
                    {deal.buyer_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                    Buyer {deal.buyer_completed ? 'completed' : 'not completed'}
                  </div>
                  <div className={`flex items-center gap-1.5 ${deal.seller_completed ? 'text-green-400' : 'text-dark-500'}`}>
                    {deal.seller_completed ? <CheckCircle size={12} /> : <Clock size={12} />}
                    Seller {deal.seller_completed ? 'completed' : 'not completed'}
                  </div>
                </div>
              )}
              {/* Admin requested indicator */}
              {deal.admin_requested && !isDisputed && (
                <div className="flex items-center gap-1.5 text-purple-400">
                  <Shield size={12} />
                  Admin assistance requested
                </div>
              )}
              {/* Dispute info */}
              {isDisputed && (
                <div className="bg-red-500/10 rounded-lg p-2 border border-red-500/20">
                  <div className="flex items-center gap-1.5 text-red-400 font-medium">
                    <AlertTriangle size={12} />
                    Dispute opened
                  </div>
                  {deal.dispute_reason && (
                    <p className="text-xs text-dark-300 mt-1">{deal.dispute_reason}</p>
                  )}
                  <p className="text-[10px] text-dark-500 mt-1">Admin will review and make a decision</p>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Terms Card */}
        {(deal.terms || canEdit) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="card p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-dark-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={12} />
                Terms & Conditions
              </h3>
              {canEdit && (
                <button
                  onClick={() => setShowEditTerms(!showEditTerms)}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
                  <Edit3 size={12} />
                  Edit
                </button>
              )}
            </div>

            {showEditTerms ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-dark-500 mb-1 block">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-500 mb-1 block">Terms</label>
                  <textarea
                    value={editForm.terms}
                    onChange={(e) => setEditForm({ ...editForm, terms: e.target.value })}
                    className="input text-sm resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowEditTerms(false)} className="btn-secondary text-xs flex-1">
                    Cancel
                  </button>
                  <button onClick={handleUpdateTerms} className="btn-primary text-xs flex-1">
                    Update Terms
                  </button>
                </div>
                <p className="text-[10px] text-dark-500 text-center">
                  Updating terms will reset both confirmations
                </p>
              </div>
            ) : (
              <p className="text-sm text-dark-300 whitespace-pre-wrap leading-relaxed">
                {deal.terms || 'No terms specified yet. Click Edit to add terms.'}
              </p>
            )}
          </motion.div>
        )}

        {/* Action Buttons */}
        {!isClosed && (
          <div className="flex gap-2 flex-wrap">
            {isInvitedPending && (
              <button 
                onClick={handleAcceptInvite} 
                disabled={accepting}
                className="btn-primary text-sm flex items-center gap-1.5 flex-1 bg-green-500 hover:bg-green-600"
              >
                <UserPlus size={14} />
                {accepting ? 'Accepting...' : 'Accept Invite'}
              </button>
            )}
            {canConfirm && (
              <button onClick={handleConfirm} className="btn-primary text-sm flex items-center gap-1.5 flex-1">
                <Check size={14} />
                Confirm Terms
              </button>
            )}
            {canMarkComplete && (
              <div className="flex-1 flex flex-col gap-1">
                <button onClick={handleMarkComplete} className="btn-primary text-sm flex items-center gap-1.5 w-full bg-emerald-500 hover:bg-emerald-600">
                  <CheckCircle size={14} />
                  Mark Complete
                </button>
                <p className="text-[10px] text-zinc-500 leading-tight px-1">
                  {isBuyer
                    ? 'Confirm that you received the product/service per the Terms & Conditions.'
                    : 'Confirm that you delivered the product/service per the Terms & Conditions.'}
                </p>
              </div>
            )}
            {canRequestAdmin && (
              <button onClick={handleRequestAdmin} className="btn-secondary text-sm flex items-center gap-1.5">
                <Shield size={14} />
                Request Admin
              </button>
            )}
            {canOpenDispute && (
              <button 
                onClick={() => setShowDisputeForm(!showDisputeForm)} 
                className="btn-secondary text-sm flex items-center gap-1.5 text-orange-400 hover:text-orange-300"
              >
                <AlertTriangle size={14} />
                Open Dispute
              </button>
            )}
            {canAdminResolve && (
              <button 
                onClick={() => setShowResolveForm(!showResolveForm)} 
                className="btn-primary text-sm flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600"
              >
                <Scale size={14} />
                Resolve Dispute
              </button>
            )}
            {isAdmin && !isClosed && (
              <>
                {showFeeEdit ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={feeValue}
                      onChange={e => setFeeValue(e.target.value)}
                      className="input text-sm w-20 py-1"
                      placeholder="%"
                    />
                    <button onClick={handleUpdateFee} className="btn-primary text-xs py-1 px-2">Save</button>
                    <button onClick={() => setShowFeeEdit(false)} className="btn-secondary text-xs py-1 px-2">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setFeeValue(deal.fee_percent?.toString() || '5'); setShowFeeEdit(true) }} className="btn-secondary text-sm flex items-center gap-1.5">
                    <DollarSign size={14} />
                    Edit Fee
                  </button>
                )}
                <button onClick={handleComplete} className="btn-primary text-sm flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600">
                  <Shield size={14} />
                  Force Complete
                </button>
              </>
            )}
            {isParticipant && !isClosed && !deal.funds_locked && (
              <button onClick={handleCancel} className="btn-secondary text-sm flex items-center gap-1.5 text-red-400 hover:text-red-300">
                <X size={14} />
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Dispute Form */}
        {showDisputeForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="card p-3 border-orange-500/30 border"
          >
            <h3 className="text-sm font-medium text-orange-400 flex items-center gap-2 mb-2">
              <AlertTriangle size={14} />
              Open a Dispute
            </h3>
            <p className="text-xs text-dark-400 mb-2">
              Use this when there's a conflict that can't be resolved between parties. An admin will review and make a binding decision.
            </p>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Describe the issue in detail (min 10 characters)..."
              className="input text-sm resize-none mb-2"
              rows={3}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowDisputeForm(false)} className="btn-secondary text-xs flex-1">
                Cancel
              </button>
              <button 
                onClick={handleOpenDispute} 
                disabled={disputeReason.trim().length < 10}
                className="btn-primary text-xs flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
              >
                Submit Dispute
              </button>
            </div>
          </motion.div>
        )}

        {/* Admin Resolution Form */}
        {showResolveForm && isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="card p-3 border-purple-500/30 border"
          >
            <h3 className="text-sm font-medium text-purple-400 flex items-center gap-2 mb-2">
              <Scale size={14} />
              Resolve Dispute
            </h3>
            <p className="text-xs text-dark-400 mb-3">
              Total locked: ${(deal.amount + (deal.fee_amount || deal.amount * deal.fee_percent / 100)).toFixed(2)} 
              (Amount: ${deal.amount.toFixed(2)} + Fee: ${(deal.fee_amount || deal.amount * deal.fee_percent / 100).toFixed(2)})
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-dark-500 mb-1 block">Decision</label>
                <select
                  value={resolveForm.decision}
                  onChange={(e) => setResolveForm({ ...resolveForm, decision: e.target.value })}
                  className="input text-sm"
                >
                  <option value="refund_buyer">Full Refund to Buyer</option>
                  <option value="pay_seller">Full Payment to Seller</option>
                  <option value="partial_split">Partial Split</option>
                </select>
              </div>

              {resolveForm.decision === 'partial_split' && (
                <div>
                  <label className="text-xs text-dark-500 mb-1 block">
                    Split: {resolveForm.buyerPercent}% Buyer / {100 - resolveForm.buyerPercent}% Seller
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={resolveForm.buyerPercent}
                    onChange={(e) => setResolveForm({ ...resolveForm, buyerPercent: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-dark-500 mt-1">
                    <span>Buyer: ~${((deal.amount + (deal.fee_amount || 0)) * resolveForm.buyerPercent / 100).toFixed(2)}</span>
                    <span>Seller: ~${((deal.amount + (deal.fee_amount || 0)) * (100 - resolveForm.buyerPercent) / 100 - (deal.fee_amount || 0) * (100 - resolveForm.buyerPercent) / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-dark-500 mb-1 block">Admin Note (optional)</label>
                <textarea
                  value={resolveForm.adminNote}
                  onChange={(e) => setResolveForm({ ...resolveForm, adminNote: e.target.value })}
                  placeholder="Explain your decision..."
                  className="input text-sm resize-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowResolveForm(false)} className="btn-secondary text-xs flex-1">
                  Cancel
                </button>
                <button 
                  onClick={handleResolveDispute}
                  className="btn-primary text-xs flex-1 bg-purple-500 hover:bg-purple-600"
                >
                  Confirm Resolution
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto card p-3 mb-3 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle size={32} className="mx-auto text-dark-600 mb-2" />
            <p className="text-dark-500 text-sm">No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id
            const isSystem = msg.is_system
            
            if (isSystem) {
              return (
                <div key={msg.id} className="text-center py-2">
                  <span className="text-xs text-dark-500 bg-dark-800 px-3 py-1 rounded-full">
                    {msg.content}
                  </span>
                </div>
              )
            }
            
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                  isMe 
                    ? 'bg-primary-500 text-white rounded-br-sm' 
                    : 'bg-dark-800 text-dark-200 rounded-bl-sm'
                }`}>
                  {!isMe && (
                    <p className="text-[10px] font-medium mb-0.5 opacity-70">
                      @{msg.sender?.username || '?'}
                    </p>
                  )}
                  {msg.is_proposal && (
                    <div className={`text-[10px] mb-1 px-2 py-0.5 rounded ${
                      isMe ? 'bg-white/20' : 'bg-primary-500/20 text-primary-400'
                    }`}>
                      📝 Proposal: {msg.proposed_amount != null && `$${msg.proposed_amount.toFixed(2)}`}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-white/50' : 'text-dark-500'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      {!isClosed && (
        <form onSubmit={handleSend} className="shrink-0 flex gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="input flex-1"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!message.trim() || sending}
            className="btn-primary px-4"
          >
            <Send size={18} />
          </button>
        </form>
      )}

      {isClosed && (
        <div className={`shrink-0 text-center py-3 rounded-xl ${status.bg}`}>
          <span className={`text-sm font-medium ${status.color}`}>
            This deal is {deal.status}
          </span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className={`fixed bottom-20 left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-center shadow-lg ${
            toast.type === 'error'
              ? 'bg-red-500/90 text-white'
              : 'bg-emerald-500/90 text-white'
          }`}
        >
          {toast.message}
        </motion.div>
      )}
    </div>
  )
}
