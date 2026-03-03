import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Star, MessageSquareText, ThumbsUp, ThumbsDown } from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

function timeAgo(date) {
  if (!date) return ''
  const now = new Date()
  const d = new Date(date)
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

export default function SellerReviews() {
  const { user } = useAuthStore()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, positive, negative

  useEffect(() => {
    loadReviews()
  }, [user?.id])

  const loadReviews = async () => {
    if (!user?.id) return
    try {
      const { data } = await api.get(`/api/sellers/${user.id}/reviews`)
      setReviews(data || [])
    } catch {
      setReviews([])
    } finally {
      setLoading(false)
    }
  }

  // Stats
  const positiveReviews = reviews.filter(r => r.rating >= 4)
  const negativeReviews = reviews.filter(r => r.rating <= 2)
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0'

  // Filter
  const filteredReviews = reviews.filter(r => {
    if (filter === 'positive') return r.rating >= 4
    if (filter === 'negative') return r.rating <= 2
    return true
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Reviews</h1>
          <p className="text-xs text-dark-400">{reviews.length} total reviews</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="flex gap-2">
        <div className="flex-1 card px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Star size={14} className="text-yellow-400 fill-yellow-400" />
            <span className="text-lg font-bold">{avgRating}</span>
          </div>
          <p className="text-[9px] text-dark-400">Average</p>
        </div>
        <button
          onClick={() => setFilter(filter === 'positive' ? 'all' : 'positive')}
          className={`flex-1 rounded-lg px-3 py-2.5 text-center transition-colors ${
            filter === 'positive' ? 'bg-emerald-500/20' : 'card hover:bg-dark-800'
          }`}
        >
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ThumbsUp size={14} className="text-emerald-400" />
            <span className="text-lg font-bold text-emerald-400">{positiveReviews.length}</span>
          </div>
          <p className="text-[9px] text-dark-400">Positive</p>
        </button>
        <button
          onClick={() => setFilter(filter === 'negative' ? 'all' : 'negative')}
          className={`flex-1 rounded-lg px-3 py-2.5 text-center transition-colors ${
            filter === 'negative' ? 'bg-red-500/20' : 'card hover:bg-dark-800'
          }`}
        >
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ThumbsDown size={14} className="text-red-400" />
            <span className="text-lg font-bold text-red-400">{negativeReviews.length}</span>
          </div>
          <p className="text-[9px] text-dark-400">Negative</p>
        </button>
      </div>

      {/* Quick Alert for negative reviews */}
      {negativeReviews.length > 0 && filter === 'all' && (
        <button
          onClick={() => setFilter('negative')}
          className="w-full bg-red-500/10 rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-red-500/15 transition-colors"
        >
          <ThumbsDown size={14} className="text-red-400" />
          <div className="text-left">
            <span className="text-sm font-bold text-red-400">{negativeReviews.length}</span>
            <span className="text-[11px] text-dark-400 ml-1">negative reviews need attention</span>
          </div>
        </button>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-3 animate-pulse">
              <div className="h-3 bg-dark-800 rounded w-1/4 mb-2" />
              <div className="h-4 bg-dark-800 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="card text-center py-8">
          <Star size={32} className="mx-auto mb-3 text-dark-600" />
          <h3 className="font-semibold mb-1">
            {filter === 'all' ? 'No reviews yet' : `No ${filter} reviews`}
          </h3>
          <p className="text-dark-400 text-sm">
            {filter === 'all' 
              ? 'Reviews will appear when customers rate your products'
              : 'Try changing your filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredReviews.map((review, i) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card px-3 py-2.5"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={10}
                        className={star <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-dark-600'}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-dark-300">
                    {review.reviewer?.username ? `@${review.reviewer.username}` : review.reviewer?.first_name || 'Anonymous'}
                  </span>
                </div>
                <span className="text-[10px] text-dark-500">{timeAgo(review.created_at)}</span>
              </div>
              
              {/* Product */}
              <p className="text-sm font-medium text-dark-200">{review.product?.name || 'Product'}</p>
              
              {/* Comment */}
              {review.comment && (
                <p className="text-xs text-dark-400 mt-1 line-clamp-2">{review.comment}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
