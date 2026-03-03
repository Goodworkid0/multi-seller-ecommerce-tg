timport { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Search, X, ChevronRight, ChevronLeft, Clock, User, Star, Briefcase, Folder, Rocket, GraduationCap, Palette, Code, PenTool, Megaphone, Zap, Shield, Wrench, Globe } from 'lucide-react'

const ICON_MAP = {
  'briefcase': Briefcase,
  'rocket': Rocket,
  'graduation-cap': GraduationCap,
  'palette': Palette,
  'code': Code,
  'pen-tool': PenTool,
  'megaphone': Megaphone,
  'zap': Zap,
  'shield': Shield,
  'star': Star,
  'wrench': Wrench,
  'globe': Globe,
}
import { motion } from 'framer-motion'
import api from '../lib/api'

export default function Services() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [categoriesExpanded, setCategoriesExpanded] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [categories, setCategories] = useState([])

  const category = searchParams.get('category') || ''

  useEffect(() => {
    api.get('/api/services/categories').then(r => setCategories(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadServices()
  }, [category, page])

  const loadServices = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (searchParams.get('search')) params.set('search', searchParams.get('search'))
      params.set('page', page)
      
      const { data } = await api.get(`/api/services?${params}`)
      setServices(data.items)
      setTotalPages(data.pages || 1)
      setTotalCount(data.total || 0)
    } catch (e) {
      console.error(e)
      setServices([])
    } finally {
      setLoading(false)
    }
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

  const handleSearch = (e) => {
    e.preventDefault()
    setParam('search', search.trim())
    setPage(1)
    loadServices()
  }

  const clearSearch = () => {
    setSearch('')
    const next = new URLSearchParams(searchParams)
    next.delete('search')
    setSearchParams(next)
    setPage(1)
    setTimeout(loadServices, 0)
  }

  const selectCategory = (catId) => {
    setParam('category', category === catId ? '' : catId)
    setPage(1)
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

      {/* Browse by Service */}
      <div className="card p-0 overflow-hidden">
        <button
          onClick={() => setCategoriesExpanded(!categoriesExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-dark-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Folder size={14} className="text-primary-400" />
            <span className="font-medium text-sm">Browse by Service</span>
            <span className="text-xs text-dark-500">({categories.length})</span>
          </div>
          <ChevronRight 
            size={16} 
            className={`text-dark-500 transition-transform ${categoriesExpanded ? 'rotate-90' : ''}`} 
          />
        </button>
        
        {categoriesExpanded && (
          <div className="border-t border-dark-800 p-2 grid grid-cols-2 gap-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat.id)}
                className={`bg-dark-800/50 rounded-lg p-2.5 text-left transition-all hover:bg-dark-700/50 ${
                  category === cat.id ? 'ring-1 ring-primary-500/50' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {(() => { const Icon = ICON_MAP[cat.icon] || Briefcase; return <Icon size={16} className="text-primary-400" /> })()}
                  <span className="font-medium text-xs">{cat.name}</span>
                </div>
                <p className="text-[10px] text-dark-500 line-clamp-1">{cat.count} {cat.count === 1 ? 'service' : 'services'}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500" size={20} />
        <input
          type="text"
          placeholder="Search services or providers..."
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

      {/* Services List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse p-4">
              <div className="flex gap-3">
                <div className="w-12 h-12 bg-dark-800 rounded-xl" />
                <div className="flex-1">
                  <div className="h-4 bg-dark-800 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-dark-800 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-dark-800 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : services.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card text-center py-12"
        >
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="font-semibold mb-2">No services yet</h3>
          <p className="text-sm text-dark-400 mb-4">
            Be the first to offer your skills!
          </p>
          <Link 
            to="/seller/services"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Briefcase size={16} />
            Offer Your Service
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {services.map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link 
                to={`/services/${service.id}`}
                className="card-hover p-4 flex gap-3"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center shrink-0">
                  <Briefcase size={20} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{service.title}</h3>
                  <p className="text-xs text-dark-400 line-clamp-2 mb-2">{service.description}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-dark-400">
                      <User size={12} />
                      {service.seller_name}
                    </span>
                    {service.rating > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star size={12} />
                        {service.rating.toFixed(1)}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-dark-400">
                      <Clock size={12} />
                      {service.delivery_time}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-primary-400">${service.price}</p>
                  <p className="text-[10px] text-dark-500">starting</p>
                </div>
              </Link>
            </motion.div>
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
