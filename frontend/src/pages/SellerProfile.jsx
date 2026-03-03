import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Star, Package, Shield,
  Calendar, Store, ChevronLeft, TrendingUp, ThumbsUp, ThumbsDown, ArrowLeft, Briefcase, Clock,
  MessageCircle, Send, X, Gavel
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import ProductCard from '../components/ProductCard'

export default function SellerProfile() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isPreview = searchParams.get('preview') === 'true'
  const [seller, setSeller] = useState(null)
  const [products, setProducts] = useState([])
  const [services, setServices] = useState([])
  const [auctions, setAuctions] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [showMsgModal, setShowMsgModal] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [msgSending, setMsgSending] = useState(false)

  useEffect(() => {
    loadSeller()
  }, [id])

  const loadSeller = async () => {
    try {
      const [sellerRes, productsRes, servicesRes, auctionsRes, reviewsRes] = await Promise.all([
        api.get(`/api/sellers/${id}`),
        api.get(`/api/sellers/${id}/products`),
        api.get(`/api/sellers/${id}/services`),
        api.get(`/api/sellers/${id}/auctions`),
        api.get(`/api/sellers/${id}/reviews`)
      ])
      setSeller(sellerRes.data)
      setProducts(productsRes.data || [])
      setServices(servicesRes.data || [])
      setAuctions(auctionsRes.data || [])
      setReviews(reviewsRes.data || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!msgText.trim() || msgSending) return
    setMsgSending(true)
    try {
      const { data } = await api.post('/api/dm/start', {
        user_id: parseInt(id),
        message: msgText.trim(),
        context_type: 'seller_profile',
        context_label: seller?.shop_name || seller?.username || 'Seller'
      })
      setShowMsgModal(false)
      setMsgText('')
      navigate(`/messages/${data.conversation_id}`)
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setMsgSending(false)
    }
  }

  const isSelf = user && seller && user.id === seller.id

  const renderStars = (rating, size = 14) => {
    return [...Array(5)].map((_, i) => (
      <Star
        key={i}
        size={size}
        className={i < Math.floor(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-dark-700'}
      />
    ))
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return `${Math.floor(days / 30)}mo ago`
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse">
          <div className="h-20 bg-dark-800 rounded-t-xl" />
          <div className="p-4 -mt-8 flex gap-3">
            <div className="w-16 h-16 bg-dark-700 rounded-xl border-4 border-dark-900" />
            <div className="flex-1 pt-6 space-y-2">
              <div className="h-5 bg-dark-700 rounded w-1/2" />
              <div className="h-3 bg-dark-700 rounded w-1/3" />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse p-3 h-14" />
          ))}
        </div>
      </div>
    )
  }

  if (!seller) {
    return (
      <div className="card p-8 text-center">
        <Store size={48} className="mx-auto text-dark-600 mb-3" />
        <p className="text-dark-400">Seller not found</p>
        <Link to="/products" className="text-primary-400 text-sm mt-2 inline-block">Browse products</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Preview Banner */}
      {isPreview && (
        <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl px-4 py-3 flex items-center justify-between -mb-2">
          <div className="flex items-center gap-2">
            <Store size={16} className="text-primary-400" />
            <span className="text-sm text-primary-300">Shop Preview Mode</span>
          </div>
          <button
            onClick={() => navigate('/seller')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-400 text-xs font-medium hover:bg-primary-500/30 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>
        </div>
      )}

      {/* Back nav */}
      {!isPreview && (
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-dark-400 hover:text-dark-200 -mb-2">
          <ChevronLeft size={16} />
          Back
        </button>
      )}

      {/* Store Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        {/* Banner */}
        <div className="h-20 bg-gradient-to-r from-primary-500/30 via-dark-800 to-accent-purple/30" />
        
        {/* Info */}
        <div className="px-4 pb-4 -mt-8">
          <div className="flex gap-3">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-400 to-accent-purple flex items-center justify-center border-4 border-dark-900 overflow-hidden shrink-0">
              {seller.shop_image ? (
                <img src={seller.shop_image} alt="" className="w-full h-full object-cover" />
              ) : seller.avatar_url ? (
                <img src={seller.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold">{seller.shop_name?.[0] || 'S'}</span>
              )}
            </div>
            <div className="flex-1 pt-6 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold truncate">{seller.shop_name || seller.username}</h1>
              </div>
              <p className="text-dark-500 text-xs">@{seller.username}</p>
            </div>
          </div>

          {/* Collateral Banner */}
          {(seller.collateral || 0) > 0 && (
            <div className="mt-3 flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Shield size={16} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-emerald-400">${seller.collateral.toFixed(2)}</span>
                  <span className="text-xs text-emerald-400/70">deposited as collateral</span>
                </div>
                <p className="text-[10px] text-dark-500 leading-tight mt-0.5">Seller has funds locked on the platform as a trust guarantee</p>
              </div>
            </div>
          )}
          
          {/* Rating inline */}
          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-0.5">
              {renderStars(seller.seller_rating || 0, 12)}
            </div>
            <span className="text-xs text-dark-400">
              {(seller.seller_rating || 0).toFixed(1)} ({seller.seller_review_count || 0})
            </span>
          </div>

          {/* Description */}
          {seller.shop_description && (
            <p className="text-dark-400 text-xs mt-2 leading-relaxed whitespace-pre-wrap">{seller.shop_description}</p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-dark-800 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <TrendingUp size={13} className="text-primary-400" />
              <span className="font-medium">{seller.total_sales || 0}</span>
              <span className="text-dark-500">sales</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Package size={13} className="text-dark-400" />
              <span className="font-medium">{products.length}</span>
              <span className="text-dark-500">products</span>
            </div>
            {services.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Briefcase size={13} className="text-purple-400" />
                <span className="font-medium">{services.length}</span>
                <span className="text-dark-500">services</span>
              </div>
            )}
            {auctions.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Gavel size={13} className="text-amber-400" />
                <span className="font-medium">{auctions.length}</span>
                <span className="text-dark-500">auctions</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs">
              <ThumbsUp size={13} className="text-emerald-400" />
              <span className="font-medium text-emerald-400">{seller.rep_positive || 0}</span>
              <ThumbsDown size={13} className="text-red-400 ml-1" />
              <span className="font-medium text-red-400">{seller.rep_negative || 0}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Calendar size={13} className="text-dark-400" />
              <span className="text-dark-500">Joined {new Date(seller.created_at).toLocaleDateString('en', { month: 'short', year: 'numeric' })}</span>
            </div>
          </div>

          {/* Send Message Button */}
          {!isPreview && !isSelf && user && (
            <button
              onClick={() => setShowMsgModal(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-primary-500/30 text-sm font-medium text-dark-200 hover:text-dark-50 transition-all"
            >
              <MessageCircle size={16} className="text-primary-400" />
              Send a Message
            </button>
          )}
        </div>
      </motion.div>

      {/* Send Message Modal */}
      <AnimatePresence>
        {showMsgModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowMsgModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="fixed left-4 right-4 bottom-8 z-50 card p-4 max-w-lg mx-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-primary-400" />
                  <span className="text-sm font-semibold">Message {seller?.shop_name || seller?.username}</span>
                </div>
                <button onClick={() => setShowMsgModal(false)} className="p-1 hover:bg-dark-800 rounded-lg">
                  <X size={16} className="text-dark-400" />
                </button>
              </div>
              <form onSubmit={handleSendMessage} className="space-y-3">
                <textarea
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  placeholder="Write your message..."
                  className="input py-2.5 text-sm min-h-[80px] resize-none w-full"
                  maxLength={2000}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!msgText.trim() || msgSending}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Send size={14} />
                  {msgSending ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Products */}
      <section>
        <h2 className="font-display font-semibold text-sm text-dark-300 uppercase tracking-wider mb-2 px-1">
          Products ({products.length})
        </h2>
        
        {products.length === 0 ? (
          <div className="card p-6 text-center">
            <Package size={32} className="mx-auto text-dark-600 mb-2" />
            <p className="text-dark-400 text-sm">No products listed yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Auctions */}
      {auctions.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-dark-300 uppercase tracking-wider mb-2 px-1">
            Active Auctions ({auctions.length})
          </h2>
          
          <div className="space-y-2">
            {auctions.map((auction) => {
              const timeLeft = auction.ends_at ? new Date(auction.ends_at) - Date.now() : null
              const isEnding = timeLeft && timeLeft < 3600000
              let timeStr = ''
              if (timeLeft && timeLeft > 0) {
                const d = Math.floor(timeLeft / 86400000)
                const h = Math.floor((timeLeft % 86400000) / 3600000)
                const m = Math.floor((timeLeft % 3600000) / 60000)
                timeStr = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
              }
              return (
                <Link key={auction.id} to={`/auctions/${auction.id}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card p-3 hover:bg-dark-800/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {auction.image_url && (
                        <img src={auction.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Gavel size={14} className="text-amber-400 shrink-0" />
                          <h3 className="font-medium text-sm truncate">{auction.title}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <span className="text-primary-400 font-bold">
                            ${(auction.current_bid || auction.start_price).toFixed(2)}
                          </span>
                          {auction.bid_count > 0 && (
                            <span className="text-dark-500">{auction.bid_count} bid{auction.bid_count !== 1 ? 's' : ''}</span>
                          )}
                          {auction.buyout_price && (
                            <span className="text-dark-500">Buy: ${auction.buyout_price.toFixed(2)}</span>
                          )}
                          {timeStr && (
                            <span className={`flex items-center gap-1 ${isEnding ? 'text-red-400' : 'text-dark-400'}`}>
                              <Clock size={11} />
                              {timeStr}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Services */}
      {services.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-dark-300 uppercase tracking-wider mb-2 px-1">
            Services ({services.length})
          </h2>
          
          <div className="space-y-2">
            {services.map((service) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-3 hover:bg-dark-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase size={14} className="text-purple-400 shrink-0" />
                      <h3 className="font-medium text-sm truncate">{service.title}</h3>
                    </div>
                    {service.description && (
                      <p className="text-xs text-dark-400 line-clamp-2 mb-2">{service.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1 text-dark-400">
                        <Clock size={12} />
                        <span>{service.delivery_time}</span>
                      </div>
                      {service.orders_count > 0 && (
                        <span className="text-dark-500">{service.orders_count} orders</span>
                      )}
                      {service.rating > 0 && (
                        <div className="flex items-center gap-0.5">
                          <Star size={10} className="text-yellow-400 fill-yellow-400" />
                          <span className="text-dark-400">{service.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-primary-400 font-bold">${service.price.toFixed(2)}</span>
                    <span className="text-dark-500 text-xs block">starting</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-dark-300 uppercase tracking-wider mb-2 px-1">
            Recent Reviews
          </h2>
          
          <div className="space-y-2">
            {reviews.map((review) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="card p-3"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium">
                        {review.reviewer?.first_name?.[0] || review.reviewer?.username?.[0] || '?'}
                      </span>
                    </div>
                    <span className="text-sm font-medium truncate">
                      {review.reviewer?.first_name || review.reviewer?.username || 'User'}
                    </span>
                  </div>
                  <span className="text-[10px] text-dark-500 shrink-0">{timeAgo(review.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center gap-0.5">
                    {renderStars(review.rating, 10)}
                  </div>
                  {review.product?.name && (
                    <Link 
                      to={`/products/${review.product_id}`} 
                      className="text-[10px] text-dark-500 hover:text-primary-400 truncate"
                    >
                      {review.product.name}
                    </Link>
                  )}
                </div>
                {review.comment && (
                  <p className="text-xs text-dark-300 leading-relaxed">{review.comment}</p>
                )}
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
