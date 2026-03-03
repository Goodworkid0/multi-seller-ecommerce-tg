import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ArrowLeft, Star, Shield, Zap, Minus, Plus, 
  ShoppingCart, Check, User, MessageCircle
} from 'lucide-react'
import api from '../lib/api'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [reviews, setReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [contactLoading, setContactLoading] = useState(false)
  const [variants, setVariants] = useState([])
  const [selectedVariant, setSelectedVariant] = useState(null)
  
  const addItem = useCartStore(state => state.addItem)
  const { haptic, user } = useAuthStore()

  useEffect(() => {
    loadProduct()
    loadReviews()
    loadVariants()
  }, [id])

  const loadProduct = async () => {
    try {
      const { data } = await api.get(`/api/products/${id}`)
      setProduct(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadReviews = async () => {
    try {
      const { data } = await api.get(`/api/products/${id}/reviews`)
      setReviews(data)
    } catch {}
    finally { setReviewsLoading(false) }
  }

  const loadVariants = async () => {
    try {
      const { data } = await api.get(`/api/products/${id}/variants`)
      setVariants(data)
    } catch {}
  }

  const handleAddToCart = () => {
    if (!product) return
    // Pass variant info if selected
    const itemToAdd = selectedVariant 
      ? { ...product, variant: selectedVariant, price: selectedVariant.price, stock_count: selectedVariant.stock_count }
      : product
    addItem(itemToAdd, quantity)
    setAdded(true)
    haptic('success')
    setTimeout(() => setAdded(false), 2000)
  }

  const handleContactSeller = async () => {
    if (!product) return
    setContactLoading(true)
    try {
      const { data } = await api.post('/api/dm/start', {
        user_id: product.seller_id,
        message: `Hi, I'm interested in: ${product.name} ($${product.price.toFixed(2)})`,
        context_type: 'product',
        context_id: product.id,
        context_label: product.name
      })
      navigate(`/messages/${data.conversation_id}`)
    } catch (err) {
      console.error('Failed to start DM:', err)
    } finally {
      setContactLoading(false)
    }
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
      <div className="space-y-3 animate-pulse">
        <div className="h-6 bg-dark-800 rounded w-3/4" />
        <div className="h-4 bg-dark-800 rounded w-1/2" />
        <div className="h-20 bg-dark-800 rounded-xl" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">😕</div>
        <h2 className="font-semibold mb-2">Product not found</h2>
        <button onClick={() => navigate(-1)} className="btn-secondary">Go Back</button>
      </div>
    )
  }

  // Bulk discount calculation
  const currentPrice = selectedVariant ? selectedVariant.price : product.price
  const currentStock = selectedVariant ? selectedVariant.stock_count : product.stock_count
  const bulkTiers = product.bulk_discounts || []
  const activeTier = bulkTiers
    .filter(t => quantity >= t.min_qty)
    .sort((a, b) => b.min_qty - a.min_qty)[0] || null
  const unitPrice = activeTier 
    ? +(currentPrice * (1 - activeTier.discount_pct / 100)).toFixed(2) 
    : currentPrice
  const totalPrice = +(unitPrice * quantity).toFixed(2)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-3 pb-32"
    >
      {/* Back */}
      <button onClick={() => navigate(-1)} className="btn-ghost p-1 -ml-1 text-dark-400">
        <ArrowLeft size={20} />
      </button>

      {/* Product Image */}
      {product.image_url && (
        <div className="rounded-xl overflow-hidden border border-dark-700">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-48 object-cover"
          />
        </div>
      )}

      {/* Title + Price */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-lg font-bold leading-tight">{product.name}</h1>
          <div className="text-right shrink-0">
            <span className="text-xl font-bold text-primary-400">${currentPrice.toFixed(2)}</span>
            {activeTier && (
              <div className="text-xs text-accent-orange font-medium">-{activeTier.discount_pct}% bulk</div>
            )}
          </div>
        </div>

        {/* Meta line */}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-dark-400 flex-wrap">
          {product.platform && <span className="text-purple-400">#{product.platform}</span>}
          {product.platform && <span>•</span>}
          <span>{currentStock} in stock</span>
          {bulkTiers.length > 0 && (
            <>
              <span>•</span>
              <span className="text-accent-orange font-medium">Bulk discounts</span>
            </>
          )}
          {product.rating > 0 && (
            <>
              <span>•</span>
              <Star size={10} className="fill-yellow-400 text-yellow-400" />
              <span>{product.rating.toFixed(1)}</span>
            </>
          )}
        </div>
      </div>

      {/* Seller */}
      {product.seller && (
        <Link to={`/shop/${product.seller.id}`} className="card p-3 flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-primary-400/20 to-accent-purple/20 flex items-center justify-center shrink-0">
            {product.seller.avatar_url ? (
              <img 
                src={product.seller.avatar_url.startsWith('http') ? product.seller.avatar_url : `${import.meta.env.VITE_API_URL || ''}${product.seller.avatar_url}`} 
                alt={product.seller.shop_name || 'Seller'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-primary-400">
                {product.seller.shop_name?.[0]?.toUpperCase() || 'S'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium group-hover:text-primary-400 transition-colors truncate">
                {product.seller.shop_name || 'Seller'}
              </span>
              {(product.seller.collateral || 0) > 0 && (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                  ${product.seller.collateral.toFixed(0)} collateral
                </span>
              )}
            </div>
            <div className="text-[10px] text-dark-500">
              {product.seller.total_sales || product.sales_count || 0} sales
              {product.seller.seller_rating > 0 && ` • ${product.seller.seller_rating.toFixed(1)}★`}
            </div>
          </div>
          <span className="text-xs text-dark-500">Visit store →</span>
        </Link>
      )}

      {/* Warranty Info */}
      <div className={`card p-3 flex items-center gap-3 ${product.warranty_hours > 0 ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-dark-800/50 border border-dark-700'}`}>
        <Shield size={18} className={product.warranty_hours > 0 ? 'text-emerald-400' : 'text-dark-500'} />
        <div className="flex-1">
          {product.warranty_hours > 0 ? (
            <>
              <p className="text-xs font-medium text-emerald-300">
                {product.warranty_hours < 24 ? `${product.warranty_hours}h` : `${Math.round(product.warranty_hours / 24)} day`} Warranty
              </p>
              <p className="text-[10px] text-dark-400">Report issues within the warranty period for a refund</p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-dark-300">No Warranty</p>
              <p className="text-[10px] text-dark-500">Funds are non-refundable. You can still rate & report the seller.</p>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <div className="card p-3">
          <p className="text-dark-400 text-sm leading-relaxed whitespace-pre-wrap">{product.description}</p>
        </div>
      )}

      {/* Variants */}
      {variants.length > 0 && (
        <div className="card p-3 space-y-2">
          <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Select Variant</h3>
          <div className="flex flex-wrap gap-2">
            {variants.map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : v)}
                className={`px-3 py-2 rounded-lg text-sm transition-all ${
                  selectedVariant?.id === v.id 
                    ? 'bg-primary-500 text-white' 
                    : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                } ${v.stock_count === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={v.stock_count === 0}
              >
                <span className="font-medium">{v.name}</span>
                <span className="ml-2 text-xs opacity-80">${v.price.toFixed(2)}</span>
                {v.stock_count === 0 && <span className="ml-1 text-xs">(Out of stock)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Discount Tiers */}
      {bulkTiers.length > 0 && (
        <div className="card p-3 space-y-2">
          <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Bulk Discounts</h3>
          <div className="space-y-1">
            {[...bulkTiers].sort((a, b) => a.min_qty - b.min_qty).map((tier, i) => {
              const tierPrice = +(product.price * (1 - tier.discount_pct / 100)).toFixed(2)
              const isActive = activeTier?.min_qty === tier.min_qty
              return (
                <div key={i} className={`flex items-center justify-between text-sm px-2 py-1.5 rounded-lg transition-colors ${isActive ? 'bg-primary-400/10 text-primary-400' : 'text-dark-300'}`}>
                  <span>Buy {tier.min_qty}+</span>
                  <div className="flex items-center gap-2">
                    <span className="text-accent-orange text-xs">-{tier.discount_pct}%</span>
                    <span className="font-medium">${tierPrice.toFixed(2)} each</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Trust badges */}
      <div className="flex items-center gap-3 px-1 text-xs text-dark-500">
        <span className="flex items-center gap-1"><Zap size={12} className="text-primary-400" /> Instant delivery</span>
        <span className="flex items-center gap-1"><Shield size={12} className="text-primary-400" /> Buyer protection</span>
      </div>

      {/* Reviews */}
      {!reviewsLoading && reviews.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider px-1">
            Reviews ({product.review_count})
          </h3>
          {reviews.map(review => (
            <div key={review.id} className="card p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-dark-700 flex items-center justify-center">
                    <span className="text-[9px] font-medium">
                      {review.reviewer?.first_name?.[0] || review.reviewer?.username?.[0] || '?'}
                    </span>
                  </div>
                  <span className="text-xs font-medium">
                    {review.reviewer?.first_name || review.reviewer?.username || 'Buyer'}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} size={9} className={s <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-dark-700'} />
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-dark-500">{timeAgo(review.created_at)}</span>
              </div>
              {review.comment && (
                <p className="text-xs text-dark-300 leading-relaxed">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-[60px] left-0 right-0 glass border-t border-dark-800 p-3 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {/* Contact Seller - only if not own product */}
          {product.seller_id !== user?.id && (
            <button
              onClick={handleContactSeller}
              disabled={contactLoading}
              className="p-2.5 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors disabled:opacity-50"
              title="Contact Seller"
            >
              <MessageCircle size={18} className="text-primary-400" />
            </button>
          )}

          {/* Quantity */}
          <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-1">
            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="p-1.5 hover:bg-dark-700 rounded">
              <Minus size={14} />
            </button>
            <span className="w-7 text-center text-sm">{quantity}</span>
            <button onClick={() => setQuantity(q => Math.min(currentStock, q + 1))} className="p-1.5 hover:bg-dark-700 rounded">
              <Plus size={14} />
            </button>
          </div>

          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            disabled={currentStock === 0}
            className={`flex-1 btn ${added ? 'bg-green-500 text-white' : 'btn-primary'} flex items-center justify-center gap-2`}
          >
            {added ? (
              <><Check size={16} /> Added!</>
            ) : (
              <><ShoppingCart size={16} /> Add — ${totalPrice.toFixed(2)}{activeTier ? ` (-${activeTier.discount_pct}%)` : ''}</>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
