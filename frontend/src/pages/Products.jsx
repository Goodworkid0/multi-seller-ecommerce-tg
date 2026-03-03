import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Search, X, ChevronDown, ChevronRight, ChevronLeft, Tag, TrendingUp, Folder, Package, Briefcase, Gavel, ArrowRight, Shield, AlertTriangle, Star, DollarSign, ShoppingBag } from 'lucide-react'
import { motion } from 'framer-motion'
import api from '../lib/api'
import ProductCard from '../components/ProductCard'

const MARKETPLACE_TYPES = [
  { 
    id: 'products', 
    icon: Package, 
    label: 'Products', 
    description: 'Digital goods, accounts, keys, and instant deliveries',
    color: 'from-primary-500/20 to-emerald-500/20',
    iconColor: 'text-primary-400',
    path: '/products?type=products'
  },
  { 
    id: 'services', 
    icon: Briefcase, 
    label: 'Services', 
    description: 'Custom work, boosts, coaching, and professional help',
    color: 'from-blue-500/20 to-cyan-500/20',
    iconColor: 'text-blue-400',
    path: '/services'
  },
  { 
    id: 'auctions', 
    icon: Gavel, 
    label: 'Auctions', 
    description: 'Bid on rare items and exclusive deals',
    color: 'from-amber-500/20 to-orange-500/20',
    iconColor: 'text-amber-400',
    path: '/auctions'
  },
  { 
    id: 'wtb', 
    icon: ShoppingBag, 
    label: 'Want to Buy', 
    description: 'Post what you need — sellers will find you',
    color: 'from-pink-500/20 to-rose-500/20',
    iconColor: 'text-pink-400',
    path: '/wtb'
  },
]

