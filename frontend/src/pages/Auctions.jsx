import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Search, X, Gavel, ChevronRight, ChevronLeft, Timer, DollarSign, Zap
} from 'lucide-react'
import api from '../lib/api'

function formatTimeLeft(endDate) {
  if (!endDate) return 'No bids yet'
  const now = new Date()
  const end = new Date(endDate)
  const diff = end - now
  
  if (diff <= 0) return 'Ended'
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  
  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
}

function AuctionCard({ auction }) {
  const timeLeft = formatTimeLeft(auction.ends_at)
  const isEnding = timeLeft.includes('m') && !timeLeft.includes('h') && !timeLeft.includes('d')
  const hasNoBids = auction.bid_count === 0
  
  return (
    <Link to={`/auctions/${auction.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card group hover:border-amber-500/30 transition-all"
      >
        {/* Image */}
        <div className="aspect-video bg-dark-800 rounded-lg mb-3 overflow-hidden relative">
          {auction.image_url ? (
            <img src={auction.image_url} alt={auction.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-500/10 to-orange-500/10">
              <Gavel size={28} className="text-amber-500/50" />
            </div>
          )}
          {auction.buyout_price && (
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-500/90 text-white text-[10px] font-bold rounded flex items-center gap-0.5">
              <Zap size={10} />
              Buyout
            </div>
          )}
        </div>
        
        {/* Info */}
        <h3 className="font-medium text-sm mb-2 truncate group-hover:text-amber-400 transition-colors">
          {auction.title}
        </h3>
        
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[10px] text-dark-500">{hasNoBids ? 'Start Price' : 'Current Bid'}</div>
            <div className="text-base font-bold text-amber-400">
              ${(auction.current_bid || auction.start_price)?.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-dark-500">Bids</div>
            <div className="font-semibold text-sm">{auction.bid_count || 0}</div>
          </div>
        </div>
        
        {/* Min increment */}
        <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mb-2">
          <DollarSign size={10} />
          <span>Min increment: ${auction.blitz_price?.toFixed(2) || '1.00'}</span>
        </div>
        
        {/* Time left */}
        <div className={`flex items-center gap-1.5 text-xs ${isEnding ? 'text-red-400 animate-pulse' : 'text-dark-400'}`}>
          <Timer size={12} />
          <span>{timeLeft}</span>
          {auction.duration_days && hasNoBids && (
            <span className="text-dark-600">· {auction.duration_days}d after last bid</span>
          )}
        </div>
      </motion.div>
    </Link>
  )
}

export default function Auctions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [sort, setSort] = useState(searchParams.get('sort') || 'ending_soon')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    loadAuctions()
  }, [sort, page])

  const loadAuctions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchParams.get('search')) params.append('search', searchParams.get('search'))
      if (sort) params.append('sort', sort)
      params.append('page', page)
      
      const { data } = await api.get(`/api/auctions?${params}`)
      setAuctions(data.items || data)
      setTotalPages(data.pages || 1)
      setTotalCount(data.total || 0)
    } catch (e) {
      console.error(e)
      setAuctions([])
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
    loadAuctions()
  }

  const clearSearch = () => {
    setSearch('')
    const next = new URLSearchParams(searchParams)
    next.delete('search')
    setSearchParams(next)
    setPage(1)
    setTimeout(loadAuctions, 0)
  }

  const handleSortChange = (newSort) => {
    setSort(newSort)
    const next = new URLSearchParams(searchParams)
    next.set('sort', newSort)
    setSearchParams(next)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Link 
        to="/products" 
        className="inline-flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-50 transition-colors"
      >
        <ChevronRight size={14} className="rotate-180" />
        Back to Marketplace
      </Link>

      <div>
        <h1 className="font-display text-xl font-bold flex items-center gap-2">
          <Gavel size={22} className="text-amber-400" />
          Auctions
        </h1>
        <p className="text-xs text-dark-400">Bid on unique items from sellers</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500" size={18} />
        <input
          type="text"
          placeholder="Search auctions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-11 pr-10"
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

      {/* Sort */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'ending_soon', label: 'Ending Soon' },
          { id: 'newest', label: 'Newest' },
          { id: 'most_bids', label: 'Most Bids' },
          { id: 'price_low', label: 'Price: Low' },
          { id: 'price_high', label: 'Price: High' },
        ].map(option => (
          <button
            key={option.id}
            onClick={() => handleSortChange(option.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              sort === option.id 
                ? 'bg-amber-500 text-white' 
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Auctions List */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="aspect-video bg-dark-800 rounded-lg mb-3" />
              <div className="h-4 bg-dark-800 rounded w-3/4 mb-2" />
              <div className="h-5 bg-dark-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card text-center py-12"
        >
          <div className="text-4xl mb-4">🔨</div>
          <h3 className="font-semibold mb-2">No active auctions</h3>
          <p className="text-sm text-dark-400 mb-4">
            Check back soon for new listings!
          </p>
          <Link 
            to="/seller/auctions"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Gavel size={16} />
            Create Auction
          </Link>
        </motion.div>
      ) : (
        <>
          <p className="text-xs text-dark-500">{totalCount} active auction{totalCount !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 gap-3">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        </>
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
