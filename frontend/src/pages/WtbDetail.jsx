import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Clock, DollarSign, Tag, User, MessageCircle,
  Send, ShoppingBag, AlertCircle, Calendar, ThumbsUp, ThumbsDown,
  Star, Shield, Wallet, ChevronDown, Trash2, Store, Archive, ArchiveRestore,
  AlertTriangle, X
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'

const timeAgo = (v) => {
  if (!v) return ''
  const d = new Date(typeof v === 'string' && !v.endsWith('Z') ? v + 'Z' : v)
  const diff = (Date.now() - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const fullDate = (v) => {
  if (!v) return '-'
  const d = new Date(typeof v === 'string' && !v.endsWith('Z') ? v + 'Z' : v)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const budget = (min, max) => {
  if (min && max) return `$${min.toFixed(0)} – $${max.toFixed(0)}`
  if (min) return `from $${min.toFixed(0)}`
  if (max) return `up to $${max.toFixed(0)}`
  return null
}

const RANK_COLORS = {
  1: { text: 'text-amber-600', bg: 'bg-amber-500/10', label: 'Bronze' },
  2: { text: 'text-gray-300', bg: 'bg-gray-400/10', label: 'Silver' },
  3: { text: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Gold' },
}

function UserBadge({ u, size = 'sm', showStats = false, linkable = true }) {
  if (!u) return null
  const rank = RANK_COLORS[u.seller_rank]
  const rep = (u.rep_positive || 0) - (u.rep_negative || 0)
  const isSmall = size === 'sm'
  const avatarSize = isSmall ? 'w-8 h-8' : 'w-10 h-10'

  const content = (
    <div className="flex items-center gap-2.5 min-w-0">
      {u.avatar_url ? (
        <img src={u.avatar_url} className={`${avatarSize} rounded-full object-cover flex-shrink-0 ring-1 ring-dark-700`} alt="" />
      ) : (
        <div className={`${avatarSize} rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0`}>
          <User size={isSmall ? 14 : 16} className="text-dark-400" />
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-semibold truncate ${isSmall ? 'text-xs' : 'text-sm'}`}>
            {u.first_name || u.username || 'User'}
          </span>
          {rank && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${rank.bg} ${rank.text}`}>
              {rank.label}
            </span>
          )}
          {(u.role === 'seller' || u.shop_name) && (
            <Store size={10} className="text-primary-400 flex-shrink-0" />
          )}
        </div>
        {u.username && (u.role === 'seller' || u.role === 'admin' || u.shop_name) && (
          <p className="text-[10px] text-dark-500 truncate">@{u.username}</p>
        )}
      </div>
    </div>
  )

  const isSeller = u.role === 'seller' || u.shop_name

  const statsRow = showStats && (
    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-dark-500">
      {isSeller && (
        <span className="flex items-center gap-0.5" title="Reputation">
          <ThumbsUp size={9} className="text-emerald-400" />
          <span className={rep > 0 ? 'text-emerald-400' : rep < 0 ? 'text-red-400' : ''}>
            {rep >= 0 ? `+${rep}` : rep}
          </span>
        </span>
      )}
      <span className="flex items-center gap-0.5" title="Total Deposited">
        <Wallet size={9} />
        Deposit: {u.total_deposit_amount || '$0'}
      </span>
      <span className="flex items-center gap-0.5" title="Total Transactions">
        <ShoppingBag size={9} />
        Transactions: {u.total_transactions || 0}
      </span>
      {isSeller && (u.seller_review_count || 0) > 0 && (
        <span className="flex items-center gap-0.5" title="Rating">
          <Star size={9} className="text-yellow-400 fill-yellow-400" />
          {u.seller_rating?.toFixed(1)} ({u.seller_review_count})
        </span>
      )}
    </div>
  )

  if (linkable && u.username && (u.role === 'seller' || u.shop_name)) {
    return (
      <Link to={`/shop/${u.username}`} className="block hover:opacity-80 transition-opacity">
        {content}
        {statsRow}
      </Link>
    )
  }

  return <div>{content}{statsRow}</div>
}

export default function WtbDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Reply state
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replyError, setReplyError] = useState('')
  const [showAllReplies, setShowAllReplies] = useState(false)
  const replyRef = useRef(null)

  // Warning modal state
  const [warnTarget, setWarnTarget] = useState(null) // { userId, username }
  const [warnReason, setWarnReason] = useState('')
  const [warnSending, setWarnSending] = useState(false)
  const [warnResult, setWarnResult] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/wtb/${id}`)
      setPost(data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Post not found.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || replySending) return
    setReplySending(true)
    setReplyError('')
    try {
      const { data } = await api.post(`/api/wtb/${id}/replies`, { message: replyText.trim() })
      setPost(prev => ({
        ...prev,
        replies: [...(prev.replies || []), data],
        reply_count: (prev.reply_count || 0) + 1,
        responses: (prev.responses || 0) + 1,
      }))
      setReplyText('')
      setShowAllReplies(true)
    } catch (err) {
      setReplyError(err?.response?.data?.detail || 'Failed to post reply.')
    } finally {
      setReplySending(false)
    }
  }

  const isAdmin = user?.role === 'admin'

  const handleArchive = async () => {
    try {
      await api.delete(`/api/wtb/${id}`)
      setPost(prev => ({ ...prev, is_archived: true, archived_at: new Date().toISOString(), status: 'closed' }))
    } catch (err) {
      console.error('Archive failed:', err)
    }
  }

  const handleUnarchive = async () => {
    try {
      await api.post(`/api/wtb/${id}/unarchive`)
      setPost(prev => ({ ...prev, is_archived: false, archived_at: null, status: 'active' }))
    } catch (err) {
      console.error('Unarchive failed:', err)
    }
  }

  const handleDeleteReply = async (replyId) => {
    try {
      await api.delete(`/api/wtb/${id}/replies/${replyId}`)
      setPost(prev => ({
        ...prev,
        replies: prev.replies.filter(r => r.id !== replyId),
        reply_count: Math.max(0, (prev.reply_count || 1) - 1),
        responses: Math.max(0, (prev.responses || 1) - 1),
      }))
    } catch (err) {
      console.error(err)
    }
  }

  const handleWarn = async (e) => {
    e.preventDefault()
    if (!warnTarget || !warnReason.trim() || warnSending) return
    setWarnSending(true)
    setWarnResult(null)
    try {
      const { data } = await api.post(`/api/admin/users/${warnTarget.userId}/warn`, {
        reason: warnReason.trim(),
        context: 'wtb',
        context_id: parseInt(id),
      })
      setWarnResult(data)
      setTimeout(() => {
        setWarnTarget(null)
        setWarnReason('')
        setWarnResult(null)
      }, 3000)
    } catch (err) {
      setWarnResult({ error: err?.response?.data?.detail || 'Failed to issue warning' })
    } finally {
      setWarnSending(false)
    }
  }

  // Loading skeleton
  if (loading) return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-dark-800/80 flex items-center justify-center">
          <ArrowLeft size={16} className="text-dark-300" />
        </button>
        <div className="h-5 w-32 bg-dark-800 rounded animate-pulse" />
      </div>
      <div className="card p-4 space-y-3 animate-pulse">
        <div className="flex items-center gap-2"><div className="w-10 h-10 rounded-full bg-dark-800" /><div className="space-y-1.5 flex-1"><div className="h-3.5 w-24 bg-dark-800 rounded" /><div className="h-2.5 w-16 bg-dark-800 rounded" /></div></div>
        <div className="h-5 w-2/3 bg-dark-800 rounded" />
        <div className="h-3 w-full bg-dark-800 rounded" />
        <div className="h-3 w-3/4 bg-dark-800 rounded" />
      </div>
    </div>
  )

  // Error state
  if (error || !post) return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-dark-800/80 flex items-center justify-center">
          <ArrowLeft size={16} className="text-dark-300" />
        </button>
        <h1 className="font-display text-lg font-bold">Not Found</h1>
      </div>
      <div className="card p-8 text-center">
        <AlertCircle size={28} className="mx-auto text-dark-600 mb-2" />
        <p className="text-dark-400 text-sm">{error || 'This WTB post could not be found.'}</p>
        <button onClick={() => navigate('/wtb')} className="btn-primary mt-4 px-4 py-2 text-sm">Browse WTB</button>
      </div>
    </div>
  )

  const isOwner = user && post.user && user.id === post.user.id
  const isActive = post.status === 'active' && !post.is_archived
  const canReply = user && !isOwner && isActive
  const replies = post.replies || []
  const visibleReplies = showAllReplies ? replies : replies.slice(0, 3)
  const hasMoreReplies = replies.length > 3 && !showAllReplies
  const budgetText = budget(post.budget_min, post.budget_max)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-dark-800/80 hover:bg-dark-700 transition-colors flex items-center justify-center flex-shrink-0">
          <ArrowLeft size={16} className="text-dark-300" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-base font-bold truncate">WTB Post</h1>
        </div>
        <span className="text-[10px] text-dark-500">#{post.id}</span>
      </div>

      {/* Post Card — forum-style */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        {/* Author header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-800/60">
          <UserBadge u={post.user} size="md" showStats={true} />
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && post.user && post.user.id !== user?.id && (
              <button
                onClick={() => setWarnTarget({ userId: post.user.id, username: post.user.username || post.user.first_name || 'User' })}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors font-medium"
              >
                <AlertTriangle size={10} />
                Warn
              </button>
            )}
            {isAdmin && (
              post.is_archived ? (
                <button onClick={handleUnarchive} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors font-medium">
                  <ArchiveRestore size={10} />
                  Restore
                </button>
              ) : (
                <button onClick={handleArchive} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors font-medium">
                  <Archive size={10} />
                  Archive
                </button>
              )
            )}
            {post.is_archived && (
              <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-dark-700 text-dark-400">Archived</span>
            )}
          </div>
        </div>

        {/* Post body */}
        <div className="px-4 py-3.5 space-y-3">
          <h2 className="text-base font-bold leading-snug">{post.title}</h2>

          {post.description && (
            <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-wrap">{post.description}</p>
          )}

          {/* Budget + Category inline */}
          <div className="flex flex-wrap items-center gap-2">
            {budgetText && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary-500/10 text-primary-400">
                <DollarSign size={12} />
                {budgetText}
              </span>
            )}
            {post.category && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-dark-800 text-dark-300 font-medium">
                <Tag size={10} />
                {post.category}
              </span>
            )}
          </div>
        </div>

        {/* Post footer — metadata */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-dark-800/30 text-[10px] text-dark-500">
          <span className="flex items-center gap-1">
            <Calendar size={10} />
            {fullDate(post.created_at)}
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <MessageCircle size={10} />
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </span>
        </div>
      </motion.div>

      {/* Replies section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-1.5"
      >
        {replies.length > 0 && (
          <p className="text-xs font-semibold text-dark-400 px-0.5">
            Replies ({replies.length})
          </p>
        )}

        <AnimatePresence initial={false}>
          {visibleReplies.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ delay: i * 0.02 }}
              className="card overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-dark-800/40">
                <UserBadge u={r.user} size="sm" showStats={true} />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-dark-500">{timeAgo(r.created_at)}</span>
                  {isAdmin && r.user && r.user.id !== user?.id && (
                    <button
                      onClick={() => setWarnTarget({ userId: r.user.id, username: r.user.username || r.user.first_name || 'User' })}
                      className="p-1 rounded-md hover:bg-dark-700 text-dark-500 hover:text-amber-400 transition-colors"
                      title="Warn user"
                    >
                      <AlertTriangle size={11} />
                    </button>
                  )}
                  {user && (user.id === r.user?.id || user.role === 'admin') && (
                    <button
                      onClick={() => handleDeleteReply(r.id)}
                      className="p-1 rounded-md hover:bg-dark-700 text-dark-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[13px] text-dark-100 leading-relaxed whitespace-pre-wrap">{r.message}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {hasMoreReplies && (
          <button
            onClick={() => setShowAllReplies(true)}
            className="w-full py-2 text-[11px] text-primary-400 hover:text-primary-300 font-medium flex items-center justify-center gap-1 transition-colors"
          >
            <ChevronDown size={14} />
            Show {replies.length - 3} more {replies.length - 3 === 1 ? 'reply' : 'replies'}
          </button>
        )}

        {replies.length === 0 && !canReply && (
          <div className="card p-6 text-center">
            <MessageCircle size={20} className="mx-auto text-dark-600 mb-1.5" />
            <p className="text-dark-500 text-xs">No replies yet</p>
          </div>
        )}
      </motion.div>

      {/* Reply input */}
      {canReply && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-3"
        >
          <form onSubmit={handleReply} className="flex items-end gap-2">
            {user?.avatar_url ? (
              <img src={user.avatar_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-dark-700" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-dark-400" />
              </div>
            )}
            <div className="flex-1 relative">
              <textarea
                ref={replyRef}
                value={replyText}
                onChange={e => { setReplyText(e.target.value); setReplyError('') }}
                placeholder="Write a reply..."
                className="input py-2 px-3 text-xs min-h-[36px] max-h-[120px] resize-none w-full pr-10"
                maxLength={2000}
                rows={1}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
              />
              <button
                type="submit"
                disabled={!replyText.trim() || replySending}
                className="absolute right-2 bottom-1.5 p-1.5 rounded-lg text-primary-400 hover:bg-primary-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </form>
          {replyError && (
            <p className="text-red-400 text-[11px] mt-1 px-1">{replyError}</p>
          )}
        </motion.div>
      )}

      {/* Login prompt for unauthenticated */}
      {!user && isActive && (
        <div className="card p-4 text-center">
          <p className="text-dark-400 text-xs">Log in to reply to this post</p>
        </div>
      )}

      {/* Admin Warning Modal */}
      <AnimatePresence>
        {warnTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => { if (!warnSending) { setWarnTarget(null); setWarnReason(''); setWarnResult(null) } }}
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              className="fixed left-4 right-4 bottom-8 z-50 card p-4 max-w-lg mx-auto"
              onClick={e => e.stopPropagation()}
            >
              {warnResult && !warnResult.error ? (
                <div className="text-center py-2">
                  <AlertTriangle size={24} className="mx-auto text-amber-400 mb-2" />
                  <p className="text-sm font-semibold text-amber-300">Warning #{warnResult.warning_number} issued</p>
                  {warnResult.restriction_days > 0 ? (
                    <p className="text-xs text-dark-400 mt-1">User restricted for {warnResult.restriction_days} day{warnResult.restriction_days !== 1 ? 's' : ''}</p>
                  ) : (
                    <p className="text-xs text-dark-400 mt-1">No posting restriction applied (first warning)</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-400" />
                      <span className="text-sm font-semibold">Warn @{warnTarget.username}</span>
                    </div>
                    <button onClick={() => { setWarnTarget(null); setWarnReason(''); setWarnResult(null) }} className="p-1 hover:bg-dark-800 rounded-lg">
                      <X size={16} className="text-dark-400" />
                    </button>
                  </div>
                  <p className="text-[11px] text-dark-500 mb-3">
                    Warnings escalate: 1st = notice, 2nd = 1 day restriction, 3rd = 7 days, 4th+ = 30 days.
                  </p>
                  {warnResult?.error && (
                    <p className="text-xs text-red-400 mb-2">{warnResult.error}</p>
                  )}
                  <form onSubmit={handleWarn} className="space-y-3">
                    <textarea
                      value={warnReason}
                      onChange={e => setWarnReason(e.target.value)}
                      placeholder="Reason for warning..."
                      className="input py-2.5 text-sm min-h-[60px] resize-none w-full"
                      maxLength={500}
                      minLength={3}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={warnReason.trim().length < 3 || warnSending}
                      className="w-full py-2.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-medium text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <AlertTriangle size={14} />
                      {warnSending ? 'Issuing...' : 'Issue Warning'}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