const SORT_OPTIONS = [
  { value: '', label: 'Best Selling' },
  { value: 'name_asc', label: 'Name A → Z' },
  { value: 'name_desc', label: 'Name Z → A' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'most_reviewed', label: 'Most Reviewed' },
  { value: 'newest', label: 'Newest' },
]

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [tagCategories, setTagCategories] = useState([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [categoriesExpanded, setCategoriesExpanded] = useState(true)
  const [banners, setBanners] = useState([])
  const [counts, setCounts] = useState({})

  const marketplaceType = searchParams.get('type') || ''
  const tagParam = searchParams.get('tag') || ''
  const selectedTags = tagParam ? tagParam.split(',').filter(Boolean) : []
  const sort = searchParams.get('sort') || ''
  const searchParam = searchParams.get('search') || ''

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    loadTagCategories()
    api.get('/api/banners').then(r => setBanners(r.data || [])).catch(() => {})
    api.get('/api/products/marketplace-counts').then(r => setCounts(r.data || {})).catch(() => {})
  }, [])

  useEffect(() => {
    loadProducts()
  }, [tagParam, sort, searchParam, page])

  // Sync search input with URL param
  useEffect(() => {
    setSearch(searchParam)
  }, [searchParam])

  const loadTagCategories = async () => {
    try {
      const { data } = await api.get('/api/products/tag-categories')
      setTagCategories(data)
    } catch (e) {
      console.error(e)
    } finally {
      setTagsLoading(false)
    }
  }

  const loadProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tagParam) params.append('tag', tagParam)
      if (sort) params.append('sort', sort)
      if (searchParam) params.append('search', searchParam)
      params.append('page', page)

      const { data } = await api.get(`/api/products?${params}`)
      setProducts(data.items)
      setTotalPages(data.pages || 1)
      setTotalCount(data.total || 0)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    const next = new URLSearchParams(searchParams)
    if (search.trim()) {
      next.set('search', search.trim())
    } else {
      next.delete('search')
    }
    setSearchParams(next)
    setPage(1)
  }

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    setSearchParams(next)
  }

  const handleTagClick = (tagName) => {
    const next = new URLSearchParams(searchParams)
    if (selectedTags.includes(tagName)) {
      // Remove tag
      const newTags = selectedTags.filter(t => t !== tagName)
      if (newTags.length > 0) {
        next.set('tag', newTags.join(','))
      } else {
        next.delete('tag')
      }
    } else {
      // Add tag
      const newTags = [...selectedTags, tagName]
      next.set('tag', newTags.join(','))
    }
    setSearchParams(next)
  }

  const removeTag = (tagName) => {
    const next = new URLSearchParams(searchParams)
    const newTags = selectedTags.filter(t => t !== tagName)
    if (newTags.length > 0) {
      next.set('tag', newTags.join(','))
    } else {
      next.delete('tag')
    }
    setSearchParams(next)
  }

  const clearSearch = () => {
    setSearch('')
    const next = new URLSearchParams(searchParams)
    next.delete('search')
    setSearchParams(next)
    setPage(1)
  }

  // Marketplace type selection screen
  if (!marketplaceType) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold">What are you looking for?</h1>
        </div>
        
        <div className="space-y-3">
          {MARKETPLACE_TYPES.map((type, i) => (
            <motion.div
              key={type.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              {type.comingSoon ? (
                <div className="card p-4 opacity-60 cursor-not-allowed">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center shrink-0`}>
                      <type.icon size={28} className={type.iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-semibold text-lg">{type.label}</h3>
                        <span className="px-2 py-0.5 rounded-full bg-dark-700 text-[10px] font-medium text-dark-400">Coming Soon</span>
                      </div>
                      <p className="text-sm text-dark-400">{type.description}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <Link 
                  to={type.path}
                  className="card-hover p-4 flex items-center gap-4 group"
                >
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center shrink-0`}>
                    <type.icon size={28} className={type.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold text-lg">{type.label}</h3>
                      {counts[type.id] > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-medium text-dark-300">{counts[type.id]}</span>
                      )}
                    </div>
                    <p className="text-sm text-dark-400">{type.description}</p>
                  </div>
                  <ArrowRight size={20} className="text-dark-600 group-hover:text-primary-400 transition-colors" />
                </Link>
              )}
            </motion.div>
          ))}
        </div>

        {/* Marketplace Safety Rules */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card p-4 space-y-3 border border-amber-500/20"
        >
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={18} />
            <h3 className="font-semibold text-sm">Marketplace Safety</h3>
          </div>
          
          <div className="space-y-2 text-xs text-dark-400">
            <div className="flex items-start gap-2">
              <Star size={14} className="text-primary-400 mt-0.5 shrink-0" />
              <p><span className="text-dark-200 font-medium">Check seller reviews</span> — Read feedback from other buyers before purchasing. Look for consistent positive ratings.</p>
            </div>
            <div className="flex items-start gap-2">
              <DollarSign size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              <p><span className="text-dark-200 font-medium">Verify collateral</span> — Sellers with higher collateral have more "skin in the game" and are less likely to scam.</p>
            </div>
            <div className="flex items-start gap-2">
              <Shield size={14} className="text-blue-400 mt-0.5 shrink-0" />
              <p><span className="text-dark-200 font-medium">Stay vigilant</span> — Digital goods transactions always carry risk. If a deal seems too good to be true, it probably is.</p>
            </div>
          </div>
        </motion.div>

        {/* Banners from homepage */}
        {banners.filter(b => b.position === 'above_wtb' || b.position === 'above_categories').map((banner, idx) => (
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 + idx * 0.05 }}
            className="rounded-xl overflow-hidden border border-white/[0.06] backdrop-blur-sm"
          >
            {banner.image_url ? (
              <Link to={banner.link || '#'} className="block relative group">
                <div style={{ aspectRatio: '864/200' }} className="w-full overflow-hidden bg-dark-900">
                  <img 
                    src={banner.image_url} 
                    alt={banner.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Optional overlay with title on hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">{banner.link_text || 'View'}</span>
                </div>
              </Link>
            ) : (
              <div className={`p-4 flex items-center justify-between gap-3 bg-gradient-to-r from-${banner.gradient_from}/15 via-${banner.gradient_to}/10 to-${banner.gradient_from}/15`}>
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-sm leading-tight">{banner.title}</h3>
                  {banner.subtitle && <p className="text-xs text-dark-300 mt-0.5 leading-relaxed">{banner.subtitle}</p>}
                </div>
                {banner.link && (
                  <Link to={banner.link} className="shrink-0 text-xs font-medium px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/[0.06] transition-all">
                    {banner.link_text || 'Learn More'}
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Back to selection */}
      <Link 
        to="/products" 
        className="inline-flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-50 transition-colors"
      >
        <ChevronRight size={14} className="rotate-180" />
        Back to Marketplace
      </Link>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500" size={20} />
        <input
          type="text"
          placeholder="Search products, shops, tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-12 pr-10"
        />
        {search && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
          >
            <X size={16} />
          </button>
        )}
      </form>

      {/* Tag Categories */}
      {tagCategories.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <button
            onClick={() => setCategoriesExpanded(!categoriesExpanded)}
            className="w-full flex items-center justify-between p-3 hover:bg-dark-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Folder size={14} className="text-primary-400" />
              <span className="font-medium text-sm">Browse by Category</span>
              <span className="text-xs text-dark-500">({tagCategories.reduce((acc, c) => acc + c.total_count, 0)})</span>
            </div>
            <ChevronRight 
              size={16} 
              className={`text-dark-500 transition-transform ${categoriesExpanded ? 'rotate-90' : ''}`} 
            />
          </button>
          
          {categoriesExpanded && (
            <div className="border-t border-dark-800 p-2 grid grid-cols-2 gap-2">
              {tagCategories.map(category => (
                <div key={category.id} className="bg-dark-800/50 rounded-lg p-2 space-y-1.5">
                  <button 
                    onClick={() => {
                      // Select all children tags for this category
                      const childTags = category.children.map(c => c.name)
                      const allSelected = childTags.every(t => selectedTags.includes(t))
                      if (allSelected) {
                        // Deselect all
                        const newTags = selectedTags.filter(t => !childTags.includes(t))
                        setParam('tag', newTags.join(',') || null)
                      } else {
                        // Select all
                        const newTags = [...new Set([...selectedTags, ...childTags])]
                        setParam('tag', newTags.join(','))
                      }
                    }}
                    className="flex items-center gap-1.5 hover:text-primary-400 transition-colors"
                  >
                    <span className="font-medium text-xs">{category.name}</span>
                    <span className="text-[10px] text-dark-500">({category.total_count})</span>
                  </button>
                  {category.children.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {category.children.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => handleTagClick(tag.name)}
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                            selectedTags.includes(tag.name)
                              ? 'bg-primary-500 text-white'
                              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                          }`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active filters row */}
      {(selectedTags.length > 0 || searchParams.get('search')) && (
        <div className="flex items-center gap-2 flex-wrap">
          {searchParams.get('search') && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">
              <Search size={10} />
              "{searchParams.get('search')}"
              <button onClick={clearSearch}><X size={11} /></button>
            </span>
          )}
          {selectedTags.map(t => (
            <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-500/15 text-primary-400">
              <Tag size={10} />
              {t}
              <button onClick={() => removeTag(t)}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            className="input appearance-none pr-10 text-sm"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-dark-400">
        {totalCount} products found
      </div>

      {/* Products List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse flex items-center gap-3 p-3">
              <div className="flex-1">
                <div className="h-4 bg-dark-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-dark-800 rounded w-1/2" />
              </div>
              <div className="h-5 bg-dark-800 rounded w-16" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="font-semibold mb-2">No products found</h3>
          <p className="text-dark-400 text-sm">Try a different search or remove filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} onTagClick={handleTagClick} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0) }}
            disabled={page <= 1}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="text-xs text-dark-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0) }}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
