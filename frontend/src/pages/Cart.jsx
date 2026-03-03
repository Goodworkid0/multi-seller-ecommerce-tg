import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Minus, Plus, ShoppingBag, ArrowRight } from 'lucide-react'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../components/Toast'
import api from '../lib/api'

export default function Cart() {
  const navigate = useNavigate()
  const { items, removeItem, updateQuantity, clearCart } = useCartStore()
  const { user, haptic, setUser } = useAuthStore()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [orderResult, setOrderResult] = useState(null)
  const [banners, setBanners] = useState([])
  const [bannerIndex, setBannerIndex] = useState(0)

  useEffect(() => {
    if (items.length === 0 && !orderResult) {
      api.get('/api/banners').then(r => setBanners((r.data || []).filter(b => b.position === 'above_wtb' || b.position === 'above_categories'))).catch(() => {})
    }
  }, [items.length, orderResult])

  // Banner rotation
  useEffect(() => {
    if (banners.length <= 1) return
    const interval = setInterval(() => {
      setBannerIndex(prev => (prev + 1) % banners.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [banners.length])

  const getItemPrice = (item) => {
    const basePrice = item.product.price // Already includes variant price if selected
    const tiers = item.product.bulk_discounts || []
    const active = tiers
      .filter(t => item.quantity >= t.min_qty)
      .sort((a, b) => b.min_qty - a.min_qty)[0]
    const unit = active 
      ? +(basePrice * (1 - active.discount_pct / 100)).toFixed(2) 
      : basePrice
    return { unit, total: +(unit * item.quantity).toFixed(2), discount: active }
  }

  // Generate unique key for cart item (product + variant)
  const getItemKey = (item) => {
    return item.product.variant 
      ? `${item.product.id}-v${item.product.variant.id}` 
      : `${item.product.id}`
  }

  const total = items.reduce((sum, i) => sum + getItemPrice(i).total, 0)

  const handleCheckout = async () => {
    if (!user) {
      addToast('Please login first', { type: 'error' })
      return
    }

    setLoading(true)
    try {
      // Create order - include variant_id if present
      const orderRes = await api.post('/api/orders', {
        items: items.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          variant_id: i.product.variant?.id || null
        }))
      })

      // Simulate payment
      const payRes = await api.post(`/api/orders/${orderRes.data.id}/pay`)

      // Refresh user immediately so wallet updates without waiting for polling
      const { data: me } = await api.get('/api/auth/me')
      setUser(me)

      setOrderResult(payRes.data)
      clearCart()
      haptic('success')
      window.dispatchEvent(new Event('refresh-signals'))
    } catch (error) {
      console.error(error)
      addToast(error.response?.data?.detail || 'Checkout failed', { type: 'error' })
      haptic('error')
    } finally {
      setLoading(false)
    }
  }

  // Success screen
  if (orderResult) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-12"
      >
        <div className="w-20 h-20 bg-primary-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="text-4xl"
          >
            ✅
          </motion.div>
        </div>
        
        <h1 className="font-display text-2xl font-bold mb-2">Order Complete!</h1>
        <p className="text-dark-400 mb-6">Your keys have been delivered</p>

        {/* Delivered Keys */}
        <div className="card text-left mb-6">
          <h3 className="font-semibold mb-3">Your Keys</h3>
          {orderResult.items.map((item, i) => (
            <div key={i} className="mb-4 last:mb-0">
              <p className="text-sm text-dark-400 mb-2">{item.product_name}</p>
              {item.keys.map((key, j) => (
                <div key={j} className="bg-dark-800 rounded-lg p-3 font-mono text-sm mb-2 flex items-center justify-between">
                  <span>{key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(key)
                      haptic('light')
                    }}
                    className="text-primary-400 text-xs"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Link to="/orders" className="btn-secondary flex-1">
            View Orders
          </Link>
          <Link to="/products" className="btn-primary flex-1">
            Continue Shopping
          </Link>
        </div>
      </motion.div>
    )
  }

  if (items.length === 0) {
    const banner = banners[bannerIndex]
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShoppingBag size={32} className="text-dark-500" />
        </div>
        <h2 className="font-display text-xl font-bold mb-2">Cart is empty</h2>
        <p className="text-dark-400 mb-6">Add some products to get started</p>
        <Link to="/products" className="btn-primary inline-flex items-center gap-2">
          Browse Products
          <ArrowRight size={18} />
        </Link>

        {banner && (
          <div className="relative mt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className={`rounded-xl overflow-hidden bg-gradient-to-r from-${banner.gradient_from}/15 via-${banner.gradient_to}/10 to-${banner.gradient_from}/15 border border-white/[0.06] backdrop-blur-sm p-4 flex items-center justify-between gap-3 text-left`}
              >
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-sm leading-tight">{banner.title}</h3>
                  {banner.subtitle && <p className="text-xs text-dark-300 mt-0.5 leading-relaxed">{banner.subtitle}</p>}
                </div>
                {banner.link && (
                  <Link to={banner.link} className="shrink-0 text-xs font-medium px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/[0.06] transition-all">
                    {banner.link_text || 'Learn More'}
                  </Link>
                )}
              </motion.div>
            </AnimatePresence>
            
            {banners.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {banners.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setBannerIndex(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${idx === bannerIndex ? 'bg-white w-3' : 'bg-white/40 hover:bg-white/60'}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-32">
      <h1 className="font-display text-xl font-bold">Cart ({items.length})</h1>

      {/* Cart Items */}
      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={getItemKey(item)}
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="card p-4 flex gap-4"
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm line-clamp-2">{item.product.name}</h3>
              <div className="flex items-center gap-2 text-xs text-dark-400 mt-0.5">
                {item.product.variant && (
                  <span className="text-primary-400">{item.product.variant.name}</span>
                )}
                {item.product.platform && (
                  <span>#{item.product.platform}</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <span className="text-primary-400 font-bold">
                    ${getItemPrice(item).total.toFixed(2)}
                  </span>
                  {getItemPrice(item).discount && (
                    <span className="text-xs text-accent-orange ml-1.5">-{getItemPrice(item).discount.discount_pct}%</span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.product.variant?.id || null)}
                    className="p-1.5 bg-dark-800 rounded hover:bg-dark-700"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.product.variant?.id || null)}
                    className="p-1.5 bg-dark-800 rounded hover:bg-dark-700"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => {
                      removeItem(item.product.id, item.product.variant?.id || null)
                      haptic('medium')
                    }}
                    className="p-1.5 text-red-400 hover:bg-red-400/10 rounded ml-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Summary */}
      <div className="fixed bottom-16 left-0 right-0 glass border-t border-dark-800 p-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="text-dark-400">Total</span>
            <span className="text-2xl font-bold">${total.toFixed(2)}</span>
          </div>
          
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Checkout
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
