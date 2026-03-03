import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, DollarSign, ShoppingCart, 
  X, Key, Briefcase, Gavel, Timer,
  AlertTriangle, ChevronRight,
  Store, Eye, Settings, ArrowDownToLine, Shield, Crown, Palette, MessageSquareText, Image
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

const statusClass = (status) => {
  const v = String(status || '').toLowerCase()
  if (v === 'paid' || v === 'delivered') return 'bg-emerald-500/15 text-emerald-400'
  if (v === 'pending') return 'bg-yellow-500/15 text-yellow-400'
  if (v === 'cancelled' || v === 'refunded') return 'bg-red-500/15 text-red-400'
  return 'bg-dark-800 text-dark-300'
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

export default function SellerDashboard() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [stats, setStats] = useState(null)
  const [auctions, setAuctions] = useState([])
  const [services, setServices] = useState([])
  const [orders, setOrders] = useState([])
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [activityTab, setActivityTab] = useState('orders')
  const [showStockModal, setShowStockModal] = useState(false)
  const [showCustomizeModal, setShowCustomizeModal] = useState(false)
  const [showCollateralModal, setShowCollateralModal] = useState(false)
  const [showRankModal, setShowRankModal] = useState(false)
  const [products, setProducts] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [productVariants, setProductVariants] = useState([])
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [stockInput, setStockInput] = useState('')
  const [stockStatus, setStockStatus] = useState({ status: 'idle', message: '' })
  
  // Customize modal state
  const [shopForm, setShopForm] = useState({ shop_name: user?.shop_name || '', shop_description: user?.shop_description || '' })
  const [shopStatus, setShopStatus] = useState({ status: 'idle', message: '' })
  
  // Collateral modal state
  const [collateralAmount, setCollateralAmount] = useState('')
  const [collateralStatus, setCollateralStatus] = useState({ status: 'idle', message: '' })
  
  // Rank modal state
  const [ranks, setRanks] = useState([])
  const [featuredCost, setFeaturedCost] = useState(200)
  const [rankStatus, setRankStatus] = useState({ status: 'idle', message: '' })

  useEffect(() => {
    loadStats()
    loadAuctions()
    loadServices()
    loadOrders()
    loadDisputes()
  }, [])

  const loadStats = async () => {
    try {
      const { data } = await api.get('/api/sellers/stats')
      setStats(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadAuctions = async () => {
    try {
      const { data } = await api.get('/api/auctions/my')
      setAuctions(data.filter(a => a.status === 'active'))
    } catch (e) {
      console.error(e)
    }
  }

  const loadServices = async () => {
    try {
      const { data } = await api.get('/api/services/my')
      setServices(data.filter(s => s.is_active))
    } catch (e) {
      console.error(e)
    }
  }

  const loadOrders = async () => {
    try {
      const { data } = await api.get('/api/orders/seller')
      setOrders(data)
    } catch { setOrders([]) }
  }

  const loadDisputes = async () => {
    try {
      const { data } = await api.get('/api/orders/seller/disputes')
      setDisputes(data || [])
    } catch { setDisputes([]) }
  }

  const formatTimeLeft = (endDate) => {
    if (!endDate) return 'Not started'
    const now = new Date()
    const end = new Date(endDate)
    const diff = end - now
    if (diff <= 0) return 'Ended'
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    if (days > 0) return `${days}d ${hours}h`
    return `${hours}h`
  }

  const openStockModal = async () => {
    setShowStockModal(true)
    setStockStatus({ status: 'idle', message: '' })
    setProductVariants([])
    setSelectedVariantId('')
    try {
      const { data } = await api.get('/api/sellers/products')
      setProducts(data)
      if (data.length > 0) {
        const firstId = String(data[0].id)
        setSelectedProductId(firstId)
        loadProductVariants(firstId)
      }
    } catch {
      setProducts([])
    }
  }

  const loadProductVariants = async (productId) => {
    try {
      const { data } = await api.get(`/api/products/${productId}/variants`)
      setProductVariants(data || [])
      setSelectedVariantId('')
    } catch {
      setProductVariants([])
    }
  }

  const handleProductChange = (productId) => {
    setSelectedProductId(productId)
    loadProductVariants(productId)
  }

  const parseKeys = (value) => {
    if (!value) return []
    const rows = value.split('\n')
    const keys = rows.flatMap((row) => row.split(',')).map((k) => k.trim()).filter(Boolean)
    return keys
  }

  const handleAddStock = async (e) => {
    e.preventDefault()
    const keys = parseKeys(stockInput)
    if (!selectedProductId || keys.length === 0) {
      setStockStatus({ status: 'error', message: 'Select a product and add at least one key/link.' })
      return
    }
    if (productVariants.length > 0 && !selectedVariantId) {
      setStockStatus({ status: 'error', message: 'Select a variant for this product.' })
      return
    }
    setStockStatus({ status: 'loading', message: '' })
    try {
      if (selectedVariantId) {
        await api.post(`/api/products/${selectedProductId}/variants/${selectedVariantId}/keys`, { keys })
      } else {
        await api.post(`/api/products/${selectedProductId}/keys`, { keys })
      }
      setStockStatus({ status: 'success', message: `Added ${keys.length} items.` })
      setStockInput('')
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Failed to add stock.'
      setStockStatus({ status: 'error', message: detail })
    }
  }

  // Customize modal handlers
  const openCustomizeModal = () => {
    setShopForm({ shop_name: user?.shop_name || '', shop_description: user?.shop_description || '' })
    setShopStatus({ status: 'idle', message: '' })
    setShowCustomizeModal(true)
  }

  const handleSaveShop = async () => {
    setShopStatus({ status: 'loading', message: '' })
    try {
      const { data } = await api.put('/api/sellers/profile', shopForm)
      setUser({ ...user, ...data })
      setShopStatus({ status: 'success', message: 'Shop updated!' })
      setTimeout(() => setShowCustomizeModal(false), 1000)
    } catch (error) {
      setShopStatus({ status: 'error', message: error?.response?.data?.detail || 'Failed to update shop.' })
    }
  }

  // Collateral modal handlers
  const openCollateralModal = () => {
    setCollateralAmount('')
    setCollateralStatus({ status: 'idle', message: '' })
    setShowCollateralModal(true)
  }

  const handleDeposit = async () => {
    const amount = parseFloat(collateralAmount)
    if (!amount || amount <= 0) {
      setCollateralStatus({ status: 'error', message: 'Enter a valid amount.' })
      return
    }
    setCollateralStatus({ status: 'loading', message: '' })
    try {
      const { data } = await api.post('/api/sellers/collateral/deposit', { amount })
      setUser({ ...user, collateral: data.new_collateral, balance: data.new_balance })
      setCollateralStatus({ status: 'success', message: `Deposited $${amount.toFixed(2)}` })
      setCollateralAmount('')
    } catch (error) {
      setCollateralStatus({ status: 'error', message: error?.response?.data?.detail || 'Failed to deposit.' })
    }
  }

  const handleWithdraw = async () => {
    const amount = parseFloat(collateralAmount)
    if (!amount || amount <= 0) {
      setCollateralStatus({ status: 'error', message: 'Enter a valid amount.' })
      return
    }
    setCollateralStatus({ status: 'loading', message: '' })
    try {
      const { data } = await api.post('/api/sellers/collateral/withdraw', { amount })
      setUser({ ...user, collateral: data.new_collateral, balance: data.new_balance })
      setCollateralStatus({ status: 'success', message: `Withdrawn $${amount.toFixed(2)}` })
      setCollateralAmount('')
    } catch (error) {
      setCollateralStatus({ status: 'error', message: error?.response?.data?.detail || 'Failed to withdraw.' })
    }
  }

  // Rank modal handlers
  const openRankModal = async () => {
    setRankStatus({ status: 'idle', message: '' })
    setShowRankModal(true)
    try {
      const { data } = await api.get('/api/sellers/ranks')
      setRanks(data.ranks || [])
      setFeaturedCost(data.featured_cost || 200)
    } catch { setRanks([]) }
  }

  const handleBuyRank = async (rankId) => {
    setRankStatus({ status: 'loading', message: '' })
    try {
      const { data } = await api.post(`/api/sellers/ranks/${rankId}/buy`)
      setUser({ ...user, seller_rank: data.seller_rank, balance: data.balance })
      setRankStatus({ status: 'success', message: `Upgraded to ${data.seller_rank}!` })
    } catch (error) {
      setRankStatus({ status: 'error', message: error?.response?.data?.detail || 'Failed to upgrade.' })
    }
  }

  const handleBuyFeatured = async () => {
    setRankStatus({ status: 'loading', message: '' })
    try {
      const { data } = await api.post('/api/sellers/featured/buy')
      setUser({ ...user, featured_until: data.featured_until, balance: data.balance })
      setRankStatus({ status: 'success', message: 'Featured for 30 days!' })
    } catch (error) {
      setRankStatus({ status: 'error', message: error?.response?.data?.detail || 'Failed to purchase.' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 card p-3 animate-pulse">
              <div className="h-5 bg-dark-800 rounded w-1/2 mb-1" />
              <div className="h-3 bg-dark-800 rounded w-3/4" />
            </div>
          ))}
        </div>
        <div className="card p-4 animate-pulse"><div className="h-24 bg-dark-800 rounded" /></div>
      </div>
    )
  }

  // Quick wins - items that need attention
  const lowStockProducts = stats?.low_stock_products || []
  const pendingOrders = orders.filter(o => o.status === 'paid')

  return (
    <div className="space-y-3">
      {/* Stats Bar - Inline */}
      <div className="flex gap-2">
        <div className="flex-1 card p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">${stats?.total_revenue?.toFixed(0) || 0}</p>
          <p className="text-[9px] text-dark-500">Revenue</p>
        </div>
        <div className="flex-1 card p-2.5 text-center">
          <p className="text-lg font-bold text-dark-50">{stats?.total_products || 0}</p>
          <p className="text-[9px] text-dark-500">Products</p>
        </div>
        <div className="flex-1 card p-2.5 text-center">
          <p className="text-lg font-bold text-cyan-400">${(user?.collateral || 0).toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">Collateral</p>
        </div>
        <div className="flex-1 card p-2.5 text-center">
          <p className="text-lg font-bold text-yellow-400">{stats?.rating > 0 ? stats.rating.toFixed(1) : '-'}</p>
          <p className="text-[9px] text-dark-500">Rating</p>
        </div>
      </div>

      {/* Alert Cards */}
      {(disputes.length > 0 || pendingOrders.length > 0) && (
        <div className="flex gap-2">
          {disputes.length > 0 && (
            <div 
              onClick={() => navigate('/seller/orders?filter=disputed')}
              className="flex-1 bg-red-500/10 rounded-xl px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-red-500/15 transition-all"
            >
              <AlertTriangle size={14} className="text-red-400" />
              <div>
                <span className="text-sm font-bold text-red-400">{disputes.length}</span>
                <p className="text-[9px] text-dark-400">Disputes</p>
              </div>
            </div>
          )}
          {pendingOrders.length > 0 && (
            <div 
              onClick={() => navigate('/seller/orders?filter=paid')}
              className="flex-1 bg-yellow-500/10 rounded-xl px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-yellow-500/15 transition-all"
            >
              <ShoppingCart size={14} className="text-yellow-400" />
              <div>
                <span className="text-sm font-bold text-yellow-400">{pendingOrders.length}</span>
                <p className="text-[9px] text-dark-400">To Deliver</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-4 gap-1.5">
        <Link to="/seller/products" className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Package size={16} className="mx-auto mb-1 text-blue-400" />
          <span className="text-[10px] text-dark-300">Products</span>
        </Link>
        <Link to="/seller/services" className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Briefcase size={16} className="mx-auto mb-1 text-cyan-400" />
          <span className="text-[10px] text-dark-300">Services</span>
        </Link>
        <Link to="/seller/auctions" className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Gavel size={16} className="mx-auto mb-1 text-amber-400" />
          <span className="text-[10px] text-dark-300">Auctions</span>
        </Link>
        <Link to="/seller/orders" className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <ShoppingCart size={16} className="mx-auto mb-1 text-purple-400" />
          <span className="text-[10px] text-dark-300">Orders</span>
        </Link>
        <button onClick={openStockModal} className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Key size={16} className="mx-auto mb-1 text-yellow-400" />
          <span className="text-[10px] text-dark-300">Stock</span>
        </button>
        <Link to={`/shop/${user?.id}?preview=true`} className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Eye size={16} className="mx-auto mb-1 text-cyan-400" />
          <span className="text-[10px] text-dark-300">Preview</span>
        </Link>
        <button onClick={openCustomizeModal} className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Palette size={16} className="mx-auto mb-1 text-pink-400" />
          <span className="text-[10px] text-dark-300">Customize</span>
        </button>
        <button onClick={openCollateralModal} className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Shield size={16} className="mx-auto mb-1 text-blue-400" />
          <span className="text-[10px] text-dark-300">Collateral</span>
        </button>
        <button onClick={openRankModal} className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Crown size={16} className="mx-auto mb-1 text-amber-400" />
          <span className="text-[10px] text-dark-300">Rank</span>
        </button>
        <Link to="/seller/reviews" className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <MessageSquareText size={16} className="mx-auto mb-1 text-yellow-400" />
          <span className="text-[10px] text-dark-300">Reviews</span>
        </Link>
        <Link to="/seller/advertising" className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <Image size={16} className="mx-auto mb-1 text-pink-400" />
          <span className="text-[10px] text-dark-300">Ads</span>
        </Link>
        <Link to="/deposit?tab=withdraw" className="card p-2.5 text-center hover:bg-dark-800/80 transition-colors">
          <ArrowDownToLine size={16} className="mx-auto mb-1 text-emerald-400" />
          <span className="text-[10px] text-dark-300">Withdraw</span>
        </Link>
      </div>

      {/* Activity Tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-dark-800">
          {[
            { key: 'orders', label: 'Orders', count: orders.length },
            { key: 'auctions', label: 'Auctions', count: auctions.length },
            { key: 'services', label: 'Services', count: services.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActivityTab(tab.key)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activityTab === tab.key
                  ? 'text-primary-400 border-b-2 border-primary-500 -mb-px'
                  : 'text-dark-400 hover:text-dark-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-dark-800">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
        
        <div className="max-h-64 overflow-y-auto">
          {activityTab === 'orders' && (
            orders.length > 0 ? (
              <div className="divide-y divide-dark-800/50">
                {orders.slice(0, 8).map(o => (
                  <div 
                    key={`${o.order_id}-${o.product_id}`} 
                    onClick={() => navigate(`/orders/${o.order_id}`)}
                    className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-dark-800/50 transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{o.product_name || `Order #${o.order_id}`}</p>
                      <p className="text-[10px] text-dark-500">@{o.buyer_username || 'user'}</p>
                    </div>
                    <span className="text-sm font-semibold">${o.total?.toFixed(2)}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${statusClass(o.status)}`}>{o.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-dark-500 text-xs">No orders yet</div>
            )
          )}

          {activityTab === 'auctions' && (
            auctions.length > 0 ? (
              <div className="divide-y divide-dark-800/50">
                {auctions.map(auction => (
                  <div key={auction.id} onClick={() => navigate(`/auctions/${auction.id}`)} className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-dark-800/50 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{auction.title}</p>
                      <p className="text-[10px] text-dark-500">{auction.bid_count} bids</p>
                    </div>
                    <span className="text-sm font-semibold text-amber-400">${auction.current_bid || auction.starting_price}</span>
                    <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                      <Timer size={10} />
                      {formatTimeLeft(auction.ends_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-dark-500 text-xs">No active auctions</div>
            )
          )}

          {activityTab === 'services' && (
            services.length > 0 ? (
              <div className="divide-y divide-dark-800/50">
                {services.map(service => (
                  <div key={service.id} onClick={() => navigate(`/services/${service.id}`)} className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-dark-800/50 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{service.title}</p>
                      <p className="text-[10px] text-dark-500">{service.category}</p>
                    </div>
                    <span className="text-sm font-semibold text-cyan-400">${service.price}</span>
                    <span className="text-[10px] text-dark-500">{service.delivery_time}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-dark-500 text-xs">No active services</div>
            )
          )}
        </div>
      </div>

      <AnimatePresence>
        {showStockModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowStockModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-4 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Key size={16} className="text-primary-400" />
                  <h3 className="font-semibold text-sm">Add Stock</h3>
                </div>
                <button onClick={() => setShowStockModal(false)} className="text-dark-400 hover:text-dark-50">
                  <X size={16} />
                </button>
              </div>

              {products.length === 0 ? (
                <div className="card p-4 text-center text-sm text-dark-400">
                  No products found. Add a product first.
                </div>
              ) : (
                <>
                  {/* Quick Alert - Low Stock */}
                  {(() => {
                    const lowStock = products.filter(p => p.stock_count < 5)
                    if (lowStock.length === 0) return null
                    return (
                      <div className="mb-3 bg-yellow-500/10 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-dark-400 mb-1.5">Low Stock - Click to select</p>
                        <div className="flex flex-wrap gap-1">
                          {lowStock.slice(0, 5).map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleProductChange(String(p.id))}
                              className={`text-[10px] px-2 py-1 rounded transition-colors ${
                                selectedProductId === String(p.id)
                                  ? 'bg-yellow-500/30 text-yellow-300'
                                  : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                              }`}
                            >
                              {p.name} <span className={p.stock_count === 0 ? 'text-red-400' : 'text-yellow-400'}>({p.stock_count})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                
                  <form className="space-y-2.5" onSubmit={handleAddStock}>
                    <div>
                      <label className="text-[10px] text-dark-400">Product</label>
                      <select
                        value={selectedProductId}
                        onChange={(e) => handleProductChange(e.target.value)}
                        className="input mt-0.5 text-sm py-1.5"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.stock_count} in stock)
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {productVariants.length > 0 && (
                      <div>
                        <label className="text-[10px] text-dark-400">Variant</label>
                        <select
                          value={selectedVariantId}
                          onChange={(e) => setSelectedVariantId(e.target.value)}
                          className="input mt-0.5 text-sm py-1.5"
                        >
                          <option value="">Select variant...</option>
                          {productVariants.map((v) => (
                            <option key={v.id} value={v.id}>{v.name} (${v.price} · {v.stock_count})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <div>
                      <label className="text-[10px] text-dark-400">Keys / links (one per line or CSV)</label>
                      <textarea
                        rows={4}
                        value={stockInput}
                        onChange={(e) => setStockInput(e.target.value)}
                        className="input mt-0.5 text-sm"
                        placeholder="KEY-123-ABC&#10;KEY-456-DEF"
                      />
                    </div>
                    {stockStatus.message && (
                      <p className={`text-xs ${stockStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                        {stockStatus.message}
                      </p>
                    )}
                    <button type="submit" className="btn-primary w-full text-sm py-2" disabled={stockStatus.status === 'loading'}>
                      {stockStatus.status === 'loading' ? 'Adding...' : 'Add Stock'}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customize Modal */}
      <AnimatePresence>
        {showCustomizeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCustomizeModal(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Palette size={18} className="text-pink-400" />
                  <h3 className="font-semibold">Customize Shop</h3>
                </div>
                <button onClick={() => setShowCustomizeModal(false)} className="text-dark-400 hover:text-dark-50">
                  <X size={18} />
                </button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-dark-400">Shop Name</label>
                  <input
                    type="text"
                    value={shopForm.shop_name}
                    onChange={(e) => setShopForm({ ...shopForm, shop_name: e.target.value })}
                    className="input mt-1"
                    placeholder="Your shop name"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-400">Shop Description</label>
                  <textarea
                    rows={3}
                    value={shopForm.shop_description}
                    onChange={(e) => setShopForm({ ...shopForm, shop_description: e.target.value })}
                    className="input mt-1"
                    placeholder="Describe your shop..."
                  />
                </div>
                {shopStatus.message && (
                  <p className={`text-xs ${shopStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                    {shopStatus.message}
                  </p>
                )}
                <button onClick={handleSaveShop} className="btn-primary w-full" disabled={shopStatus.status === 'loading'}>
                  {shopStatus.status === 'loading' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collateral Modal */}
      <AnimatePresence>
        {showCollateralModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCollateralModal(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-blue-400" />
                  <h3 className="font-semibold">Collateral</h3>
                </div>
                <button onClick={() => setShowCollateralModal(false)} className="text-dark-400 hover:text-dark-50">
                  <X size={18} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="card p-4 text-center">
                  <p className="text-xs text-dark-400 mb-1">Current Collateral</p>
                  <p className="text-2xl font-bold text-primary-400">${(user?.collateral || 0).toFixed(2)}</p>
                </div>
                
                <div>
                  <label className="text-xs text-dark-400">Amount</label>
                  <input
                    type="number"
                    value={collateralAmount}
                    onChange={(e) => setCollateralAmount(e.target.value)}
                    className="input mt-1"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                
                {collateralStatus.message && (
                  <p className={`text-xs ${collateralStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                    {collateralStatus.message}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleDeposit} className="btn-primary" disabled={collateralStatus.status === 'loading'}>
                    Deposit
                  </button>
                  <button onClick={handleWithdraw} className="btn bg-dark-700 hover:bg-dark-600" disabled={collateralStatus.status === 'loading'}>
                    Withdraw
                  </button>
                </div>
                
                <p className="text-[11px] text-dark-500 text-center">
                  Collateral protects buyers and increases trust in your shop.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rank Modal */}
      <AnimatePresence>
        {showRankModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowRankModal(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Crown size={18} className="text-amber-400" />
                  <h3 className="font-semibold">Upgrade Rank</h3>
                </div>
                <button onClick={() => setShowRankModal(false)} className="text-dark-400 hover:text-dark-50">
                  <X size={18} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="card p-3 text-center">
                  <p className="text-xs text-dark-400 mb-1">Current Rank</p>
                  <p className="font-semibold text-amber-400 capitalize">{user?.seller_rank || 'None'}</p>
                </div>
                
                {rankStatus.message && (
                  <p className={`text-xs ${rankStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                    {rankStatus.message}
                  </p>
                )}
                
                <div className="space-y-2">
                  {ranks.map((rank) => {
                    const isCurrentRank = user?.seller_rank === rank.name
                    const colors = {
                      bronze: 'border-amber-700 bg-amber-900/20',
                      silver: 'border-gray-400 bg-gray-500/20',
                      gold: 'border-yellow-400 bg-yellow-500/20'
                    }
                    return (
                      <div key={rank.id} className={`card p-3 border ${colors[rank.name] || 'border-dark-700'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium capitalize">{rank.name}</p>
                            <p className="text-xs text-dark-400">${rank.price}/month · {rank.featured_days} featured days</p>
                          </div>
                          {isCurrentRank ? (
                            <span className="text-xs text-primary-400">Current</span>
                          ) : (
                            <button
                              onClick={() => handleBuyRank(rank.id)}
                              className="btn-primary text-xs py-1 px-3"
                              disabled={rankStatus.status === 'loading'}
                            >
                              Upgrade
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="border-t border-dark-700 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Featured Seller</p>
                      <p className="text-xs text-dark-400">${featuredCost} for 30 days</p>
                    </div>
                    <button
                      onClick={handleBuyFeatured}
                      className="btn bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs py-1 px-3"
                      disabled={rankStatus.status === 'loading'}
                    >
                      Buy Featured
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
