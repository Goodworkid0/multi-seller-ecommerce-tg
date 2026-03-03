import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Star } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export default function ProductCard({ product, index = 0, onTagClick }) {
  const [hovered, setHovered] = useState(false)
  const [showAbove, setShowAbove] = useState(false)
  const cardRef = useRef(null)

  // Find best bulk discount for display
  const bestDiscount = product.bulk_discounts?.length
    ? product.bulk_discounts.reduce((best, t) => t.discount_pct > (best?.discount_pct || 0) ? t : best, null)
    : null

  useEffect(() => {
    if (hovered && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setShowAbove(spaceBelow < 160)
    }
  }, [hovered])

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
    >
      <Link to={`/products/${product.id}`} className="block card-hover group p-3">
        <div className="flex items-center gap-3">
          {/* Product Image */}
          {product.image_url && (
            <img
              src={product.image_url}
              alt=""
              className="w-10 h-10 rounded-lg object-cover shrink-0 border border-dark-700"
            />
          )}
          {/* Left: product info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-sm truncate group-hover:text-primary-400 transition-colors">
                {product.name}
              </h3>
              {bestDiscount && (
                <span className="badge bg-accent-orange text-white text-[10px] shrink-0">
                  Up to -{bestDiscount.discount_pct}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-dark-400 flex-wrap">
              {/* Tags (multi or legacy platform) */}
              {(product.tags && product.tags.length > 0
                ? product.tags
                : product.platform ? [product.platform] : []
              ).map((t, i) => (
                onTagClick ? (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onTagClick(t)
                    }}
                    className="text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                  >
                    #{t}
                  </button>
                ) : (
                  <span key={i} className="text-purple-400">#{t}</span>
                )
              ))}
              {((product.tags?.length > 0) || product.platform) && <span>•</span>}
              <span>{product.stock_count} in stock</span>
              <span>•</span>
              <span>{product.sales_count} sold</span>
              {product.rating > 0 && (
                <>
                  <span>•</span>
                  <Star size={10} className="fill-yellow-500 text-yellow-500" />
                  <span>{product.rating.toFixed(1)}</span>
                </>
              )}
            </div>
          </div>
          
          {/* Right: price */}
          <div className="text-right shrink-0">
            <span className="text-base font-bold text-primary-400">
              ${product.price.toFixed(2)}
            </span>
          </div>
        </div>
      </Link>

      {/* Hover tooltip — full name + description */}
      <AnimatePresence>
        {hovered && product.description && (
          <motion.div
            initial={{ opacity: 0, y: showAbove ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: showAbove ? 6 : -6 }}
            transition={{ duration: 0.15 }}
            className={`absolute left-0 right-0 z-50 mx-2 rounded-lg bg-dark-800 border border-dark-700 shadow-xl p-3 pointer-events-none ${
              showAbove ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            <h4 className="font-semibold text-sm text-dark-50 mb-1 break-words">
              {product.name}
            </h4>
            <p className="text-xs text-dark-300 leading-relaxed line-clamp-4 break-words">
              {product.description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
