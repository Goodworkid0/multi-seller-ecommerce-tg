import { useEffect, useState, useRef, memo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Package, ShoppingCart, DollarSign, Shield, Plus, Trash2,
  Check, AlertTriangle, ArrowUpCircle, X, RefreshCw, MessageCircle,
  ChevronDown, ChevronUp, BarChart3, CreditCard, ArrowDownCircle, Store,
  Star, Pencil, ShieldCheck, Upload, FileUp, Key, ChevronLeft,
  UserCog, Wallet, Settings, Skull, Image, Tag, Users2, Folder, Gift, Headphones, Send, ArrowLeft, User as UserIcon, Palette, Share2, Camera, Search, ChevronRight, ShieldX, Briefcase, ShoppingBag, Archive, Clock, EyeOff, Copy, Eye, ArrowUpDown
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import { useToast } from '../components/Toast'

// ======================== TABS ========================
const TAB_SECTIONS = [
  { key: 'financial', label: 'Financial' },
  { key: 'users', label: 'Users & Sellers' },
  { key: 'products', label: 'Products' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'settings', label: 'Settings' },
]

const TABS = [
  // Financial
  { key: 'orders', label: 'Orders', icon: ShoppingCart, color: 'text-blue-400', bg: 'bg-blue-500/10', section: 'financial' },
  { key: 'deposits', label: 'Deposits', icon: ArrowDownCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', section: 'financial' },
  { key: 'withdrawals', label: 'Withdrawals', icon: ArrowUpCircle, color: 'text-orange-400', bg: 'bg-orange-500/10', section: 'financial' },
  { key: 'disputes', label: 'Disputes', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', section: 'financial' },
  { key: 'escrow', label: 'Escrow', icon: Users2, color: 'text-cyan-400', bg: 'bg-cyan-500/10', section: 'financial' },
  // Users
  { key: 'users', label: 'Users', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10', section: 'users' },
  { key: 'sellers', label: 'Sellers', icon: Store, color: 'text-purple-400', bg: 'bg-purple-500/10', section: 'users' },
  { key: 'blacklist', label: 'Blacklist', icon: ShieldX, color: 'text-red-400', bg: 'bg-red-500/10', section: 'users' },
  // Products
  { key: 'categories', label: 'Categories', icon: Folder, color: 'text-indigo-400', bg: 'bg-indigo-500/10', section: 'products' },
  // Marketing
  { key: 'banners', label: 'Banners', icon: Image, color: 'text-pink-400', bg: 'bg-pink-500/10', section: 'marketing' },
  { key: 'giveaways', label: 'Giveaways', icon: Gift, color: 'text-primary-300', bg: 'bg-primary-500/10', section: 'marketing' },
  { key: 'wtb', label: 'WTB Posts', icon: ShoppingBag, color: 'text-amber-400', bg: 'bg-amber-500/10', section: 'marketing' },
  { key: 'broadcast', label: 'Broadcast', icon: MessageCircle, color: 'text-cyan-400', bg: 'bg-cyan-500/10', section: 'marketing' },
  // Settings
  { key: 'support', label: 'Support', icon: Headphones, color: 'text-cyan-400', bg: 'bg-cyan-500/10', section: 'settings' },
  { key: 'branding', label: 'Branding', icon: Palette, color: 'text-violet-400', bg: 'bg-violet-500/10', section: 'settings' },
  { key: 'referral', label: 'Referral', icon: Share2, color: 'text-pink-400', bg: 'bg-pink-500/10', section: 'settings' },
  { key: 'system', label: 'System', icon: Settings, color: 'text-rose-400', bg: 'bg-rose-500/10', section: 'settings' },
]

// ======================== HELPERS ========================
const formatDate = (v) => v ? new Date(v).toLocaleString() : '-'

const relativeTime = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(typeof dateStr === 'string' && !dateStr.endsWith('Z') ? dateStr + 'Z' : dateStr)
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString()
}

const depositStatusClass = (status) => {
  const v = String(status || '').toLowerCase()
  if (v === 'finished' || v === 'confirmed') return 'bg-emerald-500/15 text-emerald-400'
  if (v === 'waiting' || v === 'confirming') return 'bg-yellow-500/15 text-yellow-400'
  if (v === 'manual_credited') return 'bg-blue-500/15 text-blue-300'
  if (v === 'manual_marked') return 'bg-indigo-500/15 text-indigo-300'
  if (v === 'failed' || v === 'expired') return 'bg-red-500/15 text-red-400'
  return 'bg-dark-800 text-dark-300'
}

const withdrawalStatusColors = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  processing: 'bg-blue-500/15 text-blue-400',
  approved: 'bg-emerald-500/15 text-emerald-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  rejected: 'bg-red-500/15 text-red-400',
  failed: 'bg-orange-500/15 text-orange-400'
}

const disputeStatusStyles = {
  open: 'bg-red-500/15 text-red-400',
  escalated: 'bg-amber-500/15 text-amber-400',
  resolved: 'bg-emerald-500/15 text-emerald-400',
  closed: 'bg-dark-700 text-dark-400',
}

// ======================== OVERVIEW TAB ========================
const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
]

function OverviewTab({ compact = false }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const [sellersShown, setSellersShown] = useState(5)
  const [ordersShown, setOrdersShown] = useState(5)
  const [productsShown, setProductsShown] = useState(5)
  const [loadingSellers, setLoadingSellers] = useState(false)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(false)

  const loadDashboard = async (p) => {
    setLoading(true)
    setSellersShown(5)
    setOrdersShown(5)
    setProductsShown(5)
    try {
      const params = compact
        ? { sellers_limit: 0, orders_limit: 0, products_limit: 0, period: p }
        : { sellers_limit: 5, orders_limit: 5, products_limit: 5, period: p }
      const { data: d } = await api.get('/api/admin/dashboard', { params })
      setData(d)
    } catch { setData(null) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadDashboard(period) }, [period])

  const loadMoreSellers = async () => {
    setLoadingSellers(true)
    try {
      const { data: d } = await api.get('/api/admin/dashboard', {
        params: { sellers_limit: 5, sellers_offset: sellersShown, orders_limit: 0, products_limit: 0, period }
      })
      setData(prev => ({ ...prev, top_sellers: [...prev.top_sellers, ...d.top_sellers] }))
      setSellersShown(s => s + d.top_sellers.length)
    } catch { /* ignore */ }
    finally { setLoadingSellers(false) }
  }

  const loadMoreOrders = async () => {
    setLoadingOrders(true)
    try {
      const { data: d } = await api.get('/api/admin/dashboard', {
        params: { orders_limit: 5, orders_offset: ordersShown, sellers_limit: 0, products_limit: 0, period }
      })
      setData(prev => ({ ...prev, recent_orders: [...prev.recent_orders, ...d.recent_orders] }))
      setOrdersShown(s => s + d.recent_orders.length)
    } catch { /* ignore */ }
    finally { setLoadingOrders(false) }
  }

  const loadMoreProducts = async () => {
    setLoadingProducts(true)
    try {
      const { data: d } = await api.get('/api/admin/dashboard', {
        params: { products_limit: 5, products_offset: productsShown, sellers_limit: 0, orders_limit: 0, period }
      })
      setData(prev => ({ ...prev, top_products: [...prev.top_products, ...d.top_products] }))
      setProductsShown(s => s + d.top_products.length)
    } catch { /* ignore */ }
    finally { setLoadingProducts(false) }
  }

  if (loading) return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => <div key={i} className="card p-4 animate-pulse"><div className="h-10 bg-dark-800 rounded" /></div>)}
      </div>
      <div className="card p-4 animate-pulse"><div className="h-24 bg-dark-800 rounded" /></div>
    </div>
  )

  if (!data) return <div className="card p-6 text-center text-dark-400">Failed to load dashboard</div>

  const financeCards = [
    { label: 'Revenue', value: `$${data.total_revenue.toFixed(2)}`, sub: `${data.completed_orders || 0} completed`, icon: DollarSign, accent: 'text-emerald-400', bg: 'bg-emerald-500/10', tab: 'orders' },
    { label: 'Total Deposits', value: `$${(data.total_deposits || 0).toFixed(2)}`, sub: 'credited', icon: ArrowDownCircle, accent: 'text-cyan-400', bg: 'bg-cyan-500/10', tab: 'deposits' },
    { label: 'Platform Fee', value: `$${data.platform_fee.toFixed(2)}`, sub: '10% cut', icon: CreditCard, accent: 'text-primary-400', bg: 'bg-primary-500/10', tab: 'orders' },
  ]

  const sc = data.order_status_counts || {}
  const orderCards = [
    { label: 'Total Orders', value: data.total_orders, accent: 'text-white', bg: 'bg-dark-700/60', icon: ShoppingCart, tab: 'orders' },
    { label: 'Pending', value: sc.pending || 0, accent: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock, tab: 'orders' },
    { label: 'Paid', value: sc.paid || 0, accent: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: DollarSign, tab: 'orders' },
    { label: 'Delivered', value: sc.delivered || 0, accent: 'text-blue-400', bg: 'bg-blue-500/10', icon: Package, tab: 'orders' },
    { label: 'Completed', value: sc.completed || 0, accent: 'text-primary-400', bg: 'bg-primary-500/10', icon: Check, tab: 'orders' },
    { label: 'Disputed', value: sc.disputed || 0, accent: 'text-red-400', bg: 'bg-red-500/10', icon: AlertTriangle, tab: 'disputes' },
    { label: 'Cancelled', value: sc.cancelled || 0, accent: 'text-dark-400', bg: 'bg-dark-700/40', icon: X, tab: 'orders' },
    { label: 'Refunded', value: sc.refunded || 0, accent: 'text-orange-400', bg: 'bg-orange-500/10', icon: RefreshCw, tab: 'orders' },
  ]

  const infoCards = [
    { label: 'Users', value: data.total_users, sub: `${data.total_sellers} sellers`, icon: Users, accent: 'text-blue-400', bg: 'bg-blue-500/10', tab: 'users' },
    { label: 'Products', value: data.total_products, sub: 'listed', icon: Package, accent: 'text-purple-400', bg: 'bg-purple-500/10', tab: 'sellers' },
  ]

  const alertCards = [
    data.open_disputes > 0 && { label: 'Open Disputes', value: data.open_disputes, icon: AlertTriangle, accent: 'text-red-400', bg: 'bg-red-500/10', tab: 'disputes' },
    data.pending_withdrawals > 0 && { label: 'Pending Withdrawals', value: data.pending_withdrawals, icon: ArrowUpCircle, accent: 'text-orange-400', bg: 'bg-orange-500/10', tab: 'withdrawals' },
  ].filter(Boolean)

  const statusColor = {
    paid: 'text-emerald-400',
    delivered: 'text-blue-400',
    completed: 'text-primary-400',
    pending: 'text-yellow-400',
    disputed: 'text-red-400',
    cancelled: 'text-dark-500',
    refunded: 'text-orange-400',
  }

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              period === p.key
                ? 'bg-primary-500/20 text-primary-400 ring-1 ring-primary-500/30'
                : 'bg-dark-800/60 text-dark-400 hover:bg-dark-700/60'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Financial Stats */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-dark-500 font-semibold mb-1.5 ml-1">Financials</p>
        <div className="grid grid-cols-3 gap-2">
          {financeCards.map((card, i) => {
            const Icon = card.icon
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.97 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/?tab=${card.tab}`)}
                className="card p-3 cursor-pointer hover:ring-1 hover:ring-dark-600 active:bg-dark-800/80 transition-all"
              >
                <div className="flex flex-col items-center text-center gap-1.5">
                  <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <Icon size={15} className={card.accent} />
                  </div>
                  <div>
                    <div className="text-sm font-bold leading-tight">{card.value}</div>
                    <div className="text-[10px] text-dark-400">{card.label}</div>
                  </div>
                </div>
                {card.sub && <p className="text-[9px] text-dark-500 mt-1 text-center">{card.sub}</p>}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Order Status Breakdown */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-dark-500 font-semibold mb-1.5 ml-1">Orders</p>
        <div className="grid grid-cols-4 gap-1.5">
          {orderCards.map((card, i) => {
            const Icon = card.icon
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.95 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => navigate(`/?tab=${card.tab}`)}
                className="card p-2.5 cursor-pointer hover:ring-1 hover:ring-dark-600 active:bg-dark-800/80 transition-all"
              >
                <div className="flex flex-col items-center text-center gap-1">
                  <Icon size={14} className={card.accent} />
                  <div className="text-sm font-bold leading-tight">{card.value}</div>
                  <div className="text-[9px] text-dark-400 leading-tight">{card.label}</div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Users & Products */}
      <div className="grid grid-cols-2 gap-2">
        {infoCards.map((card, i) => {
          const Icon = card.icon
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.97 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(`/?tab=${card.tab}`)}
              className="card p-3.5 cursor-pointer hover:ring-1 hover:ring-dark-600 active:bg-dark-800/80 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                  <Icon size={17} className={card.accent} />
                </div>
                <div>
                  <div className="text-base font-bold leading-tight">{card.value}</div>
                  <div className="text-[11px] text-dark-400">{card.label}</div>
                </div>
              </div>
              {card.sub && <p className="text-[10px] text-dark-500 mt-1.5 ml-[46px]">{card.sub}</p>}
            </motion.div>
          )
        })}
      </div>

      {/* Alert Cards */}
      {alertCards.length > 0 && (
        <div className="flex gap-2">
          {alertCards.map(card => {
            const Icon = card.icon
            return (
              <div 
                key={card.label} 
                onClick={() => navigate(`/?tab=${card.tab}`)}
                className={`flex-1 ${card.bg} rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all`}
              >
                <Icon size={16} className={card.accent} />
                <div>
                  <span className={`text-sm font-bold ${card.accent}`}>{card.value}</span>
                  <p className="text-[10px] text-dark-400">{card.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!compact && <>
      {/* Top Sellers */}
      <div>
        <h3 className="text-sm font-semibold text-dark-300 mb-2 flex items-center gap-1.5">
          <Star size={14} className="text-yellow-400" /> Top Sellers
        </h3>
        <div className="space-y-1.5">
          {data.top_sellers?.map((s, i) => (
            <div key={s.id} onClick={() => navigate(`/shop/${s.id}`)} className="card px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-dark-800/80 active:scale-[0.99] transition-all">
              <span className="text-xs font-bold text-dark-500 w-4 text-center">#{i + 1}</span>
              <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center overflow-hidden shrink-0">
                {(s.shop_image || s.avatar_url) ? (
                  <img src={s.shop_image || s.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Store size={14} className="text-dark-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium truncate">{s.shop_name}</span>
                  {s.is_featured && <Star size={10} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-dark-400">
                  {s.seller_rating > 0 && <span>★ {s.seller_rating.toFixed(1)}</span>}
                  <span>${(s.collateral || 0).toFixed(0)} locked</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-emerald-400">{s.total_sales}</div>
                <div className="text-[10px] text-dark-500">sales</div>
              </div>
            </div>
          ))}
          {(!data.top_sellers || data.top_sellers.length === 0) && (
            <div className="card p-4 text-center text-dark-500 text-sm">No sellers yet</div>
          )}
          {data.top_sellers?.length > 0 && sellersShown < (data.top_sellers_total || 0) && (
            <button
              onClick={loadMoreSellers}
              disabled={loadingSellers}
              className="w-full py-2 mt-1 rounded-xl bg-dark-800/60 text-dark-400 text-xs font-medium hover:bg-dark-700/60 transition-colors disabled:opacity-50"
            >
              {loadingSellers ? 'Loading...' : `Load More (${data.top_sellers_total - sellersShown} remaining)`}
            </button>
          )}
        </div>
      </div>

      {/* Top Products */}
      <div>
        <h3 className="text-sm font-semibold text-dark-300 mb-2 flex items-center gap-1.5">
          <Package size={14} className="text-purple-400" /> Top Products
        </h3>
        <div className="space-y-1.5">
          {data.top_products?.map((p, i) => (
            <div key={p.id} onClick={() => navigate(`/products/${p.id}`)} className="card px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-dark-800/80 active:scale-[0.99] transition-all">
              <span className="text-xs font-bold text-dark-500 w-4 text-center">#{i + 1}</span>
              <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center overflow-hidden shrink-0">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package size={14} className="text-dark-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{p.name}</span>
                <div className="flex items-center gap-2 text-[11px] text-dark-400">
                  <span onClick={(e) => { e.stopPropagation(); navigate(`/shop/${p.seller_id}`) }} className="hover:text-primary-400 cursor-pointer">{p.seller_name}</span>
                  {p.rating > 0 && <span>★ {p.rating.toFixed(1)}</span>}
                  <span>{p.stock_count} in stock</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-emerald-400">{p.sales_count}</div>
                <div className="text-[10px] text-dark-500">${p.price.toFixed(2)}</div>
              </div>
            </div>
          ))}
          {(!data.top_products || data.top_products.length === 0) && (
            <div className="card p-4 text-center text-dark-500 text-sm">No products yet</div>
          )}
          {data.top_products?.length > 0 && productsShown < (data.top_products_total || 0) && (
            <button
              onClick={loadMoreProducts}
              disabled={loadingProducts}
              className="w-full py-2 mt-1 rounded-xl bg-dark-800/60 text-dark-400 text-xs font-medium hover:bg-dark-700/60 transition-colors disabled:opacity-50"
            >
              {loadingProducts ? 'Loading...' : `Load More (${data.top_products_total - productsShown} remaining)`}
            </button>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <h3 className="text-sm font-semibold text-dark-300 mb-2 flex items-center gap-1.5">
          <ShoppingCart size={14} className="text-blue-400" /> Recent Orders
        </h3>
        <div className="space-y-1.5">
          {data.recent_orders?.map(o => (
            <div key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="card px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-dark-800/80 active:scale-[0.99] transition-all">
              <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center shrink-0">
                <ShoppingCart size={14} className="text-dark-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">
                    {o.product_name || `Order #${o.id}`}
                  </span>
                  <span className={`text-[10px] font-medium ${statusColor[o.status] || 'text-dark-400'}`}>
                    {o.status}
                  </span>
                </div>
                <div className="text-[11px] text-dark-400">
                  by @{o.buyer_username} • {o.item_count} item{o.item_count !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">${o.total_amount.toFixed(2)}</div>
                <div className="text-[10px] text-dark-500">
                  {o.created_at ? new Date(o.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '-'}
                </div>
              </div>
            </div>
          ))}
          {(!data.recent_orders || data.recent_orders.length === 0) && (
            <div className="card p-4 text-center text-dark-500 text-sm">No orders yet</div>
          )}
          {data.recent_orders?.length > 0 && ordersShown < (data.recent_orders_total || 0) && (
            <button
              onClick={loadMoreOrders}
              disabled={loadingOrders}
              className="w-full py-2 mt-1 rounded-xl bg-dark-800/60 text-dark-400 text-xs font-medium hover:bg-dark-700/60 transition-colors disabled:opacity-50"
            >
              {loadingOrders ? 'Loading...' : `Load More (${data.recent_orders_total - ordersShown} remaining)`}
            </button>
          )}
        </div>
      </div>
      </>}
    </div>
  )
}

// ======================== ORDERS TAB ========================
function OrdersTab() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/api/admin/orders')
      setOrders(data)
    } catch { setOrders([]) }
    finally { setIsLoading(false) }
  }

  const statusColors = {
    pending: 'bg-yellow-500/15 text-yellow-400',
    paid: 'bg-blue-500/15 text-blue-400',
    delivered: 'bg-emerald-500/15 text-emerald-400',
    completed: 'bg-green-500/15 text-green-400',
    disputed: 'bg-red-500/15 text-red-400',
    cancelled: 'bg-dark-700 text-dark-400',
    refunded: 'bg-orange-500/15 text-orange-400',
  }

  const statusLabels = {
    pending: 'Pending',
    paid: 'Paid',
    delivered: 'Delivered',
    completed: 'Completed',
    disputed: 'Review',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  }

  // Status counts
  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {})

  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && String(o.status) !== statusFilter) return false
    if (searchTerm.trim()) {
      const needle = searchTerm.toLowerCase()
      const hay = [
        o.buyer_username, o.buyer_first_name, String(o.id),
        ...(o.items || []).map(i => i.product_name || ''),
        ...(o.items || []).map(i => i.seller_shop || ''),
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  // Quick stats for filtered orders
  const filteredTotal = filtered.reduce((sum, o) => sum + (o.total_amount || 0), 0)

  return (
    <div className="space-y-3">
      {/* Status Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
            statusFilter === 'all' ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
          }`}
        >
          All ({orders.length})
        </button>
        {['delivered', 'disputed', 'completed', 'refunded'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              statusFilter === status 
                ? statusColors[status]?.replace('/15', '/30') || 'bg-dark-700 text-dark-50'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {statusLabels[status]} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Search + Stats */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search order #, buyer, product..."
            className="input py-2 pl-8 text-xs w-full"
          />
          <Package size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
        </div>
        <div className="bg-dark-800/60 rounded-lg px-3 py-2 text-center min-w-[80px]">
          <p className="text-xs font-bold text-emerald-400">${filteredTotal.toFixed(2)}</p>
          <p className="text-[9px] text-dark-500">{filtered.length} orders</p>
        </div>
        <button onClick={loadOrders} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse p-3"><div className="h-4 bg-dark-800 rounded w-1/3 mb-2" /><div className="h-3 bg-dark-800 rounded w-1/2" /></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <ShoppingCart size={28} className="mx-auto text-dark-500 mb-2" />
          <p className="text-dark-400 text-sm">No orders found</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015 }}
              onClick={() => navigate(`/orders/${order.id}`)}
              className="card p-2.5 cursor-pointer hover:bg-dark-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {/* Order ID + Status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">#{order.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[order.status] || 'bg-dark-700 text-dark-400'}`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                    {order.has_dispute && <AlertTriangle size={11} className="text-red-400" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                    <span>{order.buyer_username ? `@${order.buyer_username}` : order.buyer_first_name || `#${order.buyer_id}`}</span>
                    <span>·</span>
                    <span>{relativeTime(order.created_at)}</span>
                    {order.items?.[0] && <>
                      <span>·</span>
                      <span className="truncate max-w-[100px]">{order.items[0].product_name}</span>
                      {order.items.length > 1 && <span className="text-dark-600">+{order.items.length - 1}</span>}
                    </>}
                  </div>
                </div>
                {/* Amount */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold">${order.total_amount?.toFixed(2)}</p>
                  {order.status === 'delivered' && order.auto_complete_at && (
                    <p className="text-[9px] text-amber-400">⏱ {relativeTime(order.auto_complete_at)}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ======================== DEPOSITS TAB ========================
function DepositsTab() {
  const { tgConfirm } = useAuthStore()
  const { addToast } = useToast()
  const [deposits, setDeposits] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState({})
  const [globalStats, setGlobalStats] = useState({ total_credited_amount: 0, total_credited_count: 0, pending_amount: 0 })
  const PER_PAGE = 20

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => { setPage(1) }, [statusFilter])
  useEffect(() => { load() }, [page, statusFilter, debouncedSearch])

  const load = async () => {
    setIsLoading(true)
    try {
      const params = { page, per_page: PER_PAGE }
      if (statusFilter !== 'all') params.status = statusFilter
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      const { data } = await api.get('/api/admin/deposits', { params })
      setDeposits(data.items)
      setTotal(data.total)
      setTotalPages(data.pages)
      setStatusCounts(data.status_counts)
      if (data.stats) setGlobalStats(data.stats)
    } catch {
      setDeposits([])
      addToast('Failed to load deposits', { type: 'error' })
    } finally { setIsLoading(false) }
  }

  const handleCredit = async (dep, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Credit $${dep.price_amount_usd?.toFixed(2)} to this user's balance?`)) return
    setActionId(dep.deposit_id)
    try {
      const { data } = await api.post(`/api/admin/deposits/${dep.deposit_id}/credit`)
      addToast(data.message || 'Deposit credited', { type: 'success' })
      load()
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Failed to credit', { type: 'error' })
    } finally { setActionId(null) }
  }

  const handleMarkCredited = async (dep, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Mark deposit #${dep.deposit_id} as credited? This only changes the status, not the user balance.`)) return
    setActionId(dep.deposit_id)
    try {
      const { data } = await api.post(`/api/admin/deposits/${dep.deposit_id}/mark-credited`, { credited: true })
      addToast(data.message || 'Deposit marked', { type: 'success' })
      load()
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Failed to mark', { type: 'error' })
    } finally { setActionId(null) }
  }

  const statusLabels = {
    finished: 'Finished',
    confirmed: 'Confirmed',
    waiting: 'Waiting',
    confirming: 'Confirming',
    manual_credited: 'Manual',
    manual_marked: 'Marked',
    failed: 'Failed',
    expired: 'Expired',
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-3">
      {/* Global Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-primary-400">{statusCounts.total || 0}</p>
          <p className="text-[9px] text-dark-500">Total</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">${globalStats.total_credited_amount.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">Credited</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-amber-400">${globalStats.pending_amount.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">Pending $</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-blue-400">{globalStats.total_credited_count}</p>
          <p className="text-[9px] text-dark-500">Credited #</p>
        </div>
      </div>

      {/* Status Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'all', label: 'All' },
          { key: 'waiting', label: 'Waiting' },
          { key: 'confirming', label: 'Confirming' },
          { key: 'finished', label: 'Finished' },
          { key: 'manual_credited', label: 'Manual' },
          { key: 'expired', label: 'Expired' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              statusFilter === key
                ? key === 'all' ? 'bg-primary-500 text-white'
                : depositStatusClass(key)
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {label} ({key === 'all' ? statusCounts.total || 0 : statusCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search user, ID, telegram..."
            className="input py-2 pl-8 text-xs w-full"
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
        </div>
        <button onClick={load} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-4 w-1/3 bg-dark-800 rounded mb-2" /><div className="h-3 w-1/2 bg-dark-800 rounded" /></div>)}</div>
      ) : deposits.length === 0 ? (
        <div className="card p-8 text-center"><ArrowDownCircle size={28} className="mx-auto text-dark-600 mb-2" /><p className="text-dark-400 text-sm">No deposits found</p></div>
      ) : (
        <div className="space-y-1.5">
          {deposits.map((dep, i) => {
            const isStale = ['expired', 'failed'].includes(String(dep.payment_status || '').toLowerCase())
            const isCreated = String(dep.payment_status || '').toLowerCase() === 'created'
            const isExpanded = expandedId === dep.deposit_id
            return (
              <motion.div
                key={dep.deposit_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.015 }}
                className={`card overflow-hidden ${isStale ? 'opacity-40' : isCreated ? 'opacity-60' : ''}`}
              >
                {/* Collapsed row */}
                <div
                  className="p-2.5 flex items-center gap-2 cursor-pointer hover:bg-dark-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : dep.deposit_id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isStale ? 'line-through' : ''}`}>${dep.price_amount_usd?.toFixed(2)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${depositStatusClass(dep.payment_status)}`}>
                        {statusLabels[dep.payment_status] || dep.payment_status}
                      </span>
                      {dep.is_credited && <span className="text-[10px] text-emerald-400">✓</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                      <span>{dep.username ? `@${dep.username}` : dep.first_name || `#${dep.telegram_id}`}</span>
                      <span>·</span>
                      <span>{relativeTime(dep.created_at)}</span>
                      {dep.pay_currency && <>
                        <span>·</span>
                        <span>{dep.pay_amount} {dep.pay_currency?.toUpperCase()}</span>
                      </>}
                      {dep.confirmations > 0 && <>
                        <span>·</span>
                        <span>{dep.confirmations} conf</span>
                      </>}
                    </div>
                  </div>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} className="text-dark-500" />
                  </motion.div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-2.5 pb-2.5 space-y-2 border-t border-dark-800/60 pt-2">
                        {/* Detail grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-dark-500">Deposit ID</span><span className="text-dark-300">#{dep.deposit_id}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">User</span><span className="text-dark-300">{dep.username ? `@${dep.username}` : dep.first_name || dep.telegram_id}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Amount (USD)</span><span className="text-emerald-400 font-medium">${(dep.price_amount_usd || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Credited</span><span className={dep.is_credited ? 'text-emerald-400' : 'text-dark-400'}>{dep.is_credited ? 'Yes' : 'No'}</span></div>
                          {dep.pay_currency && (
                            <div className="flex justify-between"><span className="text-dark-500">Paid</span><span className="text-dark-300">{dep.pay_amount} {dep.pay_currency?.toUpperCase()}</span></div>
                          )}
                          <div className="flex justify-between"><span className="text-dark-500">Confirmations</span><span className="text-dark-300">{dep.confirmations || 0}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Created</span><span className="text-dark-300">{fmtDate(dep.created_at)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Status</span><span className="text-dark-300">{statusLabels[dep.payment_status] || dep.payment_status}</span></div>
                          {dep.tx_hash && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-dark-500">TX Hash</span>
                              <span className="text-dark-300 font-mono text-[10px] truncate max-w-[200px]">{dep.tx_hash}</span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {!dep.is_credited && !isStale && (
                            <>
                              <button
                                onClick={(e) => handleCredit(dep, e)}
                                disabled={actionId === dep.deposit_id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                              >
                                <Check size={11} /> Credit to Balance
                              </button>
                              {dep.payment_status !== 'manual_marked' && (
                                <button
                                  onClick={(e) => handleMarkCredited(dep, e)}
                                  disabled={actionId === dep.deposit_id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors disabled:opacity-50"
                                >
                                  <Check size={11} /> Mark Only
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Numbered Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum
            if (totalPages <= 7) {
              pageNum = i + 1
            } else if (page <= 4) {
              pageNum = i + 1
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i
            } else {
              pageNum = page - 3 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  page === pageNum ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-[10px] text-dark-500 ml-2">{total} deposits</span>
        </div>
      )}
    </div>
  )
}

// ======================== WITHDRAWALS TAB ========================
function WithdrawalsTab() {
  const { tgConfirm } = useAuthStore()
  const { addToast } = useToast()
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const [hotWallet, setHotWallet] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [rejectId, setRejectId] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState({ pending: 0, processing: 0, approved: 0, completed: 0, failed: 0, rejected: 0, total: 0 })
  const [globalStats, setGlobalStats] = useState({ total_amount: 0, total_net: 0, pending_sum: 0 })
  const PER_PAGE = 20

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => { setPage(1) }, [statusFilter])
  useEffect(() => { load() }, [page, statusFilter, debouncedSearch])

  const load = async () => {
    setLoading(true)
    try {
      const params = { page, per_page: PER_PAGE }
      if (statusFilter !== 'all') params.status = statusFilter
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      const { data } = await api.get('/api/admin/withdrawals', { params })
      setWithdrawals(data.items)
      setTotal(data.total)
      setTotalPages(data.pages)
      setStatusCounts(data.status_counts)
      if (data.stats) setGlobalStats(data.stats)
    } catch {
      setWithdrawals([])
      addToast('Failed to load withdrawals', { type: 'error' })
    } finally { setLoading(false) }
  }

  const loadHotWallet = async () => {
    try {
      const { data } = await api.get('/api/admin/hot-wallet')
      setHotWallet(data)
    } catch { setHotWallet({ error: 'Failed to load' }) }
  }

  useEffect(() => { loadHotWallet() }, [])

  const handleApprove = async (wr, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Approve withdrawal of $${wr.amount?.toFixed(2)} to ${wr.destination?.slice(0, 12)}...? This will send USDT from the hot wallet.`)) return
    setActionLoading(wr.id)
    try {
      const { data } = await api.post(`/api/admin/withdrawals/${wr.id}/approve`)
      addToast(data.message || 'Withdrawal approved & sent', { type: 'success' })
      load(); loadHotWallet()
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Approve failed', { type: 'error' })
    } finally { setActionLoading(null) }
  }

  const handleReject = async (wr) => {
    if (!await tgConfirm(`Reject withdrawal of $${wr.amount?.toFixed(2)}? Funds will be refunded to user's balance.`)) return
    setActionLoading(wr.id)
    try {
      const { data } = await api.post(`/api/admin/withdrawals/${wr.id}/reject`, null, { params: { note: rejectNote.trim() || '' } })
      addToast(data.message || 'Withdrawal rejected', { type: 'success' })
      setRejectId(null); setRejectNote(''); load()
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Reject failed', { type: 'error' })
    } finally { setActionLoading(null) }
  }

  const handleRetry = async (wr, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Reset withdrawal #${wr.id} to pending? You can then approve it again.`)) return
    setActionLoading(wr.id)
    try {
      await api.post(`/api/admin/withdrawals/${wr.id}/retry`)
      addToast('Withdrawal reset to pending', { type: 'success' })
      load()
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Retry failed', { type: 'error' })
    } finally { setActionLoading(null) }
  }

  const statusLabels = {
    pending: 'Pending',
    processing: 'Processing',
    approved: 'Approved',
    completed: 'Completed',
    failed: 'Failed',
    rejected: 'Rejected'
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-3">
      {/* Hot Wallet Balance */}
      {hotWallet && !hotWallet.error && (
        <div className="card p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Wallet size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400">Hot Wallet (USDT TRC-20)</p>
              <p className="text-[10px] font-mono text-dark-500 truncate max-w-[180px]">{hotWallet.address}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-emerald-400">${hotWallet.usdt_balance?.toFixed(2) || '0.00'}</p>
            <p className="text-[10px] text-dark-500">{hotWallet.trx_balance?.toFixed(2) || '0'} TRX (gas)</p>
          </div>
        </div>
      )}

      {/* Global Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-primary-400">{statusCounts.total}</p>
          <p className="text-[9px] text-dark-500">Total</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-amber-400">{statusCounts.pending}</p>
          <p className="text-[9px] text-dark-500">Pending</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-orange-400">${globalStats.pending_sum.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">Pending $</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">${globalStats.total_amount.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">All-time</p>
        </div>
      </div>

      {/* Status Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'processing', label: 'Processing' },
          { key: 'approved', label: 'Approved' },
          { key: 'completed', label: 'Completed' },
          { key: 'failed', label: 'Failed' },
          { key: 'rejected', label: 'Rejected' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              statusFilter === key
                ? key === 'pending' ? 'bg-amber-500/20 text-amber-400'
                : key === 'processing' ? 'bg-blue-500/20 text-blue-400'
                : key === 'approved' || key === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
                : key === 'failed' ? 'bg-orange-500/20 text-orange-400'
                : key === 'rejected' ? 'bg-red-500/20 text-red-400'
                : 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {label} ({key === 'all' ? statusCounts.total : statusCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search user, ID, destination..."
            className="input py-2 pl-8 text-xs w-full"
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
        </div>
        <button onClick={() => { load(); loadHotWallet() }} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-4 w-1/3 bg-dark-800 rounded mb-2" /><div className="h-3 w-1/2 bg-dark-800 rounded" /></div>)}</div>
      ) : withdrawals.length === 0 ? (
        <div className="card p-8 text-center"><ArrowUpCircle size={28} className="mx-auto text-dark-600 mb-2" /><p className="text-dark-400 text-sm">No withdrawal requests</p></div>
      ) : (
        <div className="space-y-1.5">
          {withdrawals.map((wr, i) => {
            const isExpanded = expandedId === wr.id
            return (
              <motion.div
                key={wr.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.015 }}
                className="card overflow-hidden"
              >
                {/* Collapsed row */}
                <div
                  className="p-2.5 flex items-center gap-2 cursor-pointer hover:bg-dark-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : wr.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">${wr.amount?.toFixed(2)}</span>
                      {wr.fee_amount > 0 && (
                        <span className="text-[9px] text-dark-500">-${wr.fee_amount?.toFixed(2)}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${withdrawalStatusColors[wr.status] || 'bg-dark-800 text-dark-400'}`}>
                        {statusLabels[wr.status] || wr.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                      <span>{wr.username ? `@${wr.username}` : wr.first_name || `#${wr.telegram_id}`}</span>
                      <span>·</span>
                      <span>{relativeTime(wr.created_at)}</span>
                      {wr.destination && <>
                        <span>·</span>
                        <span className="font-mono truncate max-w-[100px]">{wr.destination.slice(0, 10)}...{wr.destination.slice(-4)}</span>
                      </>}
                    </div>
                  </div>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} className="text-dark-500" />
                  </motion.div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-2.5 pb-2.5 space-y-2 border-t border-dark-800/60 pt-2">
                        {/* Detail grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-dark-500">ID</span><span className="text-dark-300">#{wr.id}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">User</span><span className="text-dark-300">{wr.username ? `@${wr.username}` : wr.first_name || wr.telegram_id}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Amount</span><span className="text-emerald-400 font-medium">${(wr.amount || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Fee</span><span className="text-dark-300">${(wr.fee_amount || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Net</span><span className="text-emerald-400">${(wr.net_amount || wr.amount || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">User Balance</span><span className="text-dark-300">${(wr.user_balance || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Requested</span><span className="text-dark-300">{fmtDate(wr.created_at)}</span></div>
                          {wr.processed_at && <div className="flex justify-between"><span className="text-dark-500">Processed</span><span className="text-dark-300">{fmtDate(wr.processed_at)}</span></div>}
                          {wr.destination && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-dark-500">Destination</span>
                              <span className="text-dark-300 font-mono text-[10px] truncate max-w-[200px]">{wr.destination}</span>
                            </div>
                          )}
                          {wr.payout_hash && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-dark-500">TX Hash</span>
                              <a href={`https://tronscan.org/#/transaction/${wr.payout_hash}`} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300 font-mono text-[10px] truncate max-w-[200px]">{wr.payout_hash.slice(0, 20)}...</a>
                            </div>
                          )}
                          {wr.payout_status && (
                            <div className="flex justify-between"><span className="text-dark-500">Payout Status</span><span className="text-dark-300">{wr.payout_status}</span></div>
                          )}
                          {wr.payout_currency && (
                            <div className="flex justify-between"><span className="text-dark-500">Currency</span><span className="text-dark-300 uppercase">{wr.payout_currency}</span></div>
                          )}
                          {wr.admin_note && (
                            <div className="col-span-2 flex justify-between"><span className="text-dark-500">Admin Note</span><span className="text-dark-300 truncate max-w-[200px]">{wr.admin_note}</span></div>
                          )}
                        </div>

                        {/* Payout error */}
                        {wr.payout_error && (
                          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                            <p className="text-[10px] text-red-400 font-medium mb-0.5">Payout Error</p>
                            <p className="text-[11px] text-dark-300">{wr.payout_error}</p>
                          </div>
                        )}

                        {/* Reject inline form */}
                        {rejectId === wr.id && (
                          <div className="flex gap-1.5 items-center">
                            <input
                              value={rejectNote}
                              onChange={e => setRejectNote(e.target.value)}
                              placeholder="Rejection reason (optional)..."
                              className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-red-500"
                              autoFocus
                            />
                            <button onClick={() => handleReject(wr)} disabled={actionLoading === wr.id} className="px-3 py-1.5 text-[11px] rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium transition-colors disabled:opacity-50">Reject</button>
                            <button onClick={() => { setRejectId(null); setRejectNote('') }} className="px-2 py-1.5 text-[11px] rounded-lg bg-dark-700 text-dark-400 hover:bg-dark-600 transition-colors"><X size={12} /></button>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {wr.status === 'pending' && (
                            <>
                              <button
                                onClick={(e) => handleApprove(wr, e)}
                                disabled={actionLoading === wr.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                              >
                                <Check size={11} /> Approve & Send
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setRejectId(rejectId === wr.id ? null : wr.id); setRejectNote('') }}
                                disabled={actionLoading === wr.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              >
                                <X size={11} /> Reject
                              </button>
                            </>
                          )}
                          {wr.status === 'failed' && (
                            <>
                              <button
                                onClick={(e) => handleRetry(wr, e)}
                                disabled={actionLoading === wr.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw size={11} /> Retry
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setRejectId(rejectId === wr.id ? null : wr.id); setRejectNote('') }}
                                disabled={actionLoading === wr.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              >
                                <X size={11} /> Reject & Refund
                              </button>
                            </>
                          )}
                          {wr.status === 'processing' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setRejectId(rejectId === wr.id ? null : wr.id); setRejectNote('') }}
                              disabled={actionLoading === wr.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                            >
                              <X size={11} /> Cancel & Refund
                            </button>
                          )}
                          {wr.payout_hash && (
                            <a
                              href={`https://tronscan.org/#/transaction/${wr.payout_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <Eye size={11} /> View TX
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Numbered Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum
            if (totalPages <= 7) {
              pageNum = i + 1
            } else if (page <= 4) {
              pageNum = i + 1
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i
            } else {
              pageNum = page - 3 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  page === pageNum ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-[10px] text-dark-500 ml-2">{total} withdrawals</span>
        </div>
      )}
    </div>
  )
}

// ======================== DISPUTES TAB ========================
function DisputesTab() {
  const navigate = useNavigate()
  const { tgConfirm } = useAuthStore()
  const { addToast } = useToast()
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [resolveNote, setResolveNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState({ open: 0, escalated: 0, resolved: 0, closed: 0, total: 0 })
  const [globalStats, setGlobalStats] = useState({ total_value: 0, open: 0, escalated: 0 })
  const PER_PAGE = 20

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => { setPage(1) }, [statusFilter])
  useEffect(() => { loadDisputes() }, [page, statusFilter, debouncedSearch])

  const loadDisputes = async () => {
    setLoading(true)
    try {
      const params = { page, per_page: PER_PAGE }
      if (statusFilter !== 'all') params.status = statusFilter
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      const { data } = await api.get('/api/admin/disputes', { params })
      setDisputes(data.items)
      setTotal(data.total)
      setTotalPages(data.pages)
      setStatusCounts(data.status_counts)
      if (data.stats) setGlobalStats(data.stats)
    } catch {
      setDisputes([])
      addToast('Failed to load disputes', { type: 'error' })
    } finally { setLoading(false) }
  }

  const handleResolve = async (disputeId, action) => {
    if (!resolveNote.trim()) { addToast('Resolution note required', { type: 'error' }); return }
    const label = action === 'refund_buyer' ? 'refund the buyer' : 'favor the seller'
    if (!await tgConfirm(`Resolve this dispute and ${label}? This action is irreversible.`)) return
    setSubmitting(true)
    try {
      await api.post(`/api/admin/disputes/${disputeId}/resolve`, {
        resolution: resolveNote.trim(),
        action,
      })
      addToast(`Dispute resolved — ${action === 'refund_buyer' ? 'buyer refunded' : 'seller favored'}`, { type: 'success' })
      setExpandedId(null)
      setResolveNote('')
      loadDisputes()
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to resolve', { type: 'error' })
    } finally { setSubmitting(false) }
  }

  const statusLabels = {
    escalated: 'Escalated',
    open: 'Open',
    resolved: 'Resolved',
    closed: 'Closed'
  }

  const orderStatusStyles = {
    pending: 'bg-yellow-500/15 text-yellow-400',
    paid: 'bg-blue-500/15 text-blue-400',
    completed: 'bg-emerald-500/15 text-emerald-400',
    refunded: 'bg-orange-500/15 text-orange-400',
    cancelled: 'bg-dark-700 text-dark-400',
    disputed: 'bg-red-500/15 text-red-400',
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-3">
      {/* Global Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-primary-400">{statusCounts.total}</p>
          <p className="text-[9px] text-dark-500">Total</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-red-400">{globalStats.open}</p>
          <p className="text-[9px] text-dark-500">Open</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-amber-400">{globalStats.escalated}</p>
          <p className="text-[9px] text-dark-500">Escalated</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">${globalStats.total_value.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">Value</p>
        </div>
      </div>

      {/* Status Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'all', label: 'All' },
          { key: 'escalated', label: 'Escalated' },
          { key: 'open', label: 'Open' },
          { key: 'resolved', label: 'Resolved' },
          { key: 'closed', label: 'Closed' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              statusFilter === key
                ? key === 'escalated' ? 'bg-amber-500/20 text-amber-400'
                : key === 'open' ? 'bg-red-500/20 text-red-400'
                : key === 'resolved' ? 'bg-emerald-500/20 text-emerald-400'
                : key === 'closed' ? 'bg-dark-600 text-dark-300'
                : 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {label} ({key === 'all' ? statusCounts.total : statusCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search user, order, reason..."
            className="input py-2 pl-8 text-xs w-full"
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
        </div>
        <button onClick={loadDisputes} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-4 w-1/3 bg-dark-800 rounded mb-2" /><div className="h-3 w-1/2 bg-dark-800 rounded" /></div>)}</div>
      ) : disputes.length === 0 ? (
        <div className="card p-8 text-center"><Shield size={28} className="mx-auto mb-2 text-dark-500" /><p className="text-dark-400 text-sm">No disputes found</p></div>
      ) : (
        <div className="space-y-1.5">
          {disputes.map((d, i) => {
            const isExpanded = expandedId === d.id
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.015 }}
                className="card overflow-hidden"
              >
                {/* Collapsed row */}
                <div
                  className="p-2.5 flex items-center gap-2 cursor-pointer hover:bg-dark-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">${d.order_total?.toFixed(2)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${disputeStatusStyles[d.status] || disputeStatusStyles.closed}`}>
                        {statusLabels[d.status] || d.status}
                      </span>
                      <span className="text-[10px] text-dark-500">Order #{d.order_id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                      <span>@{d.opener_username || d.opener_first_name || 'unknown'}</span>
                      {d.seller_username && <><span>vs</span><span>@{d.seller_username}</span></>}
                      <span>·</span>
                      <span>{relativeTime(d.created_at)}</span>
                    </div>
                  </div>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} className="text-dark-500" />
                  </motion.div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-2.5 pb-2.5 space-y-2 border-t border-dark-800/60 pt-2">
                        {/* Detail grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-dark-500">Dispute ID</span><span className="text-dark-300">#{d.id}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Order ID</span><span className="text-dark-300">#{d.order_id}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Opener</span><span className="text-dark-300">@{d.opener_username || d.opener_first_name || 'unknown'}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Seller</span><span className="text-dark-300">{d.seller_username ? `@${d.seller_username}` : '—'}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Order Total</span><span className="text-emerald-400 font-medium">${(d.order_total || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between">
                            <span className="text-dark-500">Order Status</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${orderStatusStyles[d.order_status] || 'bg-dark-700 text-dark-400'}`}>
                              {d.order_status || '—'}
                            </span>
                          </div>
                          <div className="flex justify-between"><span className="text-dark-500">Opened</span><span className="text-dark-300">{fmtDate(d.created_at)}</span></div>
                          {d.resolved_at && <div className="flex justify-between"><span className="text-dark-500">Resolved</span><span className="text-dark-300">{fmtDate(d.resolved_at)}</span></div>}
                        </div>

                        {/* Reason */}
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                          <p className="text-[10px] text-red-400 font-medium mb-0.5">Reason</p>
                          <p className="text-xs text-dark-200">{d.reason}</p>
                        </div>

                        {/* Resolution (if resolved) */}
                        {d.resolution && (
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                            <p className="text-[10px] text-emerald-400 font-medium mb-0.5">Resolution</p>
                            <p className="text-xs text-dark-200">{d.resolution}</p>
                          </div>
                        )}

                        {/* Resolve form (only for open/escalated) */}
                        {['open', 'escalated'].includes(d.status) && (
                          <div className="space-y-2">
                            <textarea
                              value={resolveNote}
                              onChange={(e) => setResolveNote(e.target.value)}
                              className="input min-h-[50px] text-xs w-full"
                              placeholder="Resolution note..."
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleResolve(d.id, 'favor_seller')}
                                disabled={submitting || !resolveNote.trim()}
                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                              >
                                <Check size={12} /> Favor Seller
                              </button>
                              <button
                                onClick={() => handleResolve(d.id, 'refund_buyer')}
                                disabled={submitting || !resolveNote.trim()}
                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 disabled:opacity-50 transition-colors"
                              >
                                <DollarSign size={12} /> Refund Buyer
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Action links */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <button
                            onClick={() => navigate(`/orders/${d.order_id}`)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors"
                          >
                            <ShoppingCart size={11} /> View Order
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Numbered Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum
            if (totalPages <= 7) {
              pageNum = i + 1
            } else if (page <= 4) {
              pageNum = i + 1
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i
            } else {
              pageNum = page - 3 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  page === pageNum ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-[10px] text-dark-500 ml-2">{total} disputes</span>
        </div>
      )}
    </div>
  )
}

// ======================== ESCROW TAB ========================
const escrowStatusStyles = {
  pending_invite: 'bg-slate-500/15 text-slate-400',
  negotiating: 'bg-blue-500/15 text-blue-400',
  pending_confirmation: 'bg-yellow-500/15 text-yellow-400',
  funds_locked: 'bg-cyan-500/15 text-cyan-400',
  admin_joined: 'bg-purple-500/15 text-purple-400',
  disputed: 'bg-orange-500/15 text-orange-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-red-500/15 text-red-400',
}

function EscrowTab() {
  const navigate = useNavigate()
  const { tgConfirm } = useAuthStore()
  const [allDeals, setAllDeals] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [joining, setJoining] = useState(null)
  const [editingFee, setEditingFee] = useState(null)
  const [feeValue, setFeeValue] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  
  // Escrow settings state
  const [escrowSettings, setEscrowSettings] = useState(null)
  const [esMiddlemanFee, setEsMiddlemanFee] = useState(5)
  const [esMinFee, setEsMinFee] = useState(0)
  const [esProductFee, setEsProductFee] = useState(10)
  const [esAuctionFee, setEsAuctionFee] = useState(5)
  const [esWithdrawalFee, setEsWithdrawalFee] = useState(0)
  const [esPendingCancelHours, setEsPendingCancelHours] = useState(24)
  const [esSaving, setEsSaving] = useState(false)
  const [esMsg, setEsMsg] = useState(null)
  // Seller rank prices
  const [rankPrices, setRankPrices] = useState({
    '1': { price: 50, featured_days: 0 },
    '2': { price: 100, featured_days: 14 },
    '3': { price: 200, featured_days: 30 },
  })

  useEffect(() => { loadData(); loadEscrowSettings() }, [])

  const loadEscrowSettings = async () => {
    try {
      const res = await api.get('/api/admin/escrow-settings')
      setEscrowSettings(res.data)
      setEsMiddlemanFee(res.data.middleman_fee_percent ?? 5)
      setEsMinFee(res.data.middleman_min_fee ?? 0)
      setEsProductFee(res.data.product_fee_percent ?? 10)
      setEsAuctionFee(res.data.auction_fee_percent ?? 5)
      setEsWithdrawalFee(res.data.withdrawal_fee_percent ?? 0)
      setEsPendingCancelHours(res.data.pending_order_cancel_hours ?? 24)
      if (res.data.seller_rank_prices) {
        setRankPrices(prev => ({ ...prev, ...res.data.seller_rank_prices }))
      }
    } catch (err) { console.error(err) }
  }

  const saveEscrowSettings = async () => {
    setEsSaving(true)
    try {
      await api.put('/api/admin/escrow-settings', {
        middleman_fee_percent: esMiddlemanFee,
        middleman_min_fee: esMinFee,
        product_fee_percent: esProductFee,
        auction_fee_percent: esAuctionFee,
        withdrawal_fee_percent: esWithdrawalFee,
        pending_order_cancel_hours: esPendingCancelHours,
        seller_rank_prices: rankPrices,
      })
      setEsMsg('Saved!')
      setTimeout(() => setEsMsg(null), 2000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save settings')
    } finally { setEsSaving(false) }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [dealsRes, statsRes] = await Promise.all([
        api.get('/api/middleman/admin/deals?status=all'),
        api.get('/api/middleman/admin/stats')
      ])
      setAllDeals(dealsRes.data || [])
      setStats(statsRes.data)
    } catch (err) {
      console.error(err)
      setAllDeals([])
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async (dealId, e) => {
    e?.stopPropagation()
    setJoining(dealId)
    try {
      await api.post(`/api/middleman/admin/deals/${dealId}/join`)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to join')
    } finally {
      setJoining(null)
    }
  }

  const handleComplete = async (dealId, e) => {
    e?.stopPropagation()
    if (!await tgConfirm('Mark this deal as completed?')) return
    try {
      await api.post(`/api/middleman/deals/${dealId}/complete`)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to complete')
    }
  }

  const handleCancel = async (dealId, e) => {
    e?.stopPropagation()
    if (!await tgConfirm('Cancel this deal? Funds will be refunded if locked.')) return
    try {
      await api.post(`/api/middleman/deals/${dealId}/cancel`)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to cancel')
    }
  }

  const handleUpdateFee = async (dealId) => {
    const fee = parseFloat(feeValue)
    if (isNaN(fee) || fee < 0 || fee > 50) {
      alert('Fee must be between 0% and 50%')
      return
    }
    try {
      await api.put(`/api/middleman/admin/deals/${dealId}/fee?fee_percent=${fee}`)
      setEditingFee(null)
      setFeeValue('')
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update fee')
    }
  }

  // Status counts
  const statusCounts = allDeals.reduce((acc, d) => {
    const s = String(d.status || '').toLowerCase()
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  // Filter deals
  const filtered = allDeals.filter(d => {
    const s = String(d.status || '').toLowerCase()
    if (statusFilter !== 'all' && s !== statusFilter) return false
    if (searchTerm.trim()) {
      const needle = searchTerm.toLowerCase()
      const hay = [
        d.title, String(d.id),
        d.buyer?.username, d.seller?.username,
        d.buyer_username, d.seller_username
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  // Quick stats
  const filteredVolume = filtered.reduce((sum, d) => sum + (d.amount || 0), 0)
  const disputedCount = filtered.filter(d => d.status === 'disputed').length
  const pendingAdminCount = filtered.filter(d => d.admin_requested && !d.admin).length

  const statusLabels = {
    pending_invite: 'Invite',
    negotiating: 'Negotiating',
    pending_confirmation: 'Confirming',
    funds_locked: 'Locked',
    admin_joined: 'Admin',
    disputed: 'Disputed',
    completed: 'Completed',
    cancelled: 'Cancelled'
  }

  const mainStatuses = ['all', 'funds_locked', 'disputed', 'admin_joined', 'completed', 'cancelled']

  return (
    <div className="space-y-3">
      {/* Status Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {mainStatuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              statusFilter === s
                ? s === 'disputed' ? 'bg-red-500/20 text-red-400'
                : s === 'funds_locked' ? 'bg-cyan-500/20 text-cyan-400'
                : s === 'admin_joined' ? 'bg-purple-500/20 text-purple-400'
                : s === 'completed' ? 'bg-emerald-500/20 text-emerald-400'
                : s === 'cancelled' ? 'bg-dark-600 text-dark-300'
                : 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {s === 'all' ? 'All' : statusLabels[s] || s} ({s === 'all' ? allDeals.length : statusCounts[s] || 0})
          </button>
        ))}
      </div>

      {/* Search + Stats + Settings */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search user, deal ID, title..."
            className="input py-2 pl-8 text-xs w-full"
          />
          <Users2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
        </div>
        <div className="bg-dark-800/60 rounded-lg px-3 py-1.5 text-center">
          <p className="text-xs font-bold text-cyan-400">${filteredVolume.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">{disputedCount}⚠ / {pendingAdminCount}👤</p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-yellow-500/20 text-yellow-400' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'}`}
        >
          <Settings size={14} />
        </button>
        <button onClick={loadData} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Collapsible Fee Settings */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <Settings size={12} className="text-yellow-400" /> Fee Settings
                </h3>
                {esMsg && <span className="text-[10px] text-emerald-400">{esMsg}</span>}
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div>
                  <label className="text-[9px] text-dark-500 block">MM %</label>
                  <input type="number" value={esMiddlemanFee} onChange={e => setEsMiddlemanFee(parseFloat(e.target.value) || 0)} min={0} max={50} step={0.5}
                    className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-dark-500 block">Min $</label>
                  <input type="number" value={esMinFee} onChange={e => setEsMinFee(parseFloat(e.target.value) || 0)} min={0} step={1}
                    className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-dark-500 block">Prod %</label>
                  <input type="number" value={esProductFee} onChange={e => setEsProductFee(parseFloat(e.target.value) || 0)} min={0} max={50} step={0.5}
                    className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-dark-500 block">Auction %</label>
                  <input type="number" value={esAuctionFee} onChange={e => setEsAuctionFee(parseFloat(e.target.value) || 0)} min={0} max={50} step={0.5}
                    className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-dark-500 block">Withdraw %</label>
                  <input type="number" value={esWithdrawalFee} onChange={e => setEsWithdrawalFee(parseFloat(e.target.value) || 0)} min={0} max={50} step={0.5}
                    className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                </div>
              </div>
              {/* Order Policy */}
              <div className="flex items-center gap-2 mt-1">
                <label className="text-[9px] text-dark-500 whitespace-nowrap">Cancel unpaid orders after</label>
                <input type="number" value={esPendingCancelHours} onChange={e => setEsPendingCancelHours(parseInt(e.target.value) || 0)} min={0} max={720} step={1}
                  className="w-16 bg-dark-800 text-dark-50 text-xs px-2 py-1 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                <span className="text-[9px] text-dark-500">hours <span className="text-dark-600">(0 = never)</span></span>
              </div>
              {/* Seller Level Prices */}
              <div className="pt-2 border-t border-dark-700">
                <h3 className="text-xs font-bold flex items-center gap-1.5 mb-2">
                  <Shield size={12} className="text-yellow-400" /> Seller Level Prices
                </h3>
                <div className="space-y-1.5">
                  {[
                    { key: '1', label: 'Bronze', color: 'text-orange-400' },
                    { key: '2', label: 'Silver', color: 'text-gray-300' },
                    { key: '3', label: 'Gold', color: 'text-yellow-400' },
                  ].map(r => (
                    <div key={r.key} className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold w-12 ${r.color}`}>{r.label}</span>
                      <div className="flex-1">
                        <label className="text-[9px] text-dark-500 block">Price $</label>
                        <input type="number" value={rankPrices[r.key]?.price ?? 0}
                          onChange={e => setRankPrices(p => ({ ...p, [r.key]: { ...p[r.key], price: parseFloat(e.target.value) || 0 } }))}
                          min={0} step={1}
                          className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] text-dark-500 block">Featured Days</label>
                        <input type="number" value={rankPrices[r.key]?.featured_days ?? 0}
                          onChange={e => setRankPrices(p => ({ ...p, [r.key]: { ...p[r.key], featured_days: parseInt(e.target.value) || 0 } }))}
                          min={0} step={1}
                          className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={saveEscrowSettings} disabled={esSaving}
                className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-medium py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50">
                {esSaving ? '...' : 'Save'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deals List */}
      {loading ? (
        <div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-4 w-1/3 bg-dark-800 rounded mb-2" /><div className="h-3 w-1/2 bg-dark-800 rounded" /></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center"><Users2 size={28} className="mx-auto mb-2 text-dark-500" /><p className="text-dark-400 text-sm">No escrow deals found</p></div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015 }}
              className="card p-2.5"
            >
              <div className="flex items-center gap-2">
                {/* Main Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">${d.amount?.toFixed(2) || '?'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${escrowStatusStyles[d.status] || 'bg-dark-700 text-dark-400'}`}>
                      {statusLabels[d.status] || d.status?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-dark-500">#{d.id}</span>
                    {d.funds_locked && <span className="text-[10px] text-cyan-400">🔒</span>}
                    {d.admin_requested && !d.admin && <span className="text-[10px] text-purple-400">👤</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                    <span>{d.buyer?.username ? `@${d.buyer.username}` : d.buyer_username || '?'}</span>
                    <span>↔</span>
                    <span>{d.seller?.username ? `@${d.seller.username}` : d.seller_username || '?'}</span>
                    <span>·</span>
                    <span>{relativeTime(d.created_at)}</span>
                    <span>·</span>
                    <span className="text-yellow-400">{d.fee_percent}%</span>
                  </div>
                  {d.status === 'disputed' && d.dispute_reason && (
                    <p className="text-[9px] text-red-400 mt-0.5 truncate">{d.dispute_reason}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => navigate(`/middleman/${d.id}`)}
                    className="px-2 py-1 text-[10px] rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600"
                  >
                    View
                  </button>
                  {d.admin_requested && !d.admin && !['completed', 'cancelled'].includes(d.status) && (
                    <button
                      onClick={(e) => handleJoin(d.id, e)}
                      disabled={joining === d.id}
                      className="px-2 py-1 text-[10px] rounded-lg bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 disabled:opacity-50"
                    >
                      {joining === d.id ? '...' : 'Join'}
                    </button>
                  )}
                  {['admin_joined', 'funds_locked'].includes(d.status) && (
                    <button
                      onClick={(e) => handleComplete(d.id, e)}
                      className="px-2 py-1 text-[10px] rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    >
                      ✓
                    </button>
                  )}
                  {!['completed', 'cancelled'].includes(d.status) && (
                    <button
                      onClick={(e) => handleCancel(d.id, e)}
                      className="px-2 py-1 text-[10px] rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ======================== USERS TAB ========================
function UsersTab() {
  const { tgConfirm } = useAuthStore()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialSearch = searchParams.get('search') || ''
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [changingRole, setChangingRole] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ username: '', shop_name: '', role: 'SELLER', balance: '0' })
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [roleCounts, setRoleCounts] = useState({ admin: 0, seller: 0, buyer: 0, total: 0 })
  const [expandedId, setExpandedId] = useState(null)
  const [actionId, setActionId] = useState(null)
  const [globalStats, setGlobalStats] = useState({ total_balance: 0, banned_count: 0 })
  // Warn modal
  const [warnUserId, setWarnUserId] = useState(null)
  const [warnReason, setWarnReason] = useState('')
  // Warnings viewer
  const [warningsUserId, setWarningsUserId] = useState(null)
  const [warningsList, setWarningsList] = useState([])
  const [warningsLoading, setWarningsLoading] = useState(false)

  const PER_PAGE = 20

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  // Reset page on role change
  useEffect(() => { setPage(1) }, [roleFilter])

  // Fetch on page/filter/search change
  useEffect(() => { load() }, [page, roleFilter, debouncedSearch])

  const load = async () => {
    setLoading(true)
    try {
      const params = { page, per_page: PER_PAGE }
      if (roleFilter !== 'all') params.role = roleFilter
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      const { data } = await api.get('/api/admin/users', { params })
      setUsers(data.items)
      setTotal(data.total)
      setTotalPages(data.pages)
      setRoleCounts(data.role_counts)
      if (data.stats) setGlobalStats(data.stats)
    } catch (err) {
      setUsers([])
      addToast('Failed to load users', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const changeRole = async (userId, newRole, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Change this user's role to ${newRole}?`)) return
    setChangingRole(userId)
    try {
      await api.put(`/api/admin/users/${userId}/role?role=${newRole.toLowerCase()}`)
      addToast(`Role changed to ${newRole}`, { type: 'success' })
      load()
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to change role', { type: 'error' })
    } finally {
      setChangingRole(null)
    }
  }

  const createUser = async () => {
    if (!createForm.username.trim()) return
    setCreating(true)
    try {
      const params = new URLSearchParams({
        username: createForm.username.trim(),
        role: createForm.role.toLowerCase(),
        balance: createForm.balance || '0',
      })
      if (createForm.shop_name.trim()) params.append('shop_name', createForm.shop_name.trim())
      await api.post(`/api/admin/users/create?${params}`)
      setCreateForm({ username: '', shop_name: '', role: 'SELLER', balance: '0' })
      setShowCreate(false)
      addToast('User created', { type: 'success' })
      load()
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed to create user', { type: 'error' })
    } finally {
      setCreating(false)
    }
  }

  const impersonate = async (userId, e) => {
    e?.stopPropagation()
    if (!await tgConfirm('Impersonate this user? You will see the app as them.')) return
    try {
      const { data } = await api.post(`/api/admin/users/${userId}/impersonate`)
      const ok = await useAuthStore.getState().startImpersonation(data.access_token)
      if (!ok) {
        addToast('Impersonation failed', { type: 'error' })
        return
      }
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Impersonation failed', { type: 'error' })
      return
    }
    navigate('/')
  }

  const toggleBan = async (user, e) => {
    e?.stopPropagation()
    const action = user.is_banned ? 'unban' : 'ban'
    if (user.is_banned) {
      if (!await tgConfirm(`Unban @${user.username || user.telegram_id}?`)) return
      setActionId(user.id)
      try {
        await api.post(`/api/admin/users/${user.id}/ban?ban=false`)
        addToast('User unbanned', { type: 'success' })
        load()
      } catch (e) {
        addToast(e.response?.data?.detail || 'Failed to unban', { type: 'error' })
      } finally { setActionId(null) }
    } else {
      if (!await tgConfirm(`Ban @${user.username || user.telegram_id}? They will be locked out.`)) return
      setActionId(user.id)
      try {
        await api.post(`/api/admin/users/${user.id}/ban?ban=true`)
        addToast('User banned', { type: 'success' })
        load()
      } catch (e) {
        addToast(e.response?.data?.detail || 'Failed to ban', { type: 'error' })
      } finally { setActionId(null) }
    }
  }

  const setAvatar = async (user, e) => {
    e?.stopPropagation()
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.onchange = async (ev) => {
      const file = ev.target.files?.[0]
      if (!file) return
      const formData = new FormData()
      formData.append('file', file)
      setActionId(user.id)
      try {
        await api.post(`/api/admin/users/${user.id}/avatar`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        addToast('Avatar uploaded', { type: 'success' })
        load()
      } catch (err) {
        addToast(err.response?.data?.detail || 'Failed to upload avatar', { type: 'error' })
      } finally { setActionId(null) }
    }
    input.click()
  }

  const setSellerRank = async (userId, rank, name, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Change seller rank to ${name}?`)) return
    setActionId(userId)
    try {
      await api.put(`/api/admin/users/${userId}/seller-rank?rank=${rank}`)
      addToast(`Rank set to ${name}`, { type: 'success' })
      load()
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to set rank', { type: 'error' })
    } finally { setActionId(null) }
  }

  const warnUser = async (user) => {
    if (!warnReason.trim()) { addToast('Reason required', { type: 'error' }); return }
    if (!await tgConfirm(`Warn @${user.username || user.telegram_id}? This will increment their warning count.`)) return
    setActionId(user.id)
    try {
      const { data } = await api.post(`/api/admin/users/${user.id}/warn`, { reason: warnReason.trim() })
      addToast(`Warning #${data.warning_number} issued${data.restriction_days > 0 ? ` (${data.restriction_days}d restriction)` : ''}`, { type: 'success' })
      setWarnUserId(null); setWarnReason(''); load()
    } catch (err) { addToast(err.response?.data?.detail || 'Failed to warn', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const loadWarnings = async (userId) => {
    if (warningsUserId === userId) { setWarningsUserId(null); return }
    setWarningsUserId(userId)
    setWarningsLoading(true)
    try {
      const { data } = await api.get(`/api/admin/users/${userId}/warnings`)
      setWarningsList(data)
    } catch { setWarningsList([]) }
    finally { setWarningsLoading(false) }
  }

  const clearWarnings = async (user, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Clear all warnings for @${user.username || user.telegram_id}? This resets their warning count and removes restrictions.`)) return
    setActionId(user.id)
    try {
      await api.delete(`/api/admin/users/${user.id}/warnings`)
      addToast('Warnings cleared', { type: 'success' })
      setWarningsUserId(null); load()
    } catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const roleConfig = {
    ADMIN: { color: 'text-red-400', bg: 'bg-red-500/15', icon: '🛡️' },
    SELLER: { color: 'text-purple-400', bg: 'bg-purple-500/15', icon: '🏪' },
    BUYER: { color: 'text-dark-300', bg: 'bg-dark-700', icon: '👤' },
  }

  const rankConfig = [
    { rank: 0, label: 'F', name: 'Free', color: 'text-dark-400', bg: 'bg-dark-800', activeBg: 'bg-dark-600', activeColor: 'text-dark-200' },
    { rank: 1, label: 'B', name: 'Bronze', color: 'text-amber-600', bg: 'bg-amber-500/10', activeBg: 'bg-amber-500/25', activeColor: 'text-amber-500' },
    { rank: 2, label: 'S', name: 'Silver', color: 'text-slate-300', bg: 'bg-slate-500/10', activeBg: 'bg-slate-500/25', activeColor: 'text-slate-300' },
    { rank: 3, label: 'G', name: 'Gold', color: 'text-yellow-400', bg: 'bg-yellow-500/10', activeBg: 'bg-yellow-500/25', activeColor: 'text-yellow-400' },
  ]

  const fmtDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-3">
      {/* Global Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-primary-400">{roleCounts.total}</p>
          <p className="text-[9px] text-dark-500">Total Users</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-purple-400">{roleCounts.seller}</p>
          <p className="text-[9px] text-dark-500">Sellers</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">${globalStats.total_balance.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">Total Balance</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-red-400">{globalStats.banned_count}</p>
          <p className="text-[9px] text-dark-500">Banned</p>
        </div>
      </div>

      {/* Role Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'all', label: 'All' },
          { key: 'admin', label: 'Admin' },
          { key: 'seller', label: 'Seller' },
          { key: 'buyer', label: 'Buyer' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setRoleFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              roleFilter === key
                ? key === 'admin' ? 'bg-red-500/20 text-red-400'
                : key === 'seller' ? 'bg-purple-500/20 text-purple-400'
                : key === 'buyer' ? 'bg-dark-600 text-dark-300'
                : 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {label} ({key === 'all' ? roleCounts.total : roleCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Search + Actions */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search user, telegram, shop..."
            className="input py-2 pl-8 text-xs w-full"
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`p-2 rounded-lg transition-colors ${showCreate ? 'bg-primary-500/20 text-primary-400' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'}`}
        >
          <Plus size={14} />
        </button>
        <button onClick={load} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Create User Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-2.5 space-y-2 ring-1 ring-primary-500/20">
              <div className="flex gap-2">
                <input
                  value={createForm.username}
                  onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="Username"
                  className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500"
                />
                <input
                  value={createForm.balance}
                  onChange={e => setCreateForm(f => ({ ...f, balance: e.target.value }))}
                  placeholder="$"
                  type="number"
                  className="w-16 bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500"
                />
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
                  className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="BUYER">Buyer</option>
                  <option value="SELLER">Seller</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={createForm.shop_name}
                  onChange={e => setCreateForm(f => ({ ...f, shop_name: e.target.value }))}
                  placeholder="Shop name (optional)"
                  className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary-500"
                />
                <button
                  onClick={createUser}
                  disabled={creating || !createForm.username.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 disabled:opacity-40"
                >
                  {creating ? '...' : 'Create'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users List */}
      {loading ? (
        <div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-4 w-1/3 bg-dark-800 rounded mb-2" /><div className="h-3 w-1/2 bg-dark-800 rounded" /></div>)}</div>
      ) : users.length === 0 ? (
        <div className="card p-8 text-center"><Users size={28} className="mx-auto text-dark-600 mb-2" /><p className="text-dark-400 text-sm">No users found</p></div>
      ) : (
        <div className="space-y-1.5">
          {users.map((u, i) => {
            const rc = roleConfig[(u.role || '').toUpperCase()] || roleConfig.BUYER
            const isExpanded = expandedId === u.id
            return (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.015 }}
                className="card overflow-hidden"
              >
                {/* Collapsed row */}
                <div
                  className="p-2.5 flex items-center gap-2 cursor-pointer hover:bg-dark-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : u.id)}
                >
                  {/* Avatar */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setAvatar(u, e) }}
                    className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center shrink-0 overflow-hidden hover:ring-2 hover:ring-primary-500/50 transition-all"
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-dark-300">{(u.username || u.first_name || '?')[0].toUpperCase()}</span>
                    )}
                  </button>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">@{u.username || u.telegram_id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rc.bg} ${rc.color}`}>
                        {(u.role || 'buyer').toLowerCase()}
                      </span>
                      {(u.role || '').toUpperCase() === 'SELLER' && u.seller_rank > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rankConfig[u.seller_rank]?.activeBg || 'bg-dark-700'} ${rankConfig[u.seller_rank]?.activeColor || 'text-dark-300'}`}>
                          {rankConfig[u.seller_rank]?.name || `Rank ${u.seller_rank}`}
                        </span>
                      )}
                      {u.is_banned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">ban</span>}
                      {(u.warning_count || 0) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">⚠ {u.warning_count}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                      <span className="text-emerald-400 font-medium">${(u.balance || 0).toFixed(2)}</span>
                      {(u.total_sales || 0) > 0 && <><span>·</span><span>{u.total_sales} sales</span></>}
                      {u.shop_name && <><span>·</span><span className="truncate max-w-[80px]">{u.shop_name}</span></>}
                      {u.created_at && <><span>·</span><span>{fmtDate(u.created_at)}</span></>}
                    </div>
                  </div>

                  {/* Chevron */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={14} className="text-dark-500" />
                  </motion.div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2.5 pb-2.5 space-y-2 border-t border-dark-800/60 pt-2">
                        {/* Detail grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-dark-500">ID</span><span className="text-dark-300">#{u.id}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Telegram</span><span className="text-dark-300 font-mono text-[10px]">{u.telegram_id}</span></div>
                          {u.first_name && <div className="flex justify-between"><span className="text-dark-500">Name</span><span className="text-dark-300">{u.first_name}</span></div>}
                          {u.email && <div className="flex justify-between"><span className="text-dark-500">Email</span><span className="text-dark-300 truncate max-w-[120px]">{u.email}</span></div>}
                          <div className="flex justify-between"><span className="text-dark-500">Balance</span><span className="text-emerald-400 font-medium">${(u.balance || 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Pending</span><span className="text-yellow-400">${(u.pending_balance || 0).toFixed(2)}</span></div>
                          {(u.escrow_balance || 0) > 0 && <div className="flex justify-between"><span className="text-dark-500">Escrow</span><span className="text-orange-400">${u.escrow_balance.toFixed(2)}</span></div>}
                          {(u.collateral || 0) > 0 && <div className="flex justify-between"><span className="text-dark-500">Collateral</span><span className="text-cyan-400">${u.collateral.toFixed(2)}</span></div>}
                          <div className="flex justify-between"><span className="text-dark-500">Sales</span><span className="text-dark-300">{u.total_sales || 0}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Rep</span><span className="text-dark-300">+{u.rep_positive || 0} / -{u.rep_negative || 0}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Joined</span><span className="text-dark-300">{fmtDate(u.created_at)}</span></div>
                          <div className="flex justify-between"><span className="text-dark-500">Warnings</span><span className={`font-medium ${(u.warning_count || 0) > 0 ? 'text-amber-400' : 'text-dark-400'}`}>{u.warning_count || 0}</span></div>
                          {u.restricted_until && new Date(u.restricted_until) > new Date() && (
                            <div className="col-span-2 flex justify-between"><span className="text-dark-500">Restricted until</span><span className="text-red-400">{fmtDate(u.restricted_until)}</span></div>
                          )}
                          {u.is_banned && u.ban_reason && (
                            <div className="col-span-2 flex justify-between"><span className="text-dark-500">Ban reason</span><span className="text-red-400 truncate max-w-[200px]">{u.ban_reason}</span></div>
                          )}
                          {u.seller_expires_at && (
                            <div className="flex justify-between"><span className="text-dark-500">Seller expires</span><span className="text-dark-300">{fmtDate(u.seller_expires_at)}</span></div>
                          )}
                        </div>

                        {/* Role buttons */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-dark-500 mr-0.5">Role:</span>
                          {['BUYER', 'SELLER', 'ADMIN'].map(role => {
                            const isActive = (u.role || '').toUpperCase() === role
                            return (
                              <button
                                key={role}
                                disabled={changingRole === u.id || actionId === u.id}
                                onClick={(e) => !isActive && changeRole(u.id, role, e)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                                  isActive 
                                    ? `${roleConfig[role].bg} ${roleConfig[role].color} ring-1 ring-current/20` 
                                    : 'bg-dark-800/40 text-dark-500 hover:text-dark-300 hover:bg-dark-800'
                                }`}
                              >
                                {role[0]}{role.slice(1).toLowerCase()}
                              </button>
                            )
                          })}
                        </div>

                        {/* Seller Rank Controls */}
                        {(u.role || '').toUpperCase() === 'SELLER' && (
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-dark-500 mr-0.5">Rank:</span>
                            {rankConfig.map(r => {
                              const isActive = (u.seller_rank || 0) === r.rank
                              return (
                                <button
                                  key={r.rank}
                                  disabled={actionId === u.id}
                                  onClick={(e) => !isActive && setSellerRank(u.id, r.rank, r.name, e)}
                                  className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all ${
                                    isActive
                                      ? `${r.activeBg} ${r.activeColor} ring-1 ring-current/20`
                                      : 'bg-dark-800/40 text-dark-500 hover:text-dark-300 hover:bg-dark-800'
                                  }`}
                                >
                                  {r.name}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* Warn inline form */}
                        {warnUserId === u.id && (
                          <div className="flex gap-1.5 items-center">
                            <input
                              value={warnReason}
                              onChange={e => setWarnReason(e.target.value)}
                              placeholder="Warning reason..."
                              className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-amber-500"
                              autoFocus
                            />
                            <button onClick={() => warnUser(u)} disabled={actionId === u.id} className="px-3 py-1.5 text-[11px] rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium transition-colors disabled:opacity-50">Send</button>
                            <button onClick={() => { setWarnUserId(null); setWarnReason('') }} className="px-2 py-1.5 text-[11px] rounded-lg bg-dark-700 text-dark-400 hover:bg-dark-600 transition-colors"><X size={12} /></button>
                          </div>
                        )}

                        {/* Warnings list viewer */}
                        {warningsUserId === u.id && (
                          <div className="bg-dark-800/50 rounded-lg p-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-medium text-amber-400">Warning History</span>
                              {warningsList.length > 0 && (
                                <button onClick={(e) => clearWarnings(u, e)} disabled={actionId === u.id} className="text-[10px] text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">Clear All</button>
                              )}
                            </div>
                            {warningsLoading ? (
                              <p className="text-[10px] text-dark-500">Loading...</p>
                            ) : warningsList.length === 0 ? (
                              <p className="text-[10px] text-dark-500">No warnings on record</p>
                            ) : warningsList.map(w => (
                              <div key={w.id} className="bg-dark-900/50 rounded p-1.5 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-amber-400 font-medium">#{w.warning_number}</span>
                                  <span className="text-dark-500">{fmtDate(w.created_at)}</span>
                                </div>
                                <p className="text-dark-300 mt-0.5">{w.reason}</p>
                                {w.restriction_days > 0 && <p className="text-red-400 mt-0.5">{w.restriction_days}d restriction</p>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <button
                            onClick={(e) => impersonate(u.id, e)}
                            disabled={actionId === u.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                          >
                            <UserCog size={11} /> Impersonate
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setWarnUserId(warnUserId === u.id ? null : u.id); setWarnReason('') }}
                            disabled={actionId === u.id || (u.role || '').toUpperCase() === 'ADMIN'}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                          >
                            <AlertTriangle size={11} /> Warn
                          </button>
                          {(u.warning_count || 0) > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); loadWarnings(u.id) }}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${warningsUserId === u.id ? 'bg-amber-500/20 text-amber-400' : 'bg-dark-700 text-dark-400 hover:bg-dark-600'}`}
                            >
                              <Eye size={11} /> Warnings ({u.warning_count})
                            </button>
                          )}
                          {(u.role || '').toUpperCase() === 'SELLER' && u.shop_name && (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/shop/${u.id}`) }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                            >
                              <Store size={11} /> Shop
                            </button>
                          )}
                          <button
                            onClick={(e) => toggleBan(u, e)}
                            disabled={actionId === u.id || (u.role || '').toUpperCase() === 'ADMIN'}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50 ${
                              u.is_banned ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            }`}
                          >
                            {u.is_banned ? <><Check size={11} /> Unban</> : <><X size={11} /> Ban</>}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setAvatar(u, e) }}
                            disabled={actionId === u.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-dark-700 text-dark-400 hover:bg-dark-600 transition-colors disabled:opacity-50"
                          >
                            <Camera size={11} /> Avatar
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Numbered Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum
            if (totalPages <= 7) {
              pageNum = i + 1
            } else if (page <= 4) {
              pageNum = i + 1
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i
            } else {
              pageNum = page - 3 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  page === pageNum ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-[10px] text-dark-500 ml-2">{total} users</span>
        </div>
      )}
    </div>
  )
}

// ======================== BLACKLIST TAB ========================
function BlacklistTab() {
  const { tgConfirm } = useAuthStore()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [roleCounts, setRoleCounts] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [actionId, setActionId] = useState(null)
  const perPage = 20

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ identifier: '', reason: '' })
  const [adding, setAdding] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [modalSearchDebounce, setModalSearchDebounce] = useState(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => { setPage(1) }, [sortBy])
  useEffect(() => { load() }, [page, debouncedSearch, sortBy])

  const load = async () => {
    setLoading(true)
    try {
      const params = { admin: true, page, per_page: perPage, sort_by: sortBy }
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      const { data } = await api.get('/api/admin/blacklist', { params })
      setUsers(data.items)
      setTotal(data.total)
      setTotalPages(data.pages)
      setRoleCounts(data.role_counts || {})
    } catch { setUsers([]) }
    finally { setLoading(false) }
  }

  const unban = async (userId) => {
    if (!await tgConfirm('Unban this user and remove from blacklist?')) return
    setActionId(userId)
    try {
      await api.post(`/api/admin/users/${userId}/ban?ban=false`)
      await load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to unban')
    }
    finally { setActionId(null) }
  }

  const searchUsers = (term) => {
    if (modalSearchDebounce) clearTimeout(modalSearchDebounce)
    if (!term.trim() || term.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/api/admin/users', { params: { search: term, per_page: 20 } })
        const filtered = data.items.filter(u => !u.is_banned).slice(0, 10)
        setSearchResults(filtered)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
    setModalSearchDebounce(t)
  }

  const banUser = async (userId, username, reason) => {
    if (!await tgConfirm(`Ban ${username || 'this user'}?`)) return
    setAdding(true)
    try {
      await api.post(`/api/admin/users/${userId}/ban?ban=true${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`)
      setShowAddModal(false)
      setAddForm({ identifier: '', reason: '' })
      setSearchResults([])
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to ban user')
    }
    finally { setAdding(false) }
  }

  const formatDate = (v) => v ? new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  const totalBanned = Object.values(roleCounts).reduce((s, c) => s + c, 0)
  const startIdx = (page - 1) * perPage + 1
  const endIdx = Math.min(page * perPage, total)

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-red-400">{totalBanned}</p>
          <p className="text-[9px] text-dark-500">Total Banned</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-dark-300">{roleCounts.buyer || 0}</p>
          <p className="text-[9px] text-dark-500">Buyers</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-purple-400">{roleCounts.seller || 0}</p>
          <p className="text-[9px] text-dark-500">Sellers</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-amber-400">{roleCounts.admin || 0}</p>
          <p className="text-[9px] text-dark-500">Admins</p>
        </div>
      </div>

      {/* Search + Sort + Add + Refresh */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search username, reason, TG ID..."
              className="input py-2 pl-8 pr-8 text-xs w-full"
            />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
            title="Ban user"
          >
            <Plus size={14} />
          </button>
          <button onClick={load} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors" title="Refresh">
            <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="input py-1.5 text-xs flex-1"
          >
            <option value="newest">Newest Bans</option>
            <option value="oldest">Oldest Bans</option>
            <option value="username">Username A–Z</option>
          </select>
        </div>
      </div>

      {/* Results info */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-[10px] text-dark-500 px-1">
          <span>Showing {startIdx}–{endIdx} of {total} banned users</span>
          <span>Page {page}/{totalPages}</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => (
          <div key={i} className="card animate-pulse p-3">
            <div className="flex gap-3">
              <div className="w-10 h-10 bg-dark-800 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-2/3 bg-dark-800 rounded mb-2" />
                <div className="h-3 w-1/2 bg-dark-800 rounded" />
              </div>
            </div>
          </div>
        ))}</div>
      ) : users.length === 0 ? (
        <div className="card p-10 text-center">
          <Check size={32} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-dark-300 text-sm font-medium mb-1">No banned users</p>
          <p className="text-dark-500 text-xs">
            {searchTerm ? 'Try a different search term' : 'The blacklist is empty'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user, i) => {
            const isExpanded = expandedId === user.id
            return (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="card overflow-hidden"
              >
                {/* Main row — clickable to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : user.id)}
                  className="w-full p-3 flex items-center gap-2.5 text-left hover:bg-dark-800/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Skull size={16} className="text-red-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm truncate">
                        {user.username ? `@${user.username}` : user.first_name || `ID: ${user.telegram_id}`}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        user.role === 'seller' ? 'bg-purple-500/15 text-purple-400'
                        : user.role === 'admin' ? 'bg-red-500/15 text-red-400'
                        : 'bg-dark-700 text-dark-400'
                      }`}>
                        {user.role}
                      </span>
                      {user.warning_count > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 flex-shrink-0">
                          {user.warning_count}⚠
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-dark-500">
                      <span>{formatDate(user.banned_at)}</span>
                      {user.ban_reason && (
                        <>
                          <span>·</span>
                          <span className="text-red-400 truncate max-w-[160px]">{user.ban_reason}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <ChevronDown size={14} className={`text-dark-600 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-dark-700/50 px-3 pb-3 pt-2 space-y-2.5">
                        {/* Ban reason full */}
                        {user.ban_reason && (
                          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                            <p className="text-[9px] text-red-400 uppercase tracking-wider mb-0.5">Ban Reason</p>
                            <p className="text-xs text-dark-300 whitespace-pre-wrap">{user.ban_reason}</p>
                          </div>
                        )}

                        {/* Detail grid */}
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Telegram ID</p>
                            <p className="text-dark-200 font-mono text-[9px]">{user.telegram_id || '—'}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Balance</p>
                            <p className="text-dark-200 font-medium">${(user.balance || 0).toFixed(2)}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Sales</p>
                            <p className="text-dark-200 font-medium">{user.total_sales || 0}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Warnings</p>
                            <p className="text-amber-400 font-medium">{user.warning_count || 0}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Shop</p>
                            <p className="text-dark-200 font-medium truncate">{user.shop_name || '—'}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Banned</p>
                            <p className="text-dark-200 font-medium">{user.banned_at ? relativeTime(user.banned_at) : '—'}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => unban(user.id)}
                            disabled={actionId === user.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium transition-colors disabled:opacity-50"
                          >
                            <Check size={12} />
                            {actionId === user.id ? '...' : 'Unban'}
                          </button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(user.telegram_id || '') }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 font-medium transition-colors"
                          >
                            <Copy size={12} /> Copy TG ID
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="card p-2.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-[11px] font-medium transition-colors ${
                      page === pageNum
                        ? 'bg-primary-500 text-white'
                        : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Add to Blacklist Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-900 rounded-xl p-5 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                    <ShieldX size={16} className="text-red-400" />
                  </div>
                  <h3 className="font-bold">Add to Blacklist</h3>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-dark-700">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Ban Reason — placed first so user fills it before selecting target */}
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Ban Reason</label>
                  <input
                    value={addForm.reason}
                    onChange={e => setAddForm({ ...addForm, reason: e.target.value })}
                    placeholder="e.g., Scammer, Fraud, Chargebacks..."
                    className="input text-sm w-full"
                  />
                </div>

                {/* Search User */}
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Search User to Ban</label>
                  <div className="relative">
                    <input
                      value={addForm.identifier}
                      onChange={e => {
                        setAddForm({ ...addForm, identifier: e.target.value })
                        searchUsers(e.target.value)
                      }}
                      placeholder="Username, Telegram ID, Name..."
                      className="input text-sm w-full pl-8"
                    />
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
                  </div>
                </div>

                {/* Search Results */}
                {searching && (
                  <div className="text-center py-2">
                    <RefreshCw size={16} className="animate-spin mx-auto text-dark-400" />
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {searchResults.map(u => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-dark-800 hover:bg-dark-700 cursor-pointer group transition-colors"
                        onClick={() => banUser(u.id, u.username || u.first_name || u.telegram_id, addForm.reason)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon size={12} className="text-dark-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{u.username ? `@${u.username}` : u.first_name || `ID: ${u.telegram_id}`}</p>
                            <div className="flex items-center gap-1.5 text-[9px] text-dark-500">
                              <span>{u.role}</span>
                              {(u.balance || 0) > 0 && <><span>·</span><span className="text-emerald-400">${u.balance.toFixed(2)}</span></>}
                              {(u.total_sales || 0) > 0 && <><span>·</span><span>{u.total_sales} sales</span></>}
                            </div>
                          </div>
                        </div>
                        <ShieldX size={14} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}

                {addForm.identifier && !searching && searchResults.length === 0 && addForm.identifier.length >= 2 && (
                  <p className="text-[10px] text-dark-500 text-center py-2">No matching unbanned users found</p>
                )}

                <p className="text-[10px] text-dark-500 text-center">
                  Fill reason above, then search and click a user to ban
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ======================== SELLERS TAB ========================
function SellersTab() {
  const navigate = useNavigate()
  const { tgConfirm } = useAuthStore()
  const { addToast } = useToast()
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('sales')
  const [expandedId, setExpandedId] = useState(null)
  const [actionId, setActionId] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState({ featured: 0, withCollateral: 0, active: 0, totalCollateral: 0, totalSales: 0 })
  // Collateral input
  const [collateralSellerId, setCollateralSellerId] = useState(null)
  const [collateralAmount, setCollateralAmount] = useState('')
  // Warn modal
  const [warnSellerId, setWarnSellerId] = useState(null)
  const [warnReason, setWarnReason] = useState('')
  // Expiry modal
  const [expirySellerId, setExpirySellerId] = useState(null)
  const [expiryDays, setExpiryDays] = useState('30')

  // ── Orders & sales state ──
  const [sellerOrders, setSellerOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [showOrders, setShowOrders] = useState(null)
  const [ordersStats, setOrdersStats] = useState({ completed_orders: 0, total_revenue: 0 })
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersTotalPages, setOrdersTotalPages] = useState(1)
  const [ordersTotal, setOrdersTotal] = useState(0)

  // ── Stock management state ──
  const [sellerProducts, setSellerProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [showProducts, setShowProducts] = useState(null)
  const [stockProduct, setStockProduct] = useState(null)
  const [showStockModal, setShowStockModal] = useState(false)
  const [keysInput, setKeysInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [viewKeys, setViewKeys] = useState(null)
  const [keysLoading, setKeysLoading] = useState(false)
  const [productKeys, setProductKeys] = useState([])

  const PER_PAGE = 20
  const RANK_NAMES = { 0: 'Free', 1: 'Bronze', 2: 'Silver', 3: 'Gold' }
  const RANK_COLORS = {
    0: 'bg-dark-700 text-dark-400',
    1: 'bg-amber-700/20 text-amber-500',
    2: 'bg-slate-400/20 text-slate-300',
    3: 'bg-yellow-500/20 text-yellow-400',
  }

  useEffect(() => { load() }, [page, filter, sortBy])
  useEffect(() => { setPage(1) }, [filter, sortBy])

  const searchTimeout = useRef(null)
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => { setPage(1); load() }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [searchTerm])

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page)
      params.set('per_page', PER_PAGE)
      if (sortBy) params.set('sort_by', sortBy)
      if (filter !== 'all') params.set('filter', filter)
      if (searchTerm.trim()) params.set('search', searchTerm.trim())
      const { data } = await api.get(`/api/admin/sellers?${params}`)
      setSellers(data.items || [])
      setTotalPages(data.pages || 1)
      setTotalCount(data.total || 0)

      if (!searchTerm.trim() && filter === 'all' && page === 1) {
        const all = data.items || []
        setStats({
          featured: all.filter(s => s.is_featured).length,
          withCollateral: all.filter(s => (s.collateral || 0) > 0).length,
          active: all.filter(s => (s.total_sales || 0) > 0).length,
          totalCollateral: all.reduce((sum, s) => sum + (s.collateral || 0), 0),
          totalSales: all.reduce((sum, s) => sum + (s.total_sales || 0), 0),
        })
      }
    } catch { setSellers([]) }
    finally { setLoading(false) }
  }

  // ── Seller actions ──
  const toggleFeatured = async (seller, e) => {
    e?.stopPropagation()
    const action = seller.is_featured ? 'Remove featured status from' : 'Feature'
    if (!await tgConfirm(`${action} ${seller.shop_name || seller.username}?`)) return
    setActionId(seller.id)
    try { await api.put(`/api/admin/sellers/${seller.id}/feature?featured=${!seller.is_featured}`); await load() }
    catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const setCollateral = async (seller) => {
    const amount = parseFloat(collateralAmount)
    if (isNaN(amount) || amount < 0) { addToast('Invalid amount', { type: 'error' }); return }
    if (!await tgConfirm(`Set ${seller.shop_name || seller.username}'s collateral to $${amount.toFixed(2)}?`)) return
    setActionId(seller.id)
    try { await api.put(`/api/admin/sellers/${seller.id}/collateral?amount=${amount}`); setCollateralSellerId(null); setCollateralAmount(''); await load() }
    catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const resetCollateral = async (seller, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Reset ${seller.shop_name || seller.username}'s collateral to $0?`)) return
    setActionId(seller.id)
    try { await api.put(`/api/admin/sellers/${seller.id}/collateral?amount=0`); await load() }
    catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const changeRank = async (seller, newRank) => {
    const rankName = RANK_NAMES[newRank] || newRank
    if (!await tgConfirm(`Change ${seller.shop_name || seller.username}'s rank to ${rankName}?`)) return
    setActionId(seller.id)
    try { await api.put(`/api/admin/users/${seller.id}/seller-rank?rank=${newRank}`); await load() }
    catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const warnSeller = async (seller) => {
    if (!warnReason.trim()) { addToast('Reason required', { type: 'error' }); return }
    if (!await tgConfirm(`Warn ${seller.shop_name || seller.username}? This will increment their warning count.`)) return
    setActionId(seller.id)
    try {
      const { data } = await api.post(`/api/admin/users/${seller.id}/warn`, { reason: warnReason.trim() })
      addToast(`Warning #${data.warning_number} issued${data.restriction_days > 0 ? ` (${data.restriction_days}d restriction)` : ''}`, { type: 'success' })
      setWarnSellerId(null); setWarnReason(''); await load()
    } catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const setExpiry = async (seller) => {
    const days = parseInt(expiryDays)
    if (isNaN(days) || days < 0 || days > 365) { addToast('Enter 0-365 days', { type: 'error' }); return }
    const label = days === 0 ? 'Never expires' : `${days} days from now`
    if (!await tgConfirm(`Set ${seller.shop_name || seller.username}'s seller expiry to ${label}?`)) return
    setActionId(seller.id)
    try { await api.put(`/api/admin/sellers/${seller.id}/expiry?days=${days}`); setExpirySellerId(null); await load() }
    catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  const banSeller = async (seller, e) => {
    e?.stopPropagation()
    if (!await tgConfirm(`Ban seller ${seller.shop_name || seller.username}? This will remove them from the marketplace.`)) return
    setActionId(seller.id)
    try { await api.post(`/api/admin/users/${seller.id}/ban?ban=true&reason=Admin%20action`); await load() }
    catch (err) { addToast(err.response?.data?.detail || 'Failed', { type: 'error' }) }
    finally { setActionId(null) }
  }

  // ── Stock management functions ──
  const stockColor = (count) => {
    if (count === 0) return { text: 'text-red-400', bg: 'bg-red-500', ring: 'ring-red-500/30 bg-red-500/5' }
    if (count <= 5) return { text: 'text-yellow-400', bg: 'bg-yellow-500', ring: 'ring-yellow-500/20 bg-yellow-500/5' }
    return { text: 'text-emerald-400', bg: 'bg-emerald-500', ring: '' }
  }

  const toggleOrders = (sellerId) => {
    if (showOrders === sellerId) { setShowOrders(null); return }
    setShowOrders(sellerId)
    setOrdersPage(1)
    fetchSellerOrders(sellerId, 1)
  }

  const fetchSellerOrders = async (sellerId, pg = ordersPage) => {
    setOrdersLoading(true)
    try {
      const { data } = await api.get(`/api/admin/sellers/${sellerId}/orders`, { params: { page: pg, per_page: 10 } })
      setSellerOrders(data.items || [])
      setOrdersTotalPages(data.pages || 1)
      setOrdersTotal(data.total || 0)
      setOrdersStats({ completed_orders: data.completed_orders || 0, total_revenue: data.total_revenue || 0 })
    } catch { setSellerOrders([]) }
    finally { setOrdersLoading(false) }
  }

  const toggleProducts = (sellerId) => {
    if (showProducts === sellerId) { setShowProducts(null); return }
    setShowProducts(sellerId)
    fetchSellerProducts(sellerId)
  }

  const fetchSellerProducts = async (sellerId) => {
    setProductsLoading(true)
    try {
      const { data } = await api.get('/api/admin/products', { params: { seller_id: sellerId, per_page: 100, sort_by: 'stock_asc' } })
      setSellerProducts(data.items || [])
    } catch { setSellerProducts([]) }
    finally { setProductsLoading(false) }
  }

  const openStockModal = (product) => {
    setStockProduct(product)
    setKeysInput('')
    setUploadResult(null)
    setViewKeys(null)
    setProductKeys([])
    setShowStockModal(true)
  }

  const handleAddKeys = async (e) => {
    e.preventDefault()
    if (!stockProduct || !keysInput.trim()) return
    setSubmitting(true)
    try {
      const keys = keysInput.split('\n').map(k => k.trim()).filter(k => k)
      const { data } = await api.post(`/api/products/${stockProduct.id}/keys`, { keys })
      setUploadResult(data)
      setKeysInput('')
      if (showProducts) fetchSellerProducts(showProducts)
    } catch (error) {
      alert(error.response?.data?.detail || 'Error adding keys')
    } finally { setSubmitting(false) }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !stockProduct) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/api/products/${stockProduct.id}/keys/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadResult(data)
      if (showProducts) fetchSellerProducts(showProducts)
    } catch (error) {
      alert(error.response?.data?.detail || 'Error uploading file')
    } finally {
      setSubmitting(false)
      e.target.value = ''
    }
  }

  const loadKeys = async (productId) => {
    setKeysLoading(true)
    try {
      const { data } = await api.get(`/api/products/${productId}/keys`)
      setProductKeys(data)
      setViewKeys(productId)
    } catch (e) { alert(e.response?.data?.detail || 'Failed to load keys') }
    finally { setKeysLoading(false) }
  }

  const deleteKey = async (productId, keyId) => {
    if (!await tgConfirm('Delete this key permanently?')) return
    try {
      await api.delete(`/api/products/${productId}/keys/${keyId}`)
      setProductKeys(prev => prev.filter(k => k.id !== keyId))
    } catch (e) { alert(e.response?.data?.detail || 'Failed to delete key') }
  }

  const searchRef = useRef(null)

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-purple-400">{totalCount}</p>
          <p className="text-[9px] text-dark-500">Sellers</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-yellow-400">{stats.featured}</p>
          <p className="text-[9px] text-dark-500">Featured</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">${stats.totalCollateral.toFixed(0)}</p>
          <p className="text-[9px] text-dark-500">Collateral</p>
        </div>
        <div className="card p-2.5 text-center">
          <p className="text-lg font-bold text-primary-400">{stats.totalSales}</p>
          <p className="text-[9px] text-dark-500">Sales</p>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'all', label: 'All' },
          { key: 'featured', label: 'Featured' },
          { key: 'collateral', label: 'Collateral' },
          { key: 'active', label: 'Active' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              filter === key
                ? key === 'featured' ? 'bg-yellow-500/20 text-yellow-400'
                : key === 'collateral' ? 'bg-emerald-500/20 text-emerald-400'
                : key === 'active' ? 'bg-purple-500/20 text-purple-400'
                : 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + Sort + Refresh */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={searchRef}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search shop, username, name, TG ID..."
              className="input py-2 pl-8 pr-8 text-xs w-full"
            />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                <X size={12} />
              </button>
            )}
          </div>
          <button onClick={load} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors" title="Refresh">
            <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input py-1.5 text-xs w-full">
          <option value="sales">Sort: Most Sales</option>
          <option value="rating">Sort: Highest Rating</option>
          <option value="collateral">Sort: Most Collateral</option>
          <option value="rank">Sort: Highest Rank</option>
          <option value="newest">Sort: Newest</option>
        </select>
      </div>

      {/* Results info */}
      {!loading && (
        <p className="text-[10px] text-dark-500 px-1">
          Showing {sellers.length} of {totalCount} sellers
          {searchTerm && ` matching "${searchTerm}"`}
          {totalPages > 1 && ` · Page ${page}/${totalPages}`}
        </p>
      )}

      {/* Sellers List */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => (
          <div key={i} className="card animate-pulse p-3">
            <div className="flex gap-2.5">
              <div className="w-9 h-9 bg-dark-800 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-2/3 bg-dark-800 rounded mb-2" />
                <div className="h-3 w-1/2 bg-dark-800 rounded" />
              </div>
            </div>
          </div>
        ))}</div>
      ) : sellers.length === 0 ? (
        <div className="card p-10 text-center">
          <Store size={32} className="mx-auto text-dark-600 mb-3" />
          <p className="text-dark-300 text-sm font-medium mb-1">No sellers found</p>
          <p className="text-dark-500 text-xs">
            {searchTerm ? 'Try a different search term' : 'No sellers match this filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sellers.map((s, i) => {
            const isExpanded = expandedId === s.id
            const rankNum = s.seller_rank || 0
            const isExpiringSoon = s.seller_expires_at && (new Date(s.seller_expires_at) - Date.now()) < 7 * 86400000 && (new Date(s.seller_expires_at) - Date.now()) > 0
            const isExpired = s.seller_expires_at && new Date(s.seller_expires_at) < new Date()

            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.015 }}
                className={`card overflow-hidden ${s.is_featured ? 'ring-1 ring-yellow-500/30 bg-yellow-500/[0.03]' : ''}`}
              >
                {/* Main row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="w-full p-2.5 flex items-center gap-2.5 text-left hover:bg-dark-800/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-dark-700 flex items-center justify-center shrink-0 overflow-hidden">
                    {s.shop_image || s.avatar_url ? (
                      <img src={s.shop_image || s.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Store size={14} className="text-dark-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-semibold truncate">{s.shop_name || s.username}</span>
                      {s.is_featured && <Star size={10} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${RANK_COLORS[rankNum]}`}>
                        {RANK_NAMES[rankNum]}
                      </span>
                      {(s.collateral || 0) > 0 && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex-shrink-0">${s.collateral.toFixed(0)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-dark-500">
                      <span>@{s.username}</span>
                      {(s.seller_rating || 0) > 0 && <><span>·</span><span>★{s.seller_rating.toFixed(1)} ({s.seller_review_count || 0})</span></>}
                      <span>·</span>
                      <span>{s.total_sales || 0} sales</span>
                      <span>·</span>
                      <span>{s.product_count || 0} products</span>
                      {isExpiringSoon && <span className="text-amber-400 ml-0.5">(⚠ expiring)</span>}
                      {isExpired && <span className="text-red-400 ml-0.5">(expired)</span>}
                      {s.is_featured && s.featured_expires_at && (
                        <><span>·</span><span className={new Date(s.featured_expires_at) < new Date() ? 'text-red-400' : (new Date(s.featured_expires_at) - Date.now()) < 7 * 86400000 ? 'text-amber-400' : 'text-yellow-400'}>★ {relativeTime(s.featured_expires_at)}</span></>
                      )}
                    </div>
                  </div>

                  <ChevronDown size={14} className={`text-dark-600 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-dark-700/50 px-3 pb-3 pt-2 space-y-2.5">
                        {/* Shop description */}
                        {s.shop_description && (
                          <div className="bg-dark-800/30 rounded-lg p-2">
                            <p className="text-[9px] text-dark-500 uppercase tracking-wider mb-0.5">Description</p>
                            <p className="text-xs text-dark-300 whitespace-pre-wrap line-clamp-3">{s.shop_description}</p>
                          </div>
                        )}

                        {/* Detail grid */}
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Telegram ID</p>
                            <p className="text-dark-200 font-mono text-[9px]">{s.telegram_id || '—'}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Balance</p>
                            <p className="text-emerald-400 font-medium">${(s.balance || 0).toFixed(2)}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Pending</p>
                            <p className="text-dark-200 font-medium">${(s.pending_balance || 0).toFixed(2)}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Rating</p>
                            <p className="text-yellow-400 font-medium">★ {(s.seller_rating || 0).toFixed(1)} ({s.seller_review_count || 0})</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Reputation</p>
                            <p className="font-medium">
                              <span className="text-emerald-400">+{s.rep_positive || 0}</span>
                              <span className="text-dark-600 mx-0.5">/</span>
                              <span className="text-red-400">-{s.rep_negative || 0}</span>
                            </p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Products</p>
                            <p className="text-primary-400 font-medium">{s.product_count || 0}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Warnings</p>
                            <p className={`font-medium ${(s.warning_count || 0) > 0 ? 'text-amber-400' : 'text-dark-300'}`}>{s.warning_count || 0}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Seller Exp.</p>
                            <p className={`font-medium ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-dark-200'}`}>
                              {s.seller_expires_at ? relativeTime(s.seller_expires_at) : 'Never'}
                            </p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Featured Exp.</p>
                            <p className={`font-medium ${s.featured_expires_at && new Date(s.featured_expires_at) < new Date() ? 'text-red-400' : s.featured_expires_at && (new Date(s.featured_expires_at) - Date.now()) < 7 * 86400000 ? 'text-amber-400' : s.featured_expires_at ? 'text-yellow-300' : 'text-dark-400'}`}>
                              {s.featured_expires_at ? relativeTime(s.featured_expires_at) : '—'}
                            </p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2 col-span-3">
                            <p className="text-dark-600 mb-0.5">Joined</p>
                            <p className="text-dark-200 font-medium">{relativeTime(s.created_at)}</p>
                          </div>
                        </div>

                        {/* Auto Response */}
                        {s.auto_response && (
                          <div className="bg-dark-800/30 rounded-lg p-2">
                            <p className="text-[9px] text-dark-500 uppercase tracking-wider mb-0.5">Auto Response</p>
                            <p className="text-xs text-dark-400 italic">"{s.auto_response}"</p>
                          </div>
                        )}

                        {/* Rank selector */}
                        <div>
                          <p className="text-[9px] text-dark-500 uppercase tracking-wider mb-1">Seller Rank</p>
                          <div className="flex items-center gap-1">
                            {Object.entries(RANK_NAMES).map(([val, name]) => {
                              const num = parseInt(val)
                              return (
                                <button
                                  key={val}
                                  onClick={() => changeRank(s, num)}
                                  disabled={actionId === s.id}
                                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-40 ${
                                    rankNum === num
                                      ? RANK_COLORS[num].replace('/20', '/30')
                                      : 'bg-dark-800 text-dark-500 hover:bg-dark-700'
                                  }`}
                                >
                                  {name}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Collateral Input */}
                        {collateralSellerId === s.id && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-dark-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={collateralAmount}
                              onChange={e => setCollateralAmount(e.target.value)}
                              placeholder="Amount"
                              className="input py-1.5 text-xs flex-1"
                              autoFocus
                            />
                            <button onClick={() => setCollateral(s)} disabled={actionId === s.id} className="px-3 py-1.5 text-[11px] rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-medium transition-colors disabled:opacity-50">Set</button>
                            <button onClick={() => { setCollateralSellerId(null); setCollateralAmount('') }} className="px-2 py-1.5 text-[11px] rounded-lg bg-dark-700 text-dark-400 hover:bg-dark-600 transition-colors"><X size={12} /></button>
                          </div>
                        )}

                        {/* Warn Input */}
                        {warnSellerId === s.id && (
                          <div className="space-y-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                            <p className="text-[10px] text-amber-400 font-medium">Issue Warning #{(s.warning_count || 0) + 1}</p>
                            <textarea
                              value={warnReason}
                              onChange={e => setWarnReason(e.target.value)}
                              placeholder="Warning reason..."
                              className="input text-xs min-h-[50px] w-full"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button onClick={() => warnSeller(s)} disabled={actionId === s.id} className="px-3 py-1.5 text-[11px] rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium transition-colors disabled:opacity-50">Send Warning</button>
                              <button onClick={() => { setWarnSellerId(null); setWarnReason('') }} className="px-2 py-1.5 text-[11px] rounded-lg bg-dark-700 text-dark-400 hover:bg-dark-600 transition-colors"><X size={12} /></button>
                            </div>
                          </div>
                        )}

                        {/* Expiry Input */}
                        {expirySellerId === s.id && (
                          <div className="flex items-center gap-2">
                            <select value={expiryDays} onChange={e => setExpiryDays(e.target.value)} className="input py-1.5 text-xs flex-1">
                              <option value="0">Never expires</option>
                              <option value="7">7 days</option>
                              <option value="14">14 days</option>
                              <option value="30">30 days</option>
                              <option value="60">60 days</option>
                              <option value="90">90 days</option>
                              <option value="180">180 days</option>
                              <option value="365">365 days</option>
                            </select>
                            <button onClick={() => setExpiry(s)} disabled={actionId === s.id} className="px-3 py-1.5 text-[11px] rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 font-medium transition-colors disabled:opacity-50">Set</button>
                            <button onClick={() => setExpirySellerId(null)} className="px-2 py-1.5 text-[11px] rounded-lg bg-dark-700 text-dark-400 hover:bg-dark-600 transition-colors"><X size={12} /></button>
                          </div>
                        )}

                        {/* ── Orders & Sales History ── */}
                        <div>
                          <button
                            onClick={() => toggleOrders(s.id)}
                            className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 transition-colors"
                          >
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-dark-300">
                              <ShoppingCart size={12} className="text-blue-400" />
                              Orders & Sales
                              <span className="text-dark-500">({s.total_sales || 0})</span>
                            </span>
                            <ChevronDown size={12} className={`text-dark-500 transition-transform ${showOrders === s.id ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {showOrders === s.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 space-y-2">
                                  {/* Stats summary */}
                                  <div className="grid grid-cols-3 gap-1.5">
                                    <div className="bg-dark-800/40 rounded-lg p-2 text-center">
                                      <p className="text-xs font-bold text-blue-400">{ordersTotal}</p>
                                      <p className="text-[8px] text-dark-500">Total Orders</p>
                                    </div>
                                    <div className="bg-dark-800/40 rounded-lg p-2 text-center">
                                      <p className="text-xs font-bold text-emerald-400">{ordersStats.completed_orders}</p>
                                      <p className="text-[8px] text-dark-500">Completed</p>
                                    </div>
                                    <div className="bg-dark-800/40 rounded-lg p-2 text-center">
                                      <p className="text-xs font-bold text-primary-400">${ordersStats.total_revenue.toFixed(2)}</p>
                                      <p className="text-[8px] text-dark-500">Revenue</p>
                                    </div>
                                  </div>

                                  {/* Orders list */}
                                  {ordersLoading ? (
                                    <div className="py-4 text-center">
                                      <RefreshCw size={14} className="mx-auto text-dark-500 animate-spin mb-1" />
                                      <p className="text-dark-500 text-[10px]">Loading orders...</p>
                                    </div>
                                  ) : sellerOrders.length === 0 ? (
                                    <div className="py-3 text-center">
                                      <ShoppingCart size={16} className="mx-auto text-dark-600 mb-1" />
                                      <p className="text-dark-500 text-[10px]">No orders yet</p>
                                    </div>
                                  ) : (
                                    <>
                                      {sellerOrders.map(o => {
                                        const statusColors = {
                                          pending: 'bg-slate-500/15 text-slate-400',
                                          paid: 'bg-blue-500/15 text-blue-400',
                                          delivered: 'bg-cyan-500/15 text-cyan-400',
                                          completed: 'bg-emerald-500/15 text-emerald-400',
                                          disputed: 'bg-orange-500/15 text-orange-400',
                                          refunded: 'bg-red-500/15 text-red-400',
                                          cancelled: 'bg-dark-600/30 text-dark-400',
                                        }
                                        return (
                                          <div key={o.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-dark-800/30">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className="text-[11px] font-medium text-dark-200">#{o.id}</span>
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[o.status] || 'bg-dark-700 text-dark-400'}`}>{o.status}</span>
                                                <span className="text-[9px] text-primary-400 font-medium">${o.seller_amount.toFixed(2)}</span>
                                              </div>
                                              <div className="flex items-center gap-1.5 text-[9px] text-dark-500">
                                                <span>@{o.buyer_username || 'unknown'}</span>
                                                <span>·</span>
                                                <span className="truncate">{o.product_names?.join(', ') || '—'}</span>
                                                <span>·</span>
                                                <span>x{o.quantity}</span>
                                              </div>
                                              <p className="text-[8px] text-dark-600 mt-0.5">{o.created_at ? relativeTime(o.created_at) : '—'}{o.completed_at ? ` · Done ${relativeTime(o.completed_at)}` : ''}</p>
                                            </div>
                                            <button
                                              onClick={() => navigate(`/admin/orders/${o.id}`)}
                                              className="px-2 py-1 rounded-md text-[9px] font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 flex items-center gap-1 flex-shrink-0"
                                            >
                                              <Eye size={9} /> View
                                            </button>
                                          </div>
                                        )
                                      })}

                                      {/* Orders pagination */}
                                      {ordersTotalPages > 1 && (
                                        <div className="flex items-center justify-center gap-1 pt-1">
                                          <button
                                            onClick={() => { const p = ordersPage - 1; setOrdersPage(p); fetchSellerOrders(s.id, p) }}
                                            disabled={ordersPage <= 1}
                                            className="px-2 py-1 rounded text-[10px] bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30"
                                          >
                                            <ChevronLeft size={10} />
                                          </button>
                                          <span className="text-[10px] text-dark-500">{ordersPage}/{ordersTotalPages}</span>
                                          <button
                                            onClick={() => { const p = ordersPage + 1; setOrdersPage(p); fetchSellerOrders(s.id, p) }}
                                            disabled={ordersPage >= ordersTotalPages}
                                            className="px-2 py-1 rounded text-[10px] bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30"
                                          >
                                            <ChevronRight size={10} />
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* ── Products & Stock Section ── */}
                        <div>
                          <button
                            onClick={() => toggleProducts(s.id)}
                            className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 transition-colors"
                          >
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-dark-300">
                              <Package size={12} className="text-primary-400" />
                              Products & Stock
                              <span className="text-dark-500">({s.product_count || 0})</span>
                            </span>
                            <ChevronDown size={12} className={`text-dark-500 transition-transform ${showProducts === s.id ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {showProducts === s.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 space-y-1.5">
                                  {productsLoading ? (
                                    <div className="py-4 text-center">
                                      <RefreshCw size={14} className="mx-auto text-dark-500 animate-spin mb-1" />
                                      <p className="text-dark-500 text-[10px]">Loading products...</p>
                                    </div>
                                  ) : sellerProducts.length === 0 ? (
                                    <div className="py-3 text-center">
                                      <Package size={16} className="mx-auto text-dark-600 mb-1" />
                                      <p className="text-dark-500 text-[10px]">No products listed</p>
                                    </div>
                                  ) : (
                                    sellerProducts.map(p => {
                                      const sc = stockColor(p.stock_count)
                                      return (
                                        <div key={p.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-dark-800/30 ${p.stock_count === 0 ? 'ring-1 ' + sc.ring : p.stock_count <= 5 ? 'ring-1 ' + sc.ring : ''}`}>
                                          <div className="flex flex-col items-center w-8 flex-shrink-0">
                                            <span className={`text-xs font-bold ${sc.text}`}>{p.stock_count}</span>
                                            <span className="text-[7px] text-dark-600">keys</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[11px] font-medium truncate">{p.name}</span>
                                              {!p.is_active && <EyeOff size={8} className="text-dark-500 flex-shrink-0" />}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[9px] text-dark-500">
                                              <span className="text-primary-400 font-medium">${(p.price || 0).toFixed(2)}</span>
                                              <span>·</span>
                                              <span>{p.sales_count || 0} sold</span>
                                              {p.category_name && <><span>·</span><span>{p.category_name}</span></>}
                                              {p.platform && <><span>·</span><span className="text-purple-400">{p.platform}</span></>}
                                              {p.rating > 0 && <><span>·</span><span className="text-amber-400">★{p.rating.toFixed(1)}</span></>}
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => openStockModal(p)}
                                            className="px-2 py-1 rounded-md text-[9px] font-medium bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 flex items-center gap-1 flex-shrink-0"
                                          >
                                            <Key size={10} /> Manage
                                          </button>
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <button
                            onClick={(e) => toggleFeatured(s, e)}
                            disabled={actionId === s.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg font-medium transition-colors disabled:opacity-50 ${
                              s.is_featured
                                ? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25'
                                : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                            }`}
                          >
                            <Star size={12} className={s.is_featured ? 'fill-yellow-400' : ''} />
                            {s.is_featured ? 'Unfeature' : 'Feature'}
                          </button>

                          <button
                            onClick={() => { setCollateralSellerId(collateralSellerId === s.id ? null : s.id); setCollateralAmount((s.collateral || 0).toString()) }}
                            disabled={actionId === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium transition-colors disabled:opacity-50"
                          >
                            <DollarSign size={12} /> Collateral
                          </button>

                          <button
                            onClick={() => { setExpirySellerId(expirySellerId === s.id ? null : s.id); setExpiryDays('30') }}
                            disabled={actionId === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 font-medium transition-colors disabled:opacity-50"
                          >
                            <Clock size={12} /> Expiry
                          </button>

                          <button
                            onClick={() => { setWarnSellerId(warnSellerId === s.id ? null : s.id); setWarnReason('') }}
                            disabled={actionId === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-medium transition-colors disabled:opacity-50"
                          >
                            <AlertTriangle size={12} /> Warn
                          </button>

                          <button
                            onClick={() => navigate(`/shop/${s.id}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 font-medium transition-colors"
                          >
                            <Eye size={12} /> View Shop
                          </button>

                          <button
                            onClick={() => { navigator.clipboard.writeText(s.telegram_id || ''); addToast('Copied TG ID', { type: 'success' }) }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 font-medium transition-colors"
                          >
                            <Copy size={12} /> Copy TG ID
                          </button>

                          <button
                            onClick={(e) => banSeller(s, e)}
                            disabled={actionId === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors disabled:opacity-50"
                          >
                            <ShieldX size={12} /> Ban
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg text-xs bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 transition-colors">
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p
            if (totalPages <= 7) p = i + 1
            else if (page <= 4) p = i + 1
            else if (page >= totalPages - 3) p = totalPages - 6 + i
            else p = page - 3 + i
            return (
              <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] py-1.5 rounded-lg text-xs font-medium transition-colors ${page === p ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'}`}>{p}</button>
            )
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg text-xs bg-dark-800 text-dark-400 hover:bg-dark-700 disabled:opacity-30 transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── Stock Key Management Modal ── */}
      <AnimatePresence>
        {showStockModal && stockProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowStockModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-lg font-bold">Manage Stock</h2>
                  <p className="text-xs text-dark-400">{stockProduct.name} — {stockProduct.seller_shop || 'Unknown'} · {stockProduct.stock_count} keys</p>
                </div>
                <button onClick={() => setShowStockModal(false)} className="p-2 hover:bg-dark-800 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              {/* Tab toggle: Add / View */}
              <div className="flex gap-1 mb-4 bg-dark-800 rounded-lg p-1">
                <button
                  onClick={() => setViewKeys(null)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewKeys === null ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-dark-300'
                  }`}
                >
                  <Upload size={12} className="inline mr-1" /> Add Keys
                </button>
                <button
                  onClick={() => loadKeys(stockProduct.id)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewKeys !== null ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-dark-300'
                  }`}
                >
                  <Eye size={12} className="inline mr-1" /> View Keys {keysLoading ? '...' : ''}
                </button>
              </div>

              {viewKeys !== null ? (
                /* View Keys Panel */
                <div className="space-y-2">
                  {keysLoading ? (
                    <div className="py-6 text-center text-dark-500 text-sm">Loading keys...</div>
                  ) : productKeys.length === 0 ? (
                    <div className="py-6 text-center">
                      <Key size={24} className="mx-auto text-dark-600 mb-2" />
                      <p className="text-dark-400 text-sm">No unsold keys</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] text-dark-500">{productKeys.length} unsold keys</p>
                      <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                        {productKeys.map(k => (
                          <div key={k.id} className="flex items-center justify-between bg-dark-800 rounded-lg px-2.5 py-1.5 group">
                            <code className="text-xs text-dark-300 font-mono truncate flex-1 mr-2">{k.key_value}</code>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-dark-600">{k.created_at ? relativeTime(k.created_at) : ''}</span>
                              <button onClick={() => { navigator.clipboard.writeText(k.key_value) }} className="p-1 text-dark-600 hover:text-dark-300 opacity-0 group-hover:opacity-100 transition-opacity" title="Copy">
                                <Copy size={10} />
                              </button>
                              <button onClick={() => deleteKey(stockProduct.id, k.id)} className="p-1 text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Add Keys Panel */
                <>
                  {uploadResult && (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                        <Check size={16} />
                        {uploadResult.message}
                      </div>
                      <p className="text-xs text-dark-400 mt-1">Current stock: {uploadResult.stock}</p>
                    </div>
                  )}

                  <form onSubmit={handleAddKeys} className="space-y-4">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Keys (one per line)</label>
                      <textarea
                        value={keysInput}
                        onChange={(e) => setKeysInput(e.target.value)}
                        className="input min-h-[140px] font-mono text-sm"
                        placeholder={"XXXXX-XXXXX-XXXXX\nYYYYY-YYYYY-YYYYY"}
                      />
                      <p className="text-xs text-dark-500 mt-1">
                        {keysInput.split('\n').filter(k => k.trim()).length} keys entered
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || !keysInput.trim()}
                      className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                    >
                      {submitting ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <><Upload size={16} /> Add Keys</>
                      )}
                    </button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-dark-700" /></div>
                      <div className="relative flex justify-center text-xs"><span className="px-2 bg-dark-900 text-dark-500">or upload file</span></div>
                    </div>

                    <label className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-dark-600 hover:border-primary-500/50 hover:bg-dark-800/50 transition-colors cursor-pointer ${submitting ? 'opacity-50 pointer-events-none' : ''}`}>
                      <FileUp size={18} className="text-primary-400" />
                      <span className="text-sm">Upload CSV or JSON</span>
                      <input type="file" accept=".csv,.json,.txt" onChange={handleFileUpload} className="hidden" disabled={submitting} />
                    </label>
                    <p className="text-[10px] text-dark-500 text-center -mt-2">
                      CSV: one key per cell · JSON: ["key1","key2"] or {`{"keys": [...]}`}
                    </p>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ======================== BROADCAST TAB ========================
function BroadcastTab() {
  const PRESETS = [
    { id: 'all-both', label: 'All + App + TG', group: 'all', webapp: true, telegram: true },
    { id: 'all-webapp', label: 'All + App only', group: 'all', webapp: true, telegram: false },
    { id: 'sellers', label: 'Sellers + Both', group: 'sellers', webapp: true, telegram: true },
    { id: 'admins', label: 'Admins + Both', group: 'admins', webapp: true, telegram: true },
  ]

  const defaultPreset = PRESETS[0]
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastTelegram, setBroadcastTelegram] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [targetGroup, setTargetGroup] = useState(defaultPreset.group)
  const [sendWebapp, setSendWebapp] = useState(defaultPreset.webapp)
  const [sendTelegram, setSendTelegram] = useState(defaultPreset.telegram)
  const [activePreset, setActivePreset] = useState(defaultPreset.id)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { addToast } = useToast()
  const { tgConfirm } = useAuthStore()

  const applyPreset = (preset) => {
    setTargetGroup(preset.group)
    setSendWebapp(preset.webapp)
    setSendTelegram(preset.telegram)
    setActivePreset(preset.id)
  }

  const sendBroadcast = async (mode = 'all') => {
    const title = broadcastTitle.trim()
    const body = broadcastBody.trim()
    if (!title || !body) { addToast('Title and message required', { type: 'error' }); return }
    if (!sendWebapp && !sendTelegram) { addToast('Enable at least one channel', { type: 'error' }); return }
    if (mode !== 'test' && !await tgConfirm(`Broadcast to ${targetGroup === 'all' ? 'ALL users' : targetGroup}?`)) return
    setBroadcasting(true)
    try {
      const { data } = await api.post('/api/admin/system/broadcast', {
        title, body,
        telegram_text: broadcastTelegram.trim() || null,
        test_only: mode === 'test',
        target_group: targetGroup,
        send_webapp: sendWebapp,
        send_telegram: sendTelegram,
      })
      if (mode === 'all') { setBroadcastTitle(''); setBroadcastBody(''); setBroadcastTelegram('') }
      const label = data.mode === 'test' ? 'Test' : 'Sent'
      addToast(`${label} · ${(data.target_group || targetGroup).toUpperCase()} · App: ${data.webapp_notifications_created} · TG: ${data.telegram_sent}/${data.telegram_failed}/${data.telegram_skipped}`, { type: 'success' })
      // Refresh notification badge immediately
      window.dispatchEvent(new Event('refresh-signals'))
    } catch (e) {
      addToast(e.response?.data?.detail || 'Broadcast failed', { type: 'error' })
    } finally { setBroadcasting(false) }
  }

  return (
    <div className="space-y-3">
      {/* Preset Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              activePreset === preset.id
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => { setActivePreset('custom'); setShowAdvanced(true) }}
          className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
            activePreset === 'custom'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Message Form */}
      <div className="space-y-2">
        <input
          value={broadcastTitle}
          onChange={e => setBroadcastTitle(e.target.value)}
          maxLength={120}
          className="input py-2 text-xs w-full"
          placeholder="Title (required)"
        />
        <textarea
          value={broadcastBody}
          onChange={e => setBroadcastBody(e.target.value)}
          maxLength={1500}
          rows={3}
          className="input py-2 text-xs w-full resize-none"
          placeholder="Message body (required)"
        />
      </div>

      {/* Advanced Options (collapsible) */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[10px] text-dark-500 hover:text-dark-300 transition-colors"
      >
        <Settings size={10} />{showAdvanced ? 'Hide' : 'Show'} advanced
        <ChevronUp size={10} className={`transition-transform ${showAdvanced ? '' : 'rotate-180'}`} />
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pb-2">
              <div className="flex gap-2">
                <select
                  value={targetGroup}
                  onChange={e => { setTargetGroup(e.target.value); setActivePreset('custom') }}
                  className="flex-1 input py-1.5 text-xs"
                >
                  <option value="all">All users</option>
                  <option value="buyers">Buyers</option>
                  <option value="sellers">Sellers</option>
                  <option value="admins">Admins</option>
                </select>
                <button
                  onClick={() => { setSendWebapp(v => !v); setActivePreset('custom') }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                    sendWebapp ? 'bg-primary-500/20 text-primary-400' : 'bg-dark-800 text-dark-500'
                  }`}
                >
                  App {sendWebapp ? '✓' : '○'}
                </button>
                <button
                  onClick={() => { setSendTelegram(v => !v); setActivePreset('custom') }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                    sendTelegram ? 'bg-cyan-500/20 text-cyan-400' : 'bg-dark-800 text-dark-500'
                  }`}
                >
                  TG {sendTelegram ? '✓' : '○'}
                </button>
              </div>
              <textarea
                value={broadcastTelegram}
                onChange={e => setBroadcastTelegram(e.target.value)}
                maxLength={4096}
                rows={2}
                className="input py-2 text-xs w-full resize-none"
                placeholder="Telegram override (optional)"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Send Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => sendBroadcast('test')}
          disabled={broadcasting || !broadcastTitle.trim() || !broadcastBody.trim()}
          className="flex-1 bg-dark-800 hover:bg-dark-700 text-dark-50 text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {broadcasting ? '...' : 'Test (Me)'}
        </button>
        <button
          onClick={() => sendBroadcast('all')}
          disabled={broadcasting || !broadcastTitle.trim() || !broadcastBody.trim()}
          className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {broadcasting ? 'Sending...' : 'Send Broadcast'}
        </button>
      </div>
    </div>
  )
}

// ======================== BANNERS TAB ========================
function BannersTab() {
  const { tgConfirm } = useAuthStore()
  const [subTab, setSubTab] = useState('static') // static, bookings, config
  const [banners, setBanners] = useState([])
  const [bookings, setBookings] = useState([])
  const [slotConfig, setSlotConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingBanner, setEditingBanner] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    link: '',
    link_text: 'Learn More',
    gradient_from: 'primary-500',
    gradient_to: 'accent-purple',
    position: 'below_vouches',
    is_active: true,
    sort_order: 0
  })
  const [saving, setSaving] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({})

  const POSITION_INFO = {
    above_categories: { label: 'Premium Spotlight', pages: ['Home', 'Products', 'Cart'] },
    above_wtb: { label: 'Featured Banner', pages: ['Home', 'Products', 'Cart'] },
    above_escrow: { label: 'Trust Zone', pages: ['Escrow'] },
    above_vouches: { label: 'Top Showcase', pages: ['Home'] },
    below_vouches: { label: 'Discovery Zone', pages: ['Home'] }
  }

  const POSITION_LABELS = Object.fromEntries(
    Object.entries(POSITION_INFO).map(([k, v]) => [k, v.label])
  )

  const handleImageUpload = async (bannerId, file) => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      await api.post(`/api/banners/admin/${bannerId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      loadBanners()
    } catch (e) {
      alert(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const gradientOptions = [
    { value: 'primary-500', label: 'Primary', color: 'bg-primary-500' },
    { value: 'accent-purple', label: 'Purple', color: 'bg-purple-500' },
    { value: 'emerald-500', label: 'Emerald', color: 'bg-emerald-500' },
    { value: 'blue-500', label: 'Blue', color: 'bg-blue-500' },
    { value: 'cyan-500', label: 'Cyan', color: 'bg-cyan-500' },
    { value: 'yellow-500', label: 'Yellow', color: 'bg-yellow-500' },
    { value: 'orange-500', label: 'Orange', color: 'bg-orange-500' },
    { value: 'red-500', label: 'Red', color: 'bg-red-500' },
    { value: 'pink-500', label: 'Pink', color: 'bg-pink-500' },
  ]

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [bannersRes, bookingsRes, configRes] = await Promise.all([
        api.get('/api/banners/admin/all'),
        api.get('/api/banners/admin/bookings'),
        api.get('/api/banners/slots/config')
      ])
      setBanners(bannersRes.data || [])
      setBookings(bookingsRes.data || [])
      setSlotConfig(configRes.data)
      setConfigForm(configRes.data?.positions || {})
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadBanners = async () => {
    try {
      const { data } = await api.get('/api/banners/admin/all')
      setBanners(data)
    } catch (e) {
      console.error(e)
    }
  }

  const loadBookings = async () => {
    try {
      const { data } = await api.get('/api/banners/admin/bookings')
      setBookings(data)
    } catch (e) {
      console.error(e)
    }
  }

  const openCreate = () => {
    setEditingBanner(null)
    setForm({
      title: '',
      subtitle: '',
      link: '',
      link_text: 'Learn More',
      gradient_from: 'primary-500',
      gradient_to: 'accent-purple',
      position: 'below_vouches',
      is_active: true,
      sort_order: banners.length
    })
    setShowModal(true)
  }

  const openEdit = (banner) => {
    setEditingBanner(banner)
    setForm({
      title: banner.title,
      subtitle: banner.subtitle || '',
      link: banner.link || '',
      link_text: banner.link_text || 'Learn More',
      gradient_from: banner.gradient_from || 'primary-500',
      gradient_to: banner.gradient_to || 'accent-purple',
      position: banner.position || 'below_vouches',
      is_active: banner.is_active,
      sort_order: banner.sort_order
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return alert('Title required')
    setSaving(true)
    try {
      if (editingBanner) {
        await api.put(`/api/banners/admin/${editingBanner.id}`, form)
      } else {
        await api.post('/api/banners/admin', form)
      }
      setShowModal(false)
      loadBanners()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error saving banner')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!await tgConfirm('Delete this banner?')) return
    try {
      await api.delete(`/api/banners/admin/${id}`)
      loadBanners()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error deleting')
    }
  }

  const toggleActive = async (banner) => {
    try {
      await api.put(`/api/banners/admin/${banner.id}`, { is_active: !banner.is_active })
      loadBanners()
    } catch (e) {
      alert('Error updating status')
    }
  }

  // Booking actions
  const approveBooking = async (id) => {
    try {
      await api.put(`/api/banners/admin/bookings/${id}`, { is_approved: true, status: 'active' })
      loadBookings()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error approving')
    }
  }

  const rejectBooking = async (id, refund = false) => {
    if (!await tgConfirm(refund ? 'Reject and refund this booking?' : 'Reject this booking?')) return
    try {
      await api.delete(`/api/banners/admin/bookings/${id}?refund=${refund}`)
      loadBookings()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error rejecting')
    }
  }

  // Config save
  const saveConfig = async () => {
    setSavingConfig(true)
    try {
      await api.put('/api/banners/admin/slots/config', { enabled: slotConfig?.enabled !== false, positions: configForm })
      alert('Config saved!')
      loadAll()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error saving config')
    } finally {
      setSavingConfig(false)
    }
  }

  const updatePositionField = (pos, field, value) => {
    setConfigForm(prev => ({
      ...prev,
      [pos]: { ...prev[pos], [field]: value }
    }))
  }

  if (loading) {
    return (
      <div className="space-y-1.5">{[...Array(3)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-6 w-full bg-dark-800 rounded mb-2" /><div className="h-4 w-1/2 bg-dark-800 rounded" /></div>)}</div>
    )
  }

  // Stats
  const activeCount = banners.filter(b => b.is_active).length
  const inactiveCount = banners.length - activeCount
  const pendingBookings = bookings.filter(b => !b.is_approved && b.status === 'pending').length

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'static', label: 'Static Banners', count: banners.length },
          { key: 'bookings', label: 'Bookings', count: bookings.length, alert: pendingBookings },
          { key: 'config', label: 'Slot Config' }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              subTab === t.key 
                ? 'bg-primary-500 text-white' 
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="text-[9px] opacity-70">({t.count})</span>}
            {t.alert > 0 && <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">{t.alert}</span>}
          </button>
        ))}
      </div>

      {/* Static Banners Sub-tab */}
      {subTab === 'static' && (
        <>
          {/* Stats + Add */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex gap-1.5">
              <div className="bg-emerald-500/10 rounded-lg px-3 py-1.5 text-center">
                <p className="text-xs font-bold text-emerald-400">{activeCount}</p>
                <p className="text-[9px] text-dark-500">active</p>
              </div>
              <div className="bg-dark-800 rounded-lg px-3 py-1.5 text-center">
                <p className="text-xs font-bold text-dark-400">{inactiveCount}</p>
                <p className="text-[9px] text-dark-500">inactive</p>
              </div>
            </div>
            <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-400 text-[10px] font-medium flex items-center gap-1 hover:bg-primary-500/30">
              <Plus size={12} />Add
            </button>
            <button onClick={loadBanners} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
              <RefreshCw size={14} className="text-dark-400" />
            </button>
          </div>

          {/* Position Legend */}
          <div className="bg-dark-800/50 rounded-lg p-2.5 border border-dark-700/50">
            <p className="text-[10px] text-dark-400 font-medium mb-1.5">📍 Where positions are displayed:</p>
            <div className="grid grid-cols-1 gap-1">
              {Object.entries(POSITION_INFO).map(([key, info]) => (
                <div key={key} className="flex items-center gap-2 text-[10px]">
                  <span className="text-dark-300 font-medium min-w-[100px]">{info.label}</span>
                  <span className="text-primary-400/80">→ {info.pages.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Banner Size Guide */}
          <div className="bg-primary-500/5 rounded-lg p-2.5 border border-primary-500/10">
            <p className="text-[10px] text-primary-400 font-medium mb-1">🖼️ Banner Image Guide</p>
            <div className="text-[10px] text-dark-300 space-y-0.5">
              <p>Recommended size: <span className="text-white font-semibold">864 × 200 px</span> (4.32:1 ratio)</p>
              <p>Accepted formats: <span className="text-white font-medium">GIF, PNG, JPG, WebP</span> · Max 5 MB</p>
              <p className="text-dark-500">GIFs will animate automatically. Images scale to full container width.</p>
            </div>
          </div>

          {/* Banners List */}
          {banners.length === 0 ? (
            <div className="card p-6 text-center"><Image size={24} className="mx-auto text-dark-600 mb-2" /><p className="text-dark-500 text-sm">No banners yet</p></div>
          ) : (
            <div className="space-y-1.5">
              {banners.map((banner, i) => (
                <motion.div
                  key={banner.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`card p-2.5 ${banner.is_active ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-center gap-2">
                    {/* Preview Thumbnail */}
                    <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center shrink-0 overflow-hidden">
                      {banner.image_url ? (
                        <img src={banner.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br from-${banner.gradient_from}/30 to-${banner.gradient_to}/30 flex items-center justify-center`}>
                          <Image size={16} className="text-dark-500" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{banner.title}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded ${banner.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-dark-800 text-dark-500'}`}>
                          {banner.is_active ? 'active' : 'off'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                        <span>{POSITION_LABELS[banner.position] || banner.position}</span>
                        <span>·</span>
                        <span>#{banner.sort_order}</span>
                        <span>·</span>
                        <span className="text-primary-400/70">{POSITION_INFO[banner.position]?.pages?.join(', ') || 'Home'}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <label className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 cursor-pointer" title="Upload GIF/Image (864×200px)">
                        <Upload size={12} className="text-dark-400" />
                        <input type="file" accept=".gif,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => handleImageUpload(banner.id, e.target.files?.[0])} disabled={uploading} />
                      </label>
                      <button onClick={() => toggleActive(banner)} className={`p-1.5 rounded-lg ${banner.is_active ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}>
                        {banner.is_active ? <X size={12} /> : <Check size={12} />}
                      </button>
                      <button onClick={() => openEdit(banner)} className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(banner.id)} className="p-1.5 rounded-lg bg-dark-800 hover:bg-red-500/20 text-dark-500 hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Bookings Sub-tab */}
      {subTab === 'bookings' && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex gap-1.5">
              <div className="bg-yellow-500/10 rounded-lg px-3 py-1.5 text-center">
                <p className="text-xs font-bold text-yellow-400">{pendingBookings}</p>
                <p className="text-[9px] text-dark-500">pending</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg px-3 py-1.5 text-center">
                <p className="text-xs font-bold text-emerald-400">{bookings.filter(b => b.status === 'active').length}</p>
                <p className="text-[9px] text-dark-500">active</p>
              </div>
            </div>
            <button onClick={loadBookings} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
              <RefreshCw size={14} className="text-dark-400" />
            </button>
          </div>

          {bookings.length === 0 ? (
            <div className="card p-6 text-center"><DollarSign size={24} className="mx-auto text-dark-600 mb-2" /><p className="text-dark-500 text-sm">No bookings yet</p></div>
          ) : (
            <div className="space-y-1.5">
              {bookings.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`card p-2.5 ${!b.is_approved && b.status === 'pending' ? 'ring-1 ring-yellow-500/30' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center shrink-0 overflow-hidden">
                      {b.image_url ? (
                        <img src={b.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Image size={16} className="text-dark-600" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold truncate">{b.title}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          b.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                          b.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400' :
                          'bg-dark-700 text-dark-400'
                        }`}>{b.status}</span>
                        {b.is_approved ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">approved</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">not approved</span>
                        )}
                      </div>
                      <div className="text-[10px] text-dark-500 mt-0.5">
                        {POSITION_LABELS[b.position]} · {new Date(b.starts_at).toLocaleDateString()} - {new Date(b.ends_at).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-dark-400 mt-0.5">
                        <span>User: {b.user_shop_name || b.user_display_name || `#${b.user_id}`}</span>
                        <span className="text-emerald-400">${b.price_paid.toFixed(2)}</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {!b.is_approved && b.status === 'pending' && (
                        <button onClick={() => approveBooking(b.id)} className="px-2 py-1 rounded-lg text-[9px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">
                          Approve
                        </button>
                      )}
                      <button onClick={() => rejectBooking(b.id, true)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20" title="Reject & Refund">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Config Sub-tab */}
      {subTab === 'config' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-dark-400">Configure pricing for each banner position</p>
            <button onClick={saveConfig} disabled={savingConfig} className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-400 text-[10px] font-medium hover:bg-primary-500/30 disabled:opacity-50">
              {savingConfig ? '...' : 'Save Config'}
            </button>
          </div>
          <div className="space-y-2">
            {Object.entries(POSITION_LABELS).map(([key, label]) => {
              const pos = configForm[key] || { price: 150, max_active: 3, description: '', pages: [] }
              return (
                <div key={key} className="card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-medium">{label}</h4>
                    <span className="text-[9px] text-dark-500">{key}</span>
                  </div>
                  <p className="text-[10px] text-primary-400/70 mb-2">📍 {POSITION_INFO[key]?.pages?.join(', ') || 'Home'}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] text-dark-500 block mb-0.5">Price /month</label>
                      <input
                        type="number"
                        value={pos.price || pos.price_30d || 150}
                        onChange={e => updatePositionField(key, 'price', parseFloat(e.target.value) || 0)}
                        className="input py-1.5 text-xs w-full"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-dark-500 block mb-0.5">Max active</label>
                      <input
                        type="number"
                        value={pos.max_active}
                        onChange={e => updatePositionField(key, 'max_active', parseInt(e.target.value) || 1)}
                        className="input py-1.5 text-xs w-full"
                        min={1}
                        max={10}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-dark-500 block mb-0.5">Pages</label>
                      <input
                        type="text"
                        value={(pos.pages || []).join(', ')}
                        onChange={e => updatePositionField(key, 'pages', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="input py-1.5 text-xs w-full"
                        placeholder="home, products"
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <input
                      type="text"
                      value={pos.description || ''}
                      onChange={e => updatePositionField(key, 'description', e.target.value)}
                      className="input py-1.5 text-xs w-full"
                      placeholder="Description (shown to sellers)"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal (Static Banner Edit/Create) */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <h3 className="font-display font-bold text-lg mb-4">
                {editingBanner ? 'Edit Banner' : 'Add Banner'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Title *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    className="input w-full"
                    placeholder="Limited Time Offer"
                  />
                </div>

                <div>
                  <label className="block text-xs text-dark-400 mb-1">Subtitle</label>
                  <input
                    value={form.subtitle}
                    onChange={e => setForm({ ...form, subtitle: e.target.value })}
                    className="input w-full"
                    placeholder="Get 50% off on your first order"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Link URL</label>
                    <input
                      value={form.link}
                      onChange={e => setForm({ ...form, link: e.target.value })}
                      className="input w-full"
                      placeholder="/settings"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Button Text</label>
                    <input
                      value={form.link_text}
                      onChange={e => setForm({ ...form, link_text: e.target.value })}
                      className="input w-full"
                      placeholder="Learn More"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Gradient From</label>
                    <select
                      value={form.gradient_from}
                      onChange={e => setForm({ ...form, gradient_from: e.target.value })}
                      className="input w-full"
                    >
                      {gradientOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Gradient To</label>
                    <select
                      value={form.gradient_to}
                      onChange={e => setForm({ ...form, gradient_to: e.target.value })}
                      className="input w-full"
                    >
                      {gradientOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Sort Order</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                      className="input w-full"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={e => setForm({ ...form, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
                      />
                      <span className="text-sm">Active</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-dark-400 mb-1">Position</label>
                  <select
                    value={form.position}
                    onChange={e => setForm({ ...form, position: e.target.value })}
                    className="input w-full"
                  >
                    {Object.entries(POSITION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {POSITION_INFO[form.position] && (
                    <p className="text-[10px] text-primary-400/80 mt-1">
                      📍 Shown on: {POSITION_INFO[form.position].pages.join(', ')}
                    </p>
                  )}
                </div>

                {/* Preview */}
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Preview</label>
                  <div
                    className={`rounded-lg p-3 bg-gradient-to-r from-${form.gradient_from}/20 via-${form.gradient_to}/20 to-${form.gradient_from}/20 border border-${form.gradient_from}/30`}
                  >
                    <p className="font-display font-bold text-sm">{form.title || 'Banner Title'}</p>
                    {form.subtitle && <p className="text-xs text-dark-300">{form.subtitle}</p>}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.title.trim()}
                    className="flex-1 btn-primary flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><Check size={16} /> Save</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ======================== GIVEAWAYS TAB ========================
function GiveawaysTab() {
  const { tgConfirm } = useAuthStore()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [openEntriesId, setOpenEntriesId] = useState(null)
  const [entries, setEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [pickingId, setPickingId] = useState(null)
  const [manualWinnerEntryId, setManualWinnerEntryId] = useState('')
  const [winnerMenu, setWinnerMenu] = useState(null) // { giveawayId, winnerIdx, x, y } or null
  const winnerMenuRef = useRef(null)

  // Close winner menu on outside click
  useEffect(() => {
    if (!winnerMenu) return
    const handler = (e) => {
      if (winnerMenuRef.current && !winnerMenuRef.current.contains(e.target)) setWinnerMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [winnerMenu])

  const [title, setTitle] = useState('')
  const [prize, setPrize] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [depositRequired, setDepositRequired] = useState(false)
  const [autoPickWinner, setAutoPickWinner] = useState(true)
  const [winnerMode, setWinnerMode] = useState('random')
  const [minReferrals, setMinReferrals] = useState(0)
  const [winnerCount, setWinnerCount] = useState(1)
  const [requireNameKeyword, setRequireNameKeyword] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/giveaways/admin')
      setItems(data || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toIsoOrNull = (v) => {
    if (!v) return null
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
  }

  const create = async (e) => {
    e.preventDefault()
    if (!title.trim() || creating) return
    setCreating(true)
    try {
      await api.post('/api/giveaways/admin', {
        title: title.trim(),
        prize: prize.trim() || null,
        description: description.trim() || null,
        enabled,
        deposit_required: depositRequired,
        auto_pick_winner: autoPickWinner,
        winner_mode: winnerMode,
        min_referrals: minReferrals,
        winner_count: winnerCount,
        require_name_keyword: requireNameKeyword.trim() || null,
        starts_at: toIsoOrNull(startsAt),
        ends_at: toIsoOrNull(endsAt),
      })
      setTitle('')
      setPrize('')
      setDescription('')
      setEnabled(true)
      setDepositRequired(false)
      setAutoPickWinner(true)
      setWinnerMode('random')
      setMinReferrals(0)
      setWinnerCount(1)
      setRequireNameKeyword('')
      setStartsAt('')
      setEndsAt('')
      load()
    } catch (e2) {
      alert(e2.response?.data?.detail || 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  const updateItem = async (id, patch) => {
    try {
      await api.put(`/api/giveaways/admin/${id}`, patch)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed')
    }
  }

  const loadEntries = async (id) => {
    setEntriesLoading(true)
    try {
      const { data } = await api.get(`/api/giveaways/admin/${id}/entries`)
      const list = data || []
      setEntries(list)
      setManualWinnerEntryId(list?.[0]?.id ? String(list[0].id) : '')
    } catch {
      setEntries([])
      setManualWinnerEntryId('')
    } finally {
      setEntriesLoading(false)
    }
  }

  const toggleEntries = async (id) => {
    if (openEntriesId === id) {
      setOpenEntriesId(null)
      setEntries([])
      return
    }
    setOpenEntriesId(id)
    await loadEntries(id)
  }

  const pickWinner = async (id, force = false) => {
    if (pickingId) return
    if (!await tgConfirm(force ? 'Re-pick winner (overwrite current)?' : 'Pick a random winner?')) return
    setPickingId(id)
    try {
      await api.post(`/api/giveaways/admin/${id}/pick-winner?force=${force ? 'true' : 'false'}`)
      await load()
      if (openEntriesId === id) await loadEntries(id)
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to pick winner')
    } finally {
      setPickingId(null)
    }
  }

  const setWinner = async (giveawayId, entryId) => {
    if (pickingId) return
    if (!await tgConfirm('Set this participant as winner?')) return
    setPickingId(giveawayId)
    try {
      await api.post(`/api/giveaways/admin/${giveawayId}/set-winner`, { entry_id: entryId })
      await load()
      if (openEntriesId === giveawayId) await loadEntries(giveawayId)
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to set winner')
    } finally {
      setPickingId(null)
    }
  }

  const setWinnerManual = async (giveawayId) => {
    if (!manualWinnerEntryId) return
    await setWinner(giveawayId, parseInt(manualWinnerEntryId))
  }

  const giveawayStatus = (g) => {
    const now = Date.now()
    const starts = g?.starts_at ? new Date(g.starts_at).getTime() : null
    const ends = g?.ends_at ? new Date(g.ends_at).getTime() : null

    if (!g?.enabled) return { label: 'disabled', cls: 'bg-dark-800 text-dark-400' }
    if (starts && starts > now) return { label: 'scheduled', cls: 'bg-blue-500/15 text-blue-400' }
    if (ends && ends < now) return { label: 'ended', cls: 'bg-red-500/15 text-red-400' }
    return { label: 'live', cls: 'bg-emerald-500/15 text-emerald-400' }
  }

  const remove = async (id) => {
    if (!await tgConfirm('Delete giveaway?')) return
    try {
      await api.delete(`/api/giveaways/admin/${id}`)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed')
    }
  }

  // Status counts
  const liveCount = items.filter(g => giveawayStatus(g).label === 'live').length
  const scheduledCount = items.filter(g => giveawayStatus(g).label === 'scheduled').length
  const endedCount = items.filter(g => giveawayStatus(g).label === 'ended').length
  const [filter, setFilter] = useState('all')
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Filter giveaways
  const filtered = items.filter(g => {
    if (filter === 'all') return true
    return giveawayStatus(g).label === filter
  })

  return (
    <div className="space-y-3">
      {/* Filter Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'all', label: 'All' },
          { key: 'live', label: 'Live' },
          { key: 'scheduled', label: 'Scheduled' },
          { key: 'ended', label: 'Ended' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              filter === key
                ? key === 'live' ? 'bg-emerald-500/20 text-emerald-400'
                : key === 'scheduled' ? 'bg-blue-500/20 text-blue-400'
                : key === 'ended' ? 'bg-red-500/20 text-red-400'
                : 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            {label} ({key === 'all' ? items.length : key === 'live' ? liveCount : key === 'scheduled' ? scheduledCount : endedCount})
          </button>
        ))}
      </div>

      {/* Stats + Create Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1.5">
          <div className="bg-dark-800/60 rounded-lg px-3 py-1.5 text-center">
            <p className="text-xs font-bold text-primary-400">{items.reduce((sum, g) => sum + (g.participant_count || 0), 0)}</p>
            <p className="text-[9px] text-dark-500">entries</p>
          </div>
          <div className="bg-dark-800/60 rounded-lg px-3 py-1.5 text-center">
            <p className="text-xs font-bold text-emerald-400">{items.filter(g => g.winner).length}</p>
            <p className="text-[9px] text-dark-500">winners</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-colors ${
            showCreateForm ? 'bg-primary-500 text-white' : 'bg-primary-500/20 text-primary-400 hover:bg-primary-500/30'
          }`}
        >
          <Plus size={12} />{showCreateForm ? 'Hide' : 'Create'}
        </button>
        <button onClick={load} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Collapsible Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <form onSubmit={create} className="card p-3 space-y-2">
              <input value={title} onChange={e => setTitle(e.target.value)} className="input py-2 text-xs w-full" maxLength={200} placeholder="Title *" />
              <div className="flex gap-2">
                <input value={prize} onChange={e => setPrize(e.target.value)} className="flex-1 input py-2 text-xs" maxLength={200} placeholder="Prize (optional)" />
                <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="flex-1 input py-2 text-xs" />
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                {[{ label: '1d', days: 1 }, { label: '3d', days: 3 }, { label: '1w', days: 7 }].map(opt => (
                  <button key={opt.days} type="button" onClick={() => {
                    const now = new Date(); const end = new Date(now.getTime() + opt.days * 24 * 60 * 60 * 1000)
                    const pad = n => String(n).padStart(2, '0')
                    const localStr = `${end.getFullYear()}-${pad(end.getMonth()+1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`
                    if (!startsAt) { const nowStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`; setStartsAt(nowStr) }
                    setEndsAt(localStr)
                  }} className="px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-dark-400">{opt.label}</button>
                ))}
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={depositRequired} onChange={e => setDepositRequired(e.target.checked)} className="rounded border-dark-600 bg-dark-800 text-primary-500 w-3 h-3" />
                  <span className="text-dark-400">Deposit req</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={autoPickWinner} onChange={e => setAutoPickWinner(e.target.checked)} className="rounded border-dark-600 bg-dark-800 text-emerald-500 w-3 h-3" />
                  <span className="text-dark-400">Auto-pick</span>
                </label>
              </div>
              {/* Tournament Options */}
              <div className="flex items-center gap-3 text-[10px]">
                <select value={winnerMode} onChange={e => setWinnerMode(e.target.value)} className="input py-1.5 text-xs bg-dark-800">
                  <option value="random">Random Winner</option>
                  <option value="most_referrals">Most Referrals (Tournament)</option>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-dark-400">Min refs:</span>
                  <input type="number" value={minReferrals} onChange={e => setMinReferrals(parseInt(e.target.value) || 0)} min="0" className="input py-1 text-xs w-14 text-center" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-dark-400">Places:</span>
                  <input type="number" value={winnerCount} onChange={e => setWinnerCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} min="1" max="10" className="input py-1 text-xs w-12 text-center" />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-dark-400 shrink-0">Name keyword:</span>
                <input value={requireNameKeyword} onChange={e => setRequireNameKeyword(e.target.value)} className="input py-1 text-xs flex-1" maxLength={100} placeholder='e.g. "Gimmick" — users must have this in their TG name' />
              </div>
              <button type="submit" disabled={creating || !title.trim()} className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-1">
                <Gift size={12} />{creating ? '...' : 'Create'}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Giveaways List */}
      {loading ? (
        <div className="space-y-1.5">{[...Array(3)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-4 w-1/2 bg-dark-800 rounded" /></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-center"><Gift size={24} className="mx-auto text-dark-600 mb-2" /><p className="text-dark-500 text-sm">No giveaways</p></div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`card p-2.5 ${
                giveawayStatus(g).label === 'live' ? 'ring-1 ring-emerald-500/30' :
                giveawayStatus(g).label === 'ended' && g.winner ? 'ring-1 ring-yellow-500/20' : ''
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold truncate">{g.title}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded ${giveawayStatus(g).cls}`}>{giveawayStatus(g).label}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-dark-800 text-dark-400">{g.participant_count || 0}</span>
                      {g.deposit_required && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">$</span>}
                      {g.winner_mode === 'most_referrals' && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400">🏆</span>}
                      {g.min_referrals > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-pink-500/15 text-pink-400">{g.min_referrals}+ refs</span>}
                      {g.winner_count > 1 && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400">{g.winner_count} places</span>}
                      {g.require_name_keyword && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400">📛 {g.require_name_keyword}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-dark-500 mt-0.5">
                      {g.prize && <span className="text-primary-400">{g.prize}</span>}
                      {!g.winner && !g.winners?.length && g.ends_at && <span>Ends: {formatDate(g.ends_at)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => pickWinner(g.id, false)} disabled={pickingId === g.id} className="px-2 py-1 rounded-lg text-[9px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50">Pick</button>
                    <button onClick={() => toggleEntries(g.id)} className="px-2 py-1 rounded-lg text-[9px] font-medium bg-dark-800 text-dark-400 hover:bg-dark-700">{openEntriesId === g.id ? 'Hide' : 'View'}</button>
                    <button onClick={() => remove(g.id)} className="p-1.5 rounded-lg bg-dark-800 text-dark-500 hover:text-red-400"><Trash2 size={11} /></button>
                  </div>
                </div>
                {/* Winner display — own row for mobile visibility */}
                {g.winners?.length > 0 ? (
                  <div className="text-[11px] text-emerald-400 bg-emerald-500/10 rounded px-2 py-1 relative">
                    🏆 {g.winners.map((w, i) => (
                      <span key={i} className="relative inline">
                        {i > 0 && ', '}
                        <b>{i+1}.</b>{' '}
                        <button
                          onClick={() => setWinnerMenu(winnerMenu?.giveawayId === g.id && winnerMenu?.winnerIdx === i ? null : { giveawayId: g.id, winnerIdx: i, winner: w })}
                          className="underline hover:text-emerald-300 transition-colors"
                        >
                          {w.display_name}
                        </button>
                        {winnerMenu?.giveawayId === g.id && winnerMenu?.winnerIdx === i && (
                          <div ref={winnerMenuRef} className="absolute left-0 top-full mt-1 z-50 bg-dark-800 border border-dark-700 rounded-lg shadow-xl py-1 min-w-[180px]">
                            <button onClick={() => { navigate(`/?tab=users&search=${encodeURIComponent(w.username || w.telegram_id || w.display_name)}`); setWinnerMenu(null) }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-dark-200 hover:bg-dark-700 flex items-center gap-2">
                              <UserIcon size={12} /> View Profile
                            </button>
                            <button onClick={() => { navigate(`/?tab=support&dm_user_id=${w.user_id}`); setWinnerMenu(null) }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-dark-200 hover:bg-dark-700 flex items-center gap-2">
                              <Send size={12} /> Send Message
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(w.username ? `@${w.username}` : w.telegram_id || ''); setWinnerMenu(null) }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-dark-200 hover:bg-dark-700 flex items-center gap-2">
                              <Copy size={12} /> Copy Handle
                            </button>
                          </div>
                        )}
                      </span>
                    ))}
                  </div>
                ) : g.winner?.display_name ? (
                  <div className="text-[11px] text-emerald-400 bg-emerald-500/10 rounded px-2 py-1 relative">
                    🏆 Winner:{' '}
                    <span className="relative inline">
                      <button
                        onClick={() => setWinnerMenu(winnerMenu?.giveawayId === g.id && winnerMenu?.winnerIdx === -1 ? null : { giveawayId: g.id, winnerIdx: -1, winner: g.winner })}
                        className="underline font-bold hover:text-emerald-300 transition-colors"
                      >
                        {g.winner.display_name}
                      </button>
                      {winnerMenu?.giveawayId === g.id && winnerMenu?.winnerIdx === -1 && (
                        <div ref={winnerMenuRef} className="absolute left-0 top-full mt-1 z-50 bg-dark-800 border border-dark-700 rounded-lg shadow-xl py-1 min-w-[180px]">
                          <button onClick={() => { navigate(`/?tab=users&search=${encodeURIComponent(g.winner.username || g.winner.telegram_id || g.winner.display_name)}`); setWinnerMenu(null) }}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-dark-200 hover:bg-dark-700 flex items-center gap-2">
                            <UserIcon size={12} /> View Profile
                          </button>
                          <button onClick={() => { navigate(`/?tab=support&dm_user_id=${g.winner.user_id}`); setWinnerMenu(null) }}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-dark-200 hover:bg-dark-700 flex items-center gap-2">
                            <Send size={12} /> Send Message
                          </button>
                          <button onClick={() => { navigator.clipboard.writeText(g.winner.username ? `@${g.winner.username}` : g.winner.telegram_id || ''); setWinnerMenu(null) }}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-dark-200 hover:bg-dark-700 flex items-center gap-2">
                            <Copy size={12} /> Copy Handle
                          </button>
                        </div>
                      )}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Entries Expandable */}
              {openEntriesId === g.id && (
                <div className="mt-2 pt-2 border-t border-dark-800/50">
                  {entriesLoading ? (
                    <div className="flex justify-center py-3"><RefreshCw className="w-4 h-4 text-dark-400 animate-spin" /></div>
                  ) : entries.length === 0 ? (
                    <p className="text-[10px] text-dark-500">No entries</p>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <select value={manualWinnerEntryId} onChange={e => setManualWinnerEntryId(e.target.value)} className="flex-1 input py-1 text-[10px]">
                          {entries.map(e => (<option key={e.id} value={String(e.id)}>{e.display_name}</option>))}
                        </select>
                        <button onClick={() => setWinnerManual(g.id)} disabled={!manualWinnerEntryId || pickingId === g.id} className="px-2 py-1 rounded-lg text-[9px] font-medium bg-primary-500/15 text-primary-400">Set</button>
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-0.5">
                        {entries.map(e => (
                          <div key={e.id} className="text-[10px] text-dark-400 px-2 py-0.5 bg-dark-900/50 rounded">{e.display_name} · {formatDate(e.entered_at)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ======================== WTB POSTS TAB ========================
function WtbTab() {
  const { tgConfirm } = useAuthStore()
  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [actionId, setActionId] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState({ total: 0, active: 0, archived: 0, closed: 0 })
  const [expandedId, setExpandedId] = useState(null)
  const perPage = 20

  // WTB limits
  const [wtbPostLimit, setWtbPostLimit] = useState(5)
  const [wtbReplyLimit, setWtbReplyLimit] = useState(20)
  const [limitsSaving, setLimitsSaving] = useState(false)
  const [limitsMsg, setLimitsMsg] = useState(null)

  useEffect(() => {
    api.get('/api/admin/escrow-settings').then(r => {
      setWtbPostLimit(r.data.wtb_daily_post_limit ?? 5)
      setWtbReplyLimit(r.data.wtb_daily_reply_limit ?? 20)
    }).catch(() => {})
  }, [])

  const saveLimits = async () => {
    setLimitsSaving(true)
    try {
      await api.put('/api/admin/escrow-settings', {
        wtb_daily_post_limit: wtbPostLimit,
        wtb_daily_reply_limit: wtbReplyLimit,
      })
      setLimitsMsg('Saved!')
      setTimeout(() => setLimitsMsg(null), 2000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save')
    } finally { setLimitsSaving(false) }
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => { setPage(1) }, [statusFilter])
  useEffect(() => { load() }, [page, statusFilter, debouncedSearch])

  const load = async () => {
    setIsLoading(true)
    try {
      const params = { page, per_page: perPage }
      if (statusFilter !== 'all') params.status = statusFilter
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      const { data } = await api.get('/api/admin/wtb-posts', { params })
      setPosts(data.items)
      setTotal(data.total)
      setTotalPages(data.pages)
      setStatusCounts(data.status_counts)
    } catch { setPosts([]) }
    finally { setIsLoading(false) }
  }

  const handleArchive = async (postId) => {
    setActionId(postId)
    try {
      await api.post(`/api/admin/wtb-posts/${postId}/archive`)
      await load()
    } catch (e) { console.error(e) }
    finally { setActionId(null) }
  }

  const handleUnarchive = async (postId) => {
    setActionId(postId)
    try {
      await api.post(`/api/admin/wtb-posts/${postId}/unarchive`)
      await load()
    } catch (e) { console.error(e) }
    finally { setActionId(null) }
  }

  const handleDelete = async (postId) => {
    if (!await tgConfirm('Permanently delete this WTB post?')) return
    setActionId(postId)
    try {
      await api.delete(`/api/admin/wtb-posts/${postId}`)
      await load()
    } catch (e) { console.error(e) }
    finally { setActionId(null) }
  }

  const budgetLabel = (min, max) => {
    if (min && max) return `$${min.toFixed(0)}–$${max.toFixed(0)}`
    if (min) return `from $${min.toFixed(0)}`
    if (max) return `up to $${max.toFixed(0)}`
    return null
  }

  const statusColor = (post) => {
    if (post.is_archived) return { bg: 'bg-dark-700', text: 'text-dark-400', label: 'Archived', dot: 'bg-dark-500' }
    if (post.status === 'closed') return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Closed', dot: 'bg-red-400' }
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Active', dot: 'bg-emerald-400' }
  }

  const startIdx = (page - 1) * perPage + 1
  const endIdx = Math.min(page * perPage, total)

  return (
    <div className="space-y-3">
      {/* Daily Limits — collapsible */}
      <details className="card overflow-hidden group">
        <summary className="p-3 flex items-center justify-between cursor-pointer hover:bg-dark-800/50 transition-colors list-none">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-amber-400" />
            <span className="text-xs font-bold">Daily Limits</span>
            {limitsMsg && <span className="text-[10px] text-emerald-400 ml-2">{limitsMsg}</span>}
          </div>
          <ChevronDown size={14} className="text-dark-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-dark-700/50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] text-dark-500 block mb-1">Posts / 24h</label>
              <input type="number" value={wtbPostLimit} onChange={e => setWtbPostLimit(parseInt(e.target.value) || 0)} min={0} max={100} step={1}
                className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
              <span className="text-[8px] text-dark-600">0 = unlimited</span>
            </div>
            <div>
              <label className="text-[9px] text-dark-500 block mb-1">Replies / 24h</label>
              <input type="number" value={wtbReplyLimit} onChange={e => setWtbReplyLimit(parseInt(e.target.value) || 0)} min={0} max={500} step={1}
                className="w-full bg-dark-800 text-dark-50 text-xs px-2 py-1.5 rounded border border-dark-700 focus:border-primary-500 outline-none" />
              <span className="text-[8px] text-dark-600">0 = unlimited</span>
            </div>
          </div>
          <button onClick={saveLimits} disabled={limitsSaving}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50">
            {limitsSaving ? '...' : 'Save Limits'}
          </button>
        </div>
      </details>

      {/* Header bar: status filters + search + refresh */}
      <div className="space-y-2">
        {/* Status Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { key: 'all', label: 'All', icon: null },
            { key: 'active', label: 'Active', icon: null },
            { key: 'archived', label: 'Archived', icon: null },
            { key: 'closed', label: 'Closed', icon: null },
          ].map(s => {
            const count = s.key === 'all' ? statusCounts.total : statusCounts[s.key] || 0
            const active = statusFilter === s.key
            return (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                  active
                    ? 'bg-primary-500 text-white shadow-sm shadow-primary-500/25'
                    : 'bg-dark-800 text-dark-400 hover:bg-dark-700 hover:text-dark-300'
                }`}
              >
                {s.label}
                <span className={`ml-1 ${active ? 'text-white/70' : 'text-dark-600'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search row */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search title, description, user..."
              className="input py-2 pl-8 pr-8 text-xs w-full"
            />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                <X size={12} />
              </button>
            )}
          </div>
          <button onClick={load} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors" title="Refresh">
            <RefreshCw size={14} className={`text-dark-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Results info */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-[10px] text-dark-500 px-1">
          <span>Showing {startIdx}–{endIdx} of {total} posts</span>
          <span>Page {page}/{totalPages}</span>
        </div>
      )}

      {/* Posts List */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => (
          <div key={i} className="card animate-pulse p-3">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-dark-800 rounded-lg flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-2/3 bg-dark-800 rounded mb-2" />
                <div className="h-3 w-1/2 bg-dark-800 rounded" />
              </div>
            </div>
          </div>
        ))}</div>
      ) : posts.length === 0 ? (
        <div className="card p-10 text-center">
          <ShoppingBag size={32} className="mx-auto text-dark-600 mb-3" />
          <p className="text-dark-300 text-sm font-medium mb-1">No WTB posts found</p>
          <p className="text-dark-500 text-xs">
            {searchTerm ? 'Try a different search term' : statusFilter !== 'all' ? `No ${statusFilter} posts` : 'No posts yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post, i) => {
            const sc = statusColor(post)
            const isExpanded = expandedId === post.id
            return (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`card overflow-hidden transition-all ${post.is_archived ? 'opacity-60' : ''}`}
              >
                {/* Main row — clickable to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : post.id)}
                  className="w-full p-3 flex items-start gap-2.5 text-left hover:bg-dark-800/30 transition-colors"
                >
                  {/* Index + status dot */}
                  <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                    <span className="text-[9px] text-dark-600 font-mono">#{post.id}</span>
                    <span className={`w-2 h-2 rounded-full ${sc.dot}`} title={sc.label} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">{post.title}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${sc.bg} ${sc.text}`}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-dark-500">
                      <span className="flex items-center gap-1">
                        <UserIcon size={10} />
                        {post.user?.username ? `@${post.user.username}` : post.user?.first_name || '?'}
                      </span>
                      <span>·</span>
                      <span>{relativeTime(post.created_at)}</span>
                      {budgetLabel(post.budget_min, post.budget_max) && (
                        <>
                          <span>·</span>
                          <span className="text-primary-400 font-medium">{budgetLabel(post.budget_min, post.budget_max)}</span>
                        </>
                      )}
                      {post.category && (
                        <>
                          <span>·</span>
                          <span className="text-dark-400">{post.category}</span>
                        </>
                      )}
                      {post.responses > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-blue-400">{post.responses} {post.responses === 1 ? 'reply' : 'replies'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <ChevronDown size={14} className={`text-dark-600 flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-dark-700/50 px-3 pb-3 pt-2 space-y-2.5">
                        {/* Description */}
                        {post.description && (
                          <div>
                            <p className="text-[9px] text-dark-600 uppercase tracking-wider mb-0.5">Description</p>
                            <p className="text-xs text-dark-300 whitespace-pre-wrap leading-relaxed">{post.description}</p>
                          </div>
                        )}

                        {/* Meta grid */}
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Budget</p>
                            <p className="text-dark-200 font-medium">{budgetLabel(post.budget_min, post.budget_max) || 'Not set'}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Responses</p>
                            <p className="text-dark-200 font-medium">{post.responses || 0}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Created</p>
                            <p className="text-dark-200 font-medium">{post.created_at ? new Date(post.created_at).toLocaleDateString() : '—'}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <p className="text-dark-600 mb-0.5">Expires</p>
                            <p className="text-dark-200 font-medium">{post.expires_at ? relativeTime(post.expires_at) : 'Never'}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          {post.is_archived ? (
                            <button
                              onClick={() => handleUnarchive(post.id)}
                              disabled={actionId === post.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium transition-colors disabled:opacity-50"
                            >
                              <RefreshCw size={12} />
                              {actionId === post.id ? '...' : 'Restore'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchive(post.id)}
                              disabled={actionId === post.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-medium transition-colors disabled:opacity-50"
                            >
                              <Archive size={12} />
                              {actionId === post.id ? '...' : 'Archive'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(post.id)}
                            disabled={actionId === post.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            {actionId === post.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="card p-2.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-[11px] font-medium transition-colors ${
                      page === pageNum
                        ? 'bg-primary-500 text-white'
                        : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ======================== CATEGORIES TAB ========================
function CategoriesTab() {
  const { tgConfirm } = useAuthStore()
  const [predefinedTags, setPredefinedTags] = useState([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [newTagName, setNewTagName] = useState('')
  const [newTagParentId, setNewTagParentId] = useState('')
  const [isParentTag, setIsParentTag] = useState(false)
  const [addingTag, setAddingTag] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const [wtbCategories, setWtbCategories] = useState([])
  const [wtbLoading, setWtbLoading] = useState(true)
  const [newWtbCategoryName, setNewWtbCategoryName] = useState('')
  const [addingWtbCategory, setAddingWtbCategory] = useState(false)

  const [serviceCategories, setServiceCategories] = useState([])
  const [svcLoading, setSvcLoading] = useState(true)
  const [newSvcCategoryName, setNewSvcCategoryName] = useState('')
  const [newSvcCategoryIcon, setNewSvcCategoryIcon] = useState('briefcase')
  const [addingSvcCategory, setAddingSvcCategory] = useState(false)

  useEffect(() => {
    loadTags()
    loadWtbCategories()
    loadServiceCategories()
  }, [])

  const loadTags = async () => {
    setTagsLoading(true)
    try {
      const { data } = await api.get('/api/admin/tags')
      setPredefinedTags(data)
    } catch {
      setPredefinedTags([])
    } finally {
      setTagsLoading(false)
    }
  }

  const loadWtbCategories = async () => {
    setWtbLoading(true)
    try {
      const { data } = await api.get('/api/admin/wtb-categories')
      setWtbCategories(data)
    } catch {
      setWtbCategories([])
    } finally {
      setWtbLoading(false)
    }
  }

  const addWtbCategory = async () => {
    const val = newWtbCategoryName.trim()
    if (!val) return
    setAddingWtbCategory(true)
    try {
      await api.post('/api/admin/wtb-categories', { name: val })
      setNewWtbCategoryName('')
      loadWtbCategories()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to add category')
    } finally {
      setAddingWtbCategory(false)
    }
  }

  const deleteWtbCategory = async (id) => {
    if (!await tgConfirm('Delete this WTB category?')) return
    try {
      await api.delete(`/api/admin/wtb-categories/${id}`)
      loadWtbCategories()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to delete category')
    }
  }

  const loadServiceCategories = async () => {
    setSvcLoading(true)
    try {
      const { data } = await api.get('/api/admin/service-categories')
      setServiceCategories(data)
    } catch {
      setServiceCategories([])
    } finally {
      setSvcLoading(false)
    }
  }

  const addSvcCategory = async () => {
    const val = newSvcCategoryName.trim()
    if (!val) return
    setAddingSvcCategory(true)
    try {
      await api.post('/api/admin/service-categories', { name: val, icon: newSvcCategoryIcon })
      setNewSvcCategoryName('')
      setNewSvcCategoryIcon('briefcase')
      loadServiceCategories()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to add category')
    } finally {
      setAddingSvcCategory(false)
    }
  }

  const deleteSvcCategory = async (id) => {
    if (!await tgConfirm('Delete this service category?')) return
    try {
      await api.delete(`/api/admin/service-categories/${id}`)
      loadServiceCategories()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to delete category')
    }
  }

  const addTag = async () => {
    const val = newTagName.trim()
    if (!val) return
    setAddingTag(true)
    try {
      await api.post('/api/admin/tags', { 
        name: val,
        parent_id: newTagParentId ? parseInt(newTagParentId) : null,
        is_parent: isParentTag
      })
      setNewTagName('')
      setNewTagParentId('')
      setIsParentTag(false)
      loadTags()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to add tag')
    } finally {
      setAddingTag(false)
    }
  }

  const deleteTag = async (tagId) => {
    if (!await tgConfirm('Delete this tag?')) return
    try {
      await api.delete(`/api/admin/tags/${tagId}`)
      loadTags()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to delete tag')
    }
  }

  // Stats
  const categoriesCount = predefinedTags.filter(t => t.is_parent).length
  const tagsCount = predefinedTags.filter(t => !t.is_parent).length
  const orphanCount = predefinedTags.filter(t => !t.is_parent && !t.parent_id).length

  // Filter tags by search
  const filterTags = (tags) => {
    if (!searchTerm.trim()) return tags
    const needle = searchTerm.toLowerCase()
    return tags.filter(t => t.name.toLowerCase().includes(needle))
  }

  return (
    <div className="space-y-3">
      {/* Stats + Search + Add */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search tags..."
            className="input py-2 pl-8 text-xs w-full"
          />
          <Tag size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
        </div>
        <div className="bg-dark-800/60 rounded-lg px-3 py-1.5 text-center">
          <p className="text-xs font-bold text-primary-400">{categoriesCount}</p>
          <p className="text-[9px] text-dark-500">cats</p>
        </div>
        <div className="bg-dark-800/60 rounded-lg px-3 py-1.5 text-center">
          <p className="text-xs font-bold text-purple-400">{tagsCount}</p>
          <p className="text-[9px] text-dark-500">tags</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`p-2 rounded-lg transition-colors ${showAddForm ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'}`}
        >
          <Plus size={14} />
        </button>
        <button onClick={() => { loadTags(); loadWtbCategories(); loadServiceCategories() }} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${tagsLoading || wtbLoading || svcLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Collapsible Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() }}}
                  maxLength={50}
                  className="flex-1 input py-2 text-xs"
                  placeholder={isParentTag ? "Category name..." : "Tag name..."}
                />
                <button
                  onClick={addTag}
                  disabled={addingTag || !newTagName.trim()}
                  className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1"
                >
                  <Plus size={12} />{isParentTag ? 'Category' : 'Tag'}
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isParentTag}
                    onChange={e => {
                      setIsParentTag(e.target.checked)
                      if (e.target.checked) setNewTagParentId('')
                    }}
                    className="rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500 w-3.5 h-3.5"
                  />
                  <span className="text-dark-400">Is Category</span>
                </label>
                {!isParentTag && (
                  <select
                    value={newTagParentId}
                    onChange={e => setNewTagParentId(e.target.value)}
                    className="input py-1 text-xs"
                  >
                    <option value="">Uncategorized</option>
                    {predefinedTags.filter(t => t.is_parent).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categories & Tags list */}
      {tagsLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="card p-3 animate-pulse"><div className="h-4 w-1/3 bg-dark-800 rounded" /></div>)}</div>
      ) : predefinedTags.length === 0 ? (
        <div className="card p-6 text-center"><Folder size={24} className="mx-auto text-dark-600 mb-2" /><p className="text-dark-500 text-sm">No categories yet</p></div>
      ) : (
        <div className="space-y-2">
          {/* Parent tags (categories) */}
          {filterTags(predefinedTags.filter(t => t.is_parent)).map(parent => {
            const childTags = filterTags(predefinedTags.filter(t => t.parent_id === parent.id))
            return (
              <motion.div
                key={parent.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-2.5"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-primary-400 flex items-center gap-1">
                    <Folder size={12} />{parent.name}
                    <span className="text-[9px] text-dark-500 font-normal">({childTags.length})</span>
                  </span>
                  <button
                    onClick={() => deleteTag(parent.id)}
                    className="text-dark-600 hover:text-red-400 transition-colors p-1"
                    title="Delete category"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {childTags.length === 0 ? (
                    <span className="text-[10px] text-dark-600 italic">Empty</span>
                  ) : childTags.map(tag => (
                    <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-800 text-[10px] group">
                      <span className="text-dark-300">{tag.name}</span>
                      <button onClick={() => deleteTag(tag.id)} className="text-dark-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </motion.div>
            )
          })}
          
          {/* Orphan tags (no parent) */}
          {filterTags(predefinedTags.filter(t => !t.is_parent && !t.parent_id)).length > 0 && (
            <div className="card p-2.5 opacity-70">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-dark-400 flex items-center gap-1">
                  <Tag size={12} />Uncategorized
                  <span className="text-[9px] text-dark-500">({orphanCount})</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {filterTags(predefinedTags.filter(t => !t.is_parent && !t.parent_id)).map(tag => (
                  <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-800 text-[10px] group">
                    <span className="text-dark-300">{tag.name}</span>
                    <button onClick={() => deleteTag(tag.id)} className="text-dark-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><X size={10} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* WTB Categories - compact inline add */}
      <div className="card p-2.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1"><Tag size={12} />WTB Categories</span>
          <span className="text-[9px] text-dark-500">({wtbCategories.length})</span>
        </div>
        <div className="flex gap-1.5 mb-2">
          <input
            value={newWtbCategoryName}
            onChange={e => setNewWtbCategoryName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWtbCategory() } }}
            maxLength={100}
            className="flex-1 input py-1.5 text-xs"
            placeholder="Add WTB category..."
          />
          <button onClick={addWtbCategory} disabled={addingWtbCategory || !newWtbCategoryName.trim()} className="btn-primary px-2.5 py-1 text-[10px]">
            <Plus size={12} />
          </button>
        </div>
        {wtbLoading ? (
          <div className="flex gap-1 flex-wrap">{[...Array(3)].map((_, i) => <div key={i} className="h-6 w-16 bg-dark-800 rounded animate-pulse" />)}</div>
        ) : wtbCategories.length === 0 ? (
          <p className="text-[10px] text-dark-500">No WTB categories</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {wtbCategories.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-800 text-[10px] group">
                <span className="text-dark-300">{c.name}</span>
                <button onClick={() => deleteWtbCategory(c.id)} className="text-dark-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Service Categories */}
      <div className="card p-2.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1"><Briefcase size={12} />Service Categories</span>
          <span className="text-[9px] text-dark-500">({serviceCategories.length})</span>
        </div>
        <div className="flex gap-1.5 mb-2">
          <input
            value={newSvcCategoryName}
            onChange={e => setNewSvcCategoryName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSvcCategory() } }}
            maxLength={100}
            className="flex-1 input py-1.5 text-xs"
            placeholder="Category name..."
          />
          <select
            value={newSvcCategoryIcon}
            onChange={e => setNewSvcCategoryIcon(e.target.value)}
            className="input py-1.5 text-xs w-24"
          >
            <option value="briefcase">briefcase</option>
            <option value="rocket">rocket</option>
            <option value="graduation-cap">graduation</option>
            <option value="palette">palette</option>
            <option value="code">code</option>
            <option value="pen-tool">pen-tool</option>
            <option value="megaphone">megaphone</option>
            <option value="zap">zap</option>
            <option value="shield">shield</option>
            <option value="star">star</option>
            <option value="wrench">wrench</option>
            <option value="globe">globe</option>
          </select>
          <button onClick={addSvcCategory} disabled={addingSvcCategory || !newSvcCategoryName.trim()} className="btn-primary px-2.5 py-1 text-[10px]">
            <Plus size={12} />
          </button>
        </div>
        {svcLoading ? (
          <div className="flex gap-1 flex-wrap">{[...Array(3)].map((_, i) => <div key={i} className="h-6 w-16 bg-dark-800 rounded animate-pulse" />)}</div>
        ) : serviceCategories.length === 0 ? (
          <p className="text-[10px] text-dark-500">No service categories</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {serviceCategories.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-800 text-[10px] group">
                <span className="text-dark-300">{c.name}</span>
                <span className="text-dark-600 text-[8px]">({c.icon})</span>
                <button onClick={() => deleteSvcCategory(c.id)} className="text-dark-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ======================== BRANDING TAB ========================
const DeferredInput = memo(function DeferredInput({ value, onChange, className, ...props }) {
  const [local, setLocal] = useState(value)
  const ref = useRef(null)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <input
      ref={ref}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onChange(local) }}
      onKeyDown={e => { if (e.key === 'Enter') ref.current?.blur() }}
      className={className}
      {...props}
    />
  )
})

const RuleInput = memo(function RuleInput({ value, idx, placeholder, onCommit }) {
  const [local, setLocal] = useState(value)
  const ref = useRef(null)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <input
      ref={ref}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(idx, local) }}
      onKeyDown={e => { if (e.key === 'Enter') ref.current?.blur() }}
      maxLength={200}
      className="flex-1 bg-dark-700 text-dark-50 text-xs px-3 py-1.5 rounded-lg border border-dark-600 focus:border-primary-500 outline-none"
      placeholder={placeholder}
    />
  )
})

const RulesEditor = memo(function RulesEditor({ rules, setRules, label }) {
  const commitRule = useCallback((idx, val) => {
    setRules(prev => { const u = [...prev]; u[idx] = val; return u })
  }, [setRules])
  const moveUp = useCallback((idx) => {
    setRules(prev => { const u = [...prev]; [u[idx - 1], u[idx]] = [u[idx], u[idx - 1]]; return u })
  }, [setRules])
  const moveDown = useCallback((idx) => {
    setRules(prev => { const u = [...prev]; [u[idx], u[idx + 1]] = [u[idx + 1], u[idx]]; return u })
  }, [setRules])
  const remove = useCallback((idx) => {
    setRules(prev => prev.filter((_, i) => i !== idx))
  }, [setRules])
  const add = useCallback(() => {
    setRules(prev => [...prev, ''])
  }, [setRules])

  return (
    <>
      <div className="space-y-1.5">
        {rules.map((rule, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="text-[10px] text-dark-600 w-4 text-right shrink-0">{idx + 1}.</span>
            <RuleInput value={rule} idx={idx} placeholder={`${label} ${idx + 1}`} onCommit={commitRule} />
            <div className="flex gap-0.5 shrink-0">
              <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-1 rounded hover:bg-dark-700 text-dark-500 disabled:opacity-30" title="Move up"><ChevronUp size={12} /></button>
              <button onClick={() => moveDown(idx)} disabled={idx === rules.length - 1} className="p-1 rounded hover:bg-dark-700 text-dark-500 disabled:opacity-30" title="Move down"><ChevronDown size={12} /></button>
              <button onClick={() => remove(idx)} className="p-1 rounded hover:bg-red-500/20 text-dark-500 hover:text-red-400" title="Remove"><X size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={add} className="mt-2 w-full py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-400 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors">
        <Plus size={12} /> Add {label}
      </button>
    </>
  )
})

function BrandingTab() {
  const { appName, logoUrl, botUsername, showLogo: brandingShowLogo, update } = useBrandingStore()
  const { addToast } = useToast()
  const [name, setName] = useState(appName)
  const [bot, setBot] = useState(botUsername)
  const [showLogo, setShowLogo] = useState(true)
  const [announcements, setAnnouncements] = useState('')
  const [vouches, setVouches] = useState('')
  const [officialGroup, setOfficialGroup] = useState('')
  const [suggestionGroup, setSuggestionGroup] = useState('')
  const [rules, setRules] = useState([])
  const [wtbRules, setWtbRules] = useState([])
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [expandedSection, setExpandedSection] = useState('logo')

  useEffect(() => {
    api.get('/api/admin/branding').then(r => {
      setName(r.data.app_name || '')
      setBot(r.data.bot_username || '')
      setShowLogo(r.data.show_logo !== false)
      setAnnouncements(r.data.announcements_url || '')
      setVouches(r.data.vouches_url || '')
      setOfficialGroup(r.data.official_group_url || '')
      setSuggestionGroup(r.data.suggestion_group_url || '')
      setRules(r.data.marketplace_rules || [])
      setWtbRules(r.data.wtb_rules || [])
      setWelcomeMessage(r.data.bot_welcome_message || '')
    }).catch(() => {})
  }, [])

  const saveBranding = async () => {
    setSaving(true)
    try {
      const res = await api.put('/api/admin/branding', { 
        app_name: name.trim(), 
        bot_username: bot.trim(),
        show_logo: showLogo,
        announcements_url: announcements.trim(),
        vouches_url: vouches.trim(),
        official_group_url: officialGroup.trim(),
        suggestion_group_url: suggestionGroup.trim(),
        marketplace_rules: rules.filter(r => r.trim()),
        wtb_rules: wtbRules.filter(r => r.trim()),
        bot_welcome_message: welcomeMessage.trim(),
      })
      update({ 
        appName: res.data.app_name, 
        botUsername: res.data.bot_username,
        showLogo: res.data.show_logo !== false,
        announcementsUrl: res.data.announcements_url,
        vouchesUrl: res.data.vouches_url,
        officialGroupUrl: res.data.official_group_url,
        suggestionGroupUrl: res.data.suggestion_group_url,
        marketplaceRules: res.data.marketplace_rules || [],
        wtbRules: res.data.wtb_rules || [],
      })
      addToast('Branding saved', { type: 'success' })
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed to save', { type: 'error' })
    } finally { setSaving(false) }
  }

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/api/admin/branding/logo', form)
      const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
      const logoUrl = /^https?:\/\//i.test(res.data.logo_url)
        ? res.data.logo_url
        : (API_BASE ? `${API_BASE}${res.data.logo_url}` : res.data.logo_url)
      update({ logoUrl })
      addToast('Logo uploaded', { type: 'success' })
    } catch (e) {
      addToast(e.response?.data?.detail || 'Upload failed', { type: 'error' })
    } finally { setUploading(false) }
  }

  const deleteLogo = async () => {
    try {
      await api.post('/api/admin/branding/logo/delete')
      update({ logoUrl: null })
      addToast('Logo removed', { type: 'success' })
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed', { type: 'error' })
    }
  }

  const Section = ({ id, icon: Icon, title, color, children }) => {
    const isOpen = expandedSection === id
    return (
      <div className="card overflow-hidden">
        <button
          onClick={() => setExpandedSection(isOpen ? null : id)}
          className="w-full flex items-center justify-between p-3 hover:bg-dark-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon size={14} className={color} />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <ChevronDown size={14} className={`text-dark-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-3 border-t border-dark-700/50 pt-3">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Logo Section */}
      <Section id="logo" icon={Image} title="Logo & Identity" color="text-primary-400">
        <div className="flex items-center gap-3">
          <div className="relative">
            {logoUrl ? (
              <img src={logoUrl} className="w-12 h-12 rounded-xl object-cover ring-1 ring-dark-700" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <span className="text-lg font-bold">{name?.[0] || ''}</span>
              </div>
            )}
            <label className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center cursor-pointer hover:bg-primary-500">
              <Camera size={10} className="text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} disabled={uploading} />
            </label>
          </div>
          <div className="flex-1 space-y-1">
            <DeferredInput
              value={name}
              onChange={setName}
              maxLength={50}
              className="w-full bg-dark-700 text-dark-50 text-xs px-3 py-2 rounded-lg border border-dark-600 focus:border-primary-500 outline-none"
              placeholder="App Name"
            />
            {logoUrl && (
              <button onClick={deleteLogo} className="text-[10px] text-red-400 hover:text-red-300">
                Remove logo
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-dark-400">Show logo in header</span>
          <button
            onClick={() => setShowLogo(!showLogo)}
            className={`w-9 h-5 rounded-full transition-colors ${showLogo ? 'bg-primary-500' : 'bg-dark-600'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${showLogo ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </Section>

      {/* Bot Section */}
      <Section id="bot" icon={MessageCircle} title="Bot Settings" color="text-cyan-400">
        <div>
          <label className="text-[10px] text-dark-500 mb-1 block">Bot Username</label>
          <div className="flex items-center gap-1">
            <span className="text-dark-500 text-xs">@</span>
            <DeferredInput
              value={bot}
              onChange={setBot}
              maxLength={50}
              className="flex-1 bg-dark-700 text-dark-50 text-xs px-3 py-2 rounded-lg border border-dark-600 focus:border-primary-500 outline-none"
              placeholder="YourBotUsername"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[10px] text-dark-500 mb-1 block">Welcome Message (/start)</label>
          <textarea
            value={welcomeMessage}
            onChange={e => setWelcomeMessage(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full bg-dark-700 text-dark-50 text-xs px-3 py-2 rounded-lg border border-dark-600 focus:border-primary-500 outline-none resize-none"
            placeholder="👋 Welcome to {app}, {name}!"
          />
          <p className="text-[10px] text-dark-500 mt-0.5">Use {'{{name}}'} for user's name, {'{{app}}'} for app name. Supports Markdown.</p>
        </div>
      </Section>

      {/* Links Section */}
      <Section id="links" icon={Share2} title="Social Links" color="text-pink-400">
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-dark-500 mb-0.5 block">Announcements Channel</label>
            <DeferredInput
              value={announcements}
              onChange={setAnnouncements}
              maxLength={200}
              className="w-full bg-dark-700 text-dark-50 text-xs px-3 py-1.5 rounded-lg border border-dark-600 focus:border-primary-500 outline-none"
              placeholder="https://t.me/YourChannel"
            />
          </div>
          <div>
            <label className="text-[10px] text-dark-500 mb-0.5 block">Vouches Channel</label>
            <DeferredInput
              value={vouches}
              onChange={setVouches}
              maxLength={200}
              className="w-full bg-dark-700 text-dark-50 text-xs px-3 py-1.5 rounded-lg border border-dark-600 focus:border-primary-500 outline-none"
              placeholder="https://t.me/YourVouches"
            />
          </div>
          <div>
            <label className="text-[10px] text-dark-500 mb-0.5 block">Official Group</label>
            <DeferredInput
              value={officialGroup}
              onChange={setOfficialGroup}
              maxLength={200}
              className="w-full bg-dark-700 text-dark-50 text-xs px-3 py-1.5 rounded-lg border border-dark-600 focus:border-primary-500 outline-none"
              placeholder="https://t.me/YourGroup"
            />
          </div>
          <div>
            <label className="text-[10px] text-dark-500 mb-0.5 block">Suggestion Group</label>
            <DeferredInput
              value={suggestionGroup}
              onChange={setSuggestionGroup}
              maxLength={200}
              className="w-full bg-dark-700 text-dark-50 text-xs px-3 py-1.5 rounded-lg border border-dark-600 focus:border-primary-500 outline-none"
              placeholder="https://t.me/YourSuggestions"
            />
          </div>
        </div>
      </Section>

      {/* Marketplace Rules Section */}
      <Section id="rules" icon={Shield} title="Marketplace Rules" color="text-amber-400">
        <p className="text-[10px] text-dark-500 mb-2">Shown on Home page and in bot /start message. Drag to reorder.</p>
        <RulesEditor rules={rules} setRules={setRules} label="Rule" />
      </Section>

      {/* WTB Rules Section */}
      <Section id="wtb-rules" icon={ShoppingBag} title="WTB Rules" color="text-cyan-400">
        <p className="text-[10px] text-dark-500 mb-2">Shown on the Want-to-Buy page. Collapsible rules banner for buyers.</p>
        <RulesEditor rules={wtbRules} setRules={setWtbRules} label="WTB Rule" />
      </Section>

      {/* Save Button */}
      <button
        onClick={saveBranding}
        disabled={saving}
        className="w-full bg-primary-600 hover:bg-primary-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
      >
        {saving ? 'Saving...' : 'Save All Changes'}
      </button>
    </div>
  )
}

// ======================== REFERRAL TAB ========================
function ReferralTab() {
  const [refPercent, setRefPercent] = useState(5)
  const [refDepositBonus, setRefDepositBonus] = useState(10)
  const [refEnabled, setRefEnabled] = useState(true)
  const [refSaving, setRefSaving] = useState(false)
  const { addToast } = useToast()
  const [stats, setStats] = useState({ total_referrals: 0, total_earnings: 0 })

  useEffect(() => {
    api.get('/api/referrals/admin/stats').then(r => {
      if (r.data.config) {
        setRefPercent(r.data.config.referral_percent || 5)
        setRefDepositBonus(r.data.config.first_deposit_bonus_percent || 10)
        setRefEnabled(r.data.config.enabled !== false)
      }
      setStats({
        total_referrals: r.data.total_referrals || 0,
        total_earnings: r.data.total_earnings || 0
      })
    }).catch(() => {})
  }, [])

  const saveSettings = async () => {
    setRefSaving(true)
    try {
      await api.put('/api/referrals/admin/settings', {
        referral_percent: refPercent,
        first_deposit_bonus_percent: refDepositBonus,
        enabled: refEnabled
      })
      addToast('Referral settings saved', { type: 'success' })
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed to save', { type: 'error' })
    } finally { setRefSaving(false) }
  }

  const toggleEnabled = async () => {
    setRefSaving(true)
    try {
      await api.put('/api/referrals/admin/settings', { enabled: !refEnabled })
      setRefEnabled(!refEnabled)
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed', { type: 'error' })
    } finally { setRefSaving(false) }
  }

  return (
    <div className="space-y-2">
      {/* Stats Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1.5">
          <div className="bg-pink-500/10 rounded-lg px-3 py-1.5 text-center flex-1">
            <p className="text-xs font-bold text-pink-400">{stats.total_referrals}</p>
            <p className="text-[9px] text-dark-500">referrals</p>
          </div>
          <div className="bg-emerald-500/10 rounded-lg px-3 py-1.5 text-center flex-1">
            <p className="text-xs font-bold text-emerald-400">${stats.total_earnings.toFixed(2)}</p>
            <p className="text-[9px] text-dark-500">earned</p>
          </div>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={refSaving}
          className={`px-3 py-2 rounded-lg text-[10px] font-medium transition-colors ${
            refEnabled 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-dark-700 text-dark-400'
          }`}
        >
          {refEnabled ? 'Active' : 'Off'}
        </button>
      </div>

      {/* Settings Card */}
      <div className="card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Gift size={14} className="text-pink-400" />
          <span className="text-sm font-medium">Settings</span>
        </div>

        {/* Commission % */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">Commission Rate</p>
            <p className="text-[10px] text-dark-500">From all purchases</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={refPercent}
              onChange={e => setRefPercent(parseFloat(e.target.value) || 0)}
              min={0}
              max={100}
              step={0.5}
              className="w-16 bg-dark-700 text-dark-50 text-xs px-2 py-1.5 rounded-lg border border-dark-600 focus:border-pink-500 outline-none text-center"
            />
            <span className="text-xs text-dark-400">%</span>
          </div>
        </div>

        {/* First Deposit Bonus */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">First Deposit Bonus</p>
            <p className="text-[10px] text-dark-500">One-time for new users</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={refDepositBonus}
              onChange={e => setRefDepositBonus(parseFloat(e.target.value) || 0)}
              min={0}
              max={100}
              step={1}
              className="w-16 bg-dark-700 text-dark-50 text-xs px-2 py-1.5 rounded-lg border border-dark-600 focus:border-pink-500 outline-none text-center"
            />
            <span className="text-xs text-dark-400">%</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-dark-800/50 rounded-lg p-2.5 border border-dark-700/50">
        <p className="text-[10px] text-dark-400 leading-relaxed">
          <span className="text-pink-400">How it works:</span> Referrers earn {refPercent}% commission from every purchase their referred users make. 
          New users get a {refDepositBonus}% bonus on their first deposit.
        </p>
      </div>

      {/* Save Button */}
      <button
        onClick={saveSettings}
        disabled={refSaving}
        className="w-full bg-pink-600 hover:bg-pink-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
      >
        {refSaving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}

// ======================== SYSTEM TAB ========================
function SystemTab() {
  const { update } = useBrandingStore()
  const [nukeStep, setNukeStep] = useState(0)
  const [nukeText, setNukeText] = useState('')
  const [nuking, setNuking] = useState(false)
  const [maintenance, setMaintenance] = useState(false)
  const [hideAdminActivity, setHideAdminActivity] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/branding').then(r => {
      setMaintenance(r.data.maintenance_mode)
      setHideAdminActivity(r.data.hide_admin_activity || false)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const toggleMaintenance = async () => {
    try {
      const res = await api.post(`/api/admin/system/maintenance?enabled=${!maintenance}`)
      setMaintenance(res.data.maintenance_mode)
      update({ maintenanceMode: res.data.maintenance_mode })
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed')
    }
  }

  const toggleHideAdminActivity = async () => {
    try {
      const res = await api.put('/api/admin/branding', { hide_admin_activity: !hideAdminActivity })
      setHideAdminActivity(res.data.hide_admin_activity || false)
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed')
    }
  }

  const executeNuke = async () => {
    if (nukeText !== 'DELETE EVERYTHING') return
    setNuking(true)
    try {
      await api.post('/api/admin/system/nuke', { confirm_text: nukeText })
      alert('All data has been permanently deleted. The page will reload.')
      localStorage.clear()
      window.location.reload()
    } catch (e) {
      alert(e.response?.data?.detail || 'Nuke failed')
    } finally { setNuking(false) }
  }

  if (loading) {
    return <div className="card p-6 text-center"><RefreshCw size={20} className="animate-spin mx-auto text-dark-500" /></div>
  }

  return (
    <div className="space-y-2">
      {/* Maintenance Card */}
      <div className="card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-orange-400" />
            <div>
              <p className="text-sm font-medium">Maintenance Mode</p>
              <p className="text-[10px] text-dark-500">Block non-admin access</p>
            </div>
          </div>
          <button
            onClick={toggleMaintenance}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
              maintenance
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
            }`}
          >
            {maintenance ? '🔶 ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Hide Admin Activity */}
      <div className="card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EyeOff size={14} className="text-violet-400" />
            <div>
              <p className="text-sm font-medium">Hide Admin Online Status</p>
              <p className="text-[10px] text-dark-500">Hide admin names from public activity on Home page</p>
            </div>
          </div>
          <button
            onClick={toggleHideAdminActivity}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
              hideAdminActivity
                ? 'bg-violet-500/20 text-violet-400'
                : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
            }`}
          >
            {hideAdminActivity ? '👻 Hidden' : 'Visible'}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card p-3 border border-red-500/20">
        <div className="flex items-center gap-2 mb-2">
          <Skull size={14} className="text-red-400" />
          <span className="text-sm font-medium text-red-400">Danger Zone</span>
        </div>

        {nukeStep === 0 && (
          <button
            onClick={() => setNukeStep(1)}
            className="w-full py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors text-xs"
          >
            Wipe All Data & Reset Database
          </button>
        )}

        {nukeStep === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-400">Are you sure?</p>
                <p className="text-[10px] text-dark-400 mt-0.5">
                  This permanently deletes ALL data. <strong className="text-red-400">Cannot be undone.</strong>
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setNukeStep(0)}
                className="flex-1 py-1.5 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 text-[10px] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setNukeStep(2)}
                className="flex-1 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-[10px] font-semibold transition-colors"
              >
                Proceed
              </button>
            </div>
          </motion.div>
        )}

        {nukeStep === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 rounded-lg p-3 space-y-2"
          >
            <p className="text-[10px] text-dark-400">
              Type <span className="text-red-400 font-mono font-bold">DELETE EVERYTHING</span>:
            </p>
            <input
              value={nukeText}
              onChange={e => setNukeText(e.target.value)}
              className="w-full bg-dark-900 text-red-400 text-xs px-3 py-2 rounded-lg border border-red-500/30 focus:border-red-500 outline-none font-mono"
              placeholder="DELETE EVERYTHING"
              autoFocus
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => { setNukeStep(0); setNukeText('') }}
                className="flex-1 py-1.5 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 text-[10px] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeNuke}
                disabled={nukeText !== 'DELETE EVERYTHING' || nuking}
                className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold transition-colors disabled:opacity-30"
              >
                {nuking ? '...' : '☠️ NUKE'}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* System Info */}
      <div className="bg-dark-800/50 rounded-lg p-2.5 border border-dark-700/50">
        <p className="text-[10px] text-dark-500 text-center">
          {useBrandingStore.getState().appName} v1.0
        </p>
      </div>
    </div>
  )
}

// ======================== SUPPORT TAB ========================
function SupportTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [supportIdentity, setSupportIdentity] = useState({
    support_user_id: null,
    avatar_url: null,
    display_name: 'Support',
  })
  const [supportName, setSupportName] = useState('')
  const [savingSupport, setSavingSupport] = useState(false)
  const [uploadingSupportAvatar, setUploadingSupportAvatar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)

  const resolveUrl = (u) => {
    if (!u) return null
    if (/^https?:\/\//i.test(u)) return u
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
    return base ? `${base}${u}` : u
  }

  const loadSupportIdentity = async () => {
    try {
      const r = await api.get('/api/dm/support-user')
      setSupportIdentity(r.data || { support_user_id: null, avatar_url: null, display_name: 'Support' })
      setSupportName((r.data?.display_name || 'Support') ?? 'Support')
    } catch {}
  }

  const fetchConversations = async () => {
    try {
      const r = await api.get('/api/dm/admin/conversations')
      setConversations(r.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    loadSupportIdentity()
    fetchConversations()
    const iv = setInterval(fetchConversations, 8000)

    // Auto-open DM with specific user if dm_user_id param present
    const dmUserId = searchParams.get('dm_user_id')
    if (dmUserId) {
      const parsed = parseInt(dmUserId)
      if (!isNaN(parsed) && parsed > 0) {
        ;(async () => {
          try {
            const { data } = await api.post('/api/dm/admin/start', {
              user_id: parsed,
            })
            if (data.conversation_id) {
              // Refresh conversations then auto-select
              const r = await api.get('/api/dm/admin/conversations')
              setConversations(r.data || [])
              const conv = (r.data || []).find(c => c.id === data.conversation_id)
              if (conv) openConversation(conv)
            }
          } catch {}
          // Clean the param from URL
          setSearchParams(prev => { prev.delete('dm_user_id'); return prev }, { replace: true })
        })()
      }
    }

    return () => clearInterval(iv)
  }, [])

  const saveSupportName = async () => {
    if (savingSupport) return
    setSavingSupport(true)
    try {
      await api.put('/api/admin/branding', { support_display_name: supportName.trim() })
      await loadSupportIdentity()
      setShowSettings(false)
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSavingSupport(false)
    }
  }

  const uploadSupportAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !supportIdentity?.support_user_id) return
    setUploadingSupportAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/api/admin/users/${supportIdentity.support_user_id}/avatar`, form)
      await loadSupportIdentity()
    } catch (e) {
      alert(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploadingSupportAvatar(false)
      e.target.value = ''
    }
  }

  const openConversation = async (conv) => {
    setSelected(conv)
    setMsgLoading(true)
    try {
      const r = await api.get(`/api/dm/admin/conversations/${conv.id}`)
      setMessages(r.data.messages || [])
      if (r.data.other_user) setSelected(prev => ({ ...prev, other_user: r.data.other_user }))
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    } catch {}
    setMsgLoading(false)
  }

  useEffect(() => {
    if (!selected) return
    const poll = async () => {
      try {
        const r = await api.get(`/api/dm/admin/conversations/${selected.id}`)
        setMessages(r.data.messages || [])
      } catch {}
    }
    pollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pollRef.current)
  }, [selected?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!newMsg.trim() || sending) return
    setSending(true)
    try {
      await api.post(`/api/dm/admin/conversations/${selected.id}/messages`, { content: newMsg.trim() })
      setNewMsg('')
      const r = await api.get(`/api/dm/admin/conversations/${selected.id}`)
      setMessages(r.data.messages || [])
    } catch {}
    setSending(false)
  }

  // Stats
  const totalConversations = conversations.length
  const unreadConversations = conversations.filter(c => c.unread_count > 0).length
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  // Filtered conversations
  const filteredConversations = search.trim()
    ? conversations.filter(c => 
        (c.other_user?.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.last_message || '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations

  // Chat view (compact)
  if (selected) {
    const otherUser = selected.other_user || {}
    return (
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2 p-2 bg-dark-800/50 rounded-xl border border-dark-700/50">
          <button onClick={() => { setSelected(null); clearInterval(pollRef.current) }}
            className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-400 hover:text-dark-50 transition-all">
            <ArrowLeft size={14} />
          </button>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center overflow-hidden">
            {otherUser.avatar_url ? (
              <img src={resolveUrl(otherUser.avatar_url)} className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={12} className="text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{otherUser.username || `User #${otherUser.id}`}</p>
          </div>
          <span className="text-[9px] text-dark-500">{messages.length} msgs</span>
        </div>

        {/* Messages */}
        <div className="card p-2 h-[55vh] flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {msgLoading ? (
              <div className="flex justify-center py-10">
                <RefreshCw size={16} className="text-dark-400 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-dark-500 text-[11px] py-10">No messages yet</p>
            ) : messages.map(m => {
              const isSupport = m.sender_id !== otherUser.id
              return (
                <div key={m.id} className={`flex ${isSupport ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-2.5 py-1.5 rounded-xl text-[12px] ${
                    isSupport
                      ? 'bg-cyan-600/20 text-cyan-100 rounded-br-sm'
                      : 'bg-dark-700 text-dark-200 rounded-bl-sm'
                  }`}>
                    <p className="break-words whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    <p className={`text-[8px] mt-0.5 ${isSupport ? 'text-cyan-400/50' : 'text-dark-500'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-1.5 mt-2 pt-2 border-t border-dark-700/50">
            <input
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Reply..."
              className="flex-1 bg-dark-700 text-dark-50 text-xs px-3 py-2 rounded-lg border border-dark-600 focus:border-cyan-500 outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !newMsg.trim()}
              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg transition-all"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Conversation list view (compact)
  return (
    <div className="space-y-2">
      {/* Stats Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1.5">
          <div className="bg-cyan-500/10 rounded-lg px-3 py-1.5 text-center">
            <p className="text-xs font-bold text-cyan-400">{totalConversations}</p>
            <p className="text-[9px] text-dark-500">chats</p>
          </div>
          {unreadConversations > 0 && (
            <div className="bg-red-500/10 rounded-lg px-3 py-1.5 text-center">
              <p className="text-xs font-bold text-red-400">{totalUnread}</p>
              <p className="text-[9px] text-dark-500">unread</p>
            </div>
          )}
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-cyan-500/20 text-cyan-400' : 'bg-dark-800 text-dark-400 hover:bg-dark-700'}`}>
          <Settings size={14} />
        </button>
        <button onClick={fetchConversations} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} className={`text-dark-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Settings Panel (collapsible) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-3 space-y-2">
              <p className="text-[10px] text-dark-400 font-medium">Support Identity</p>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 overflow-hidden flex items-center justify-center">
                    {supportIdentity?.avatar_url ? (
                      <img src={resolveUrl(supportIdentity.avatar_url)} className="w-full h-full object-cover" />
                    ) : (
                      <Headphones size={18} className="text-cyan-400" />
                    )}
                  </div>
                  <label className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-600 flex items-center justify-center cursor-pointer hover:bg-cyan-500">
                    <Camera size={10} className="text-white" />
                    <input type="file" accept="image/*" onChange={uploadSupportAvatar} className="hidden" disabled={uploadingSupportAvatar} />
                  </label>
                </div>
                <div className="flex-1">
                  <input
                    value={supportName}
                    onChange={e => setSupportName(e.target.value)}
                    maxLength={50}
                    className="w-full bg-dark-700 text-dark-50 text-xs px-3 py-2 rounded-lg border border-dark-600 focus:border-cyan-500 outline-none"
                    placeholder="Support"
                  />
                </div>
                <button
                  onClick={saveSupportName}
                  disabled={savingSupport}
                  className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-medium disabled:opacity-50"
                >
                  {savingSupport ? '...' : 'Save'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-dark-800 text-dark-50 text-xs pl-9 pr-3 py-2 rounded-lg border border-dark-700 focus:border-cyan-500/50 outline-none"
        />
      </div>

      {/* Conversations List */}
      {loading ? (
        <div className="card p-6 text-center">
          <RefreshCw size={20} className="text-dark-500 animate-spin mx-auto" />
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="card p-6 text-center">
          <Headphones size={24} className="text-dark-600 mx-auto mb-2" />
          <p className="text-dark-500 text-sm">
            {search ? 'No matches found' : 'No support conversations'}
          </p>
          {!search && <p className="text-dark-600 text-[10px] mt-1">Users start chats from Messages page</p>}
        </div>
      ) : (
        <div className="space-y-1">
          {filteredConversations.map((conv, i) => {
            const other = conv.other_user || {}
            const hasUnread = conv.unread_count > 0
            return (
              <motion.button
                key={conv.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => openConversation(conv)}
                className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                  hasUnread 
                    ? 'bg-cyan-500/5 border-cyan-500/20 hover:bg-cyan-500/10' 
                    : 'bg-dark-800/50 border-dark-700/50 hover:bg-dark-800'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {other.avatar_url ? (
                    <img src={resolveUrl(other.avatar_url)} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={14} className="text-cyan-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-medium truncate ${hasUnread ? 'text-dark-50' : 'text-dark-200'}`}>
                      {other.username || 'Unknown'}
                    </span>
                    {hasUnread && (
                      <span className="px-1.5 py-0.5 bg-cyan-500 text-white text-[9px] font-bold rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className={`text-[10px] truncate mt-0.5 ${hasUnread ? 'text-dark-300' : 'text-dark-500'}`}>
                      {conv.last_message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {conv.last_message_at && (
                    <span className="text-[9px] text-dark-500">
                      {new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <ChevronRight size={12} className="text-dark-600" />
                </div>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ======================== MAIN COMPONENT ========================
export default function AdminHome() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(urlTab || null)
  const navigate = useNavigate()

  // Sync URL tab param → state
  useEffect(() => {
    setActiveTab(urlTab || null)
  }, [urlTab])

  const openTab = (key) => {
    setActiveTab(key)
    setSearchParams({ tab: key })
  }

  const goBack = () => {
    setActiveTab(null)
    setSearchParams({})
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'orders': return <OrdersTab />
      case 'deposits': return <DepositsTab />
      case 'withdrawals': return <WithdrawalsTab />
      case 'disputes': return <DisputesTab />
      case 'escrow': return <EscrowTab />
      case 'users': return <UsersTab />
      case 'sellers': return <SellersTab />
      case 'blacklist': return <BlacklistTab />
      case 'categories': return <CategoriesTab />
      case 'banners': return <BannersTab />
      case 'giveaways': return <GiveawaysTab />
      case 'wtb': return <WtbTab />
      case 'support': return <SupportTab />
      case 'broadcast': return <BroadcastTab />
      case 'branding': return <BrandingTab />
      case 'referral': return <ReferralTab />
      case 'system': return <SystemTab />
      case 'stats': return <OverviewTab />
      default: return null
    }
  }

  const activeTabData = TABS.find(t => t.key === activeTab) ||
    (activeTab === 'stats' ? { key: 'stats', label: 'Stats', icon: BarChart3, color: 'text-primary-400', bg: 'bg-primary-500/10' } : null)

  // Grid menu view (with dashboard)
  if (!activeTab) {
    return (
      <div className="space-y-4">
        {/* Dashboard Overview */}
        <OverviewTab compact />

        {/* Management Sections */}
        {TAB_SECTIONS.map(section => {
          const sectionTabs = TABS.filter(t => t.section === section.key)
          if (sectionTabs.length === 0) return null
          return (
            <div key={section.key}>
              <h3 className="text-xs font-semibold text-dark-500 uppercase tracking-wider mb-2 px-0.5">{section.label}</h3>
              <div className="grid grid-cols-4 gap-2">
                {sectionTabs.map(tab => {
                  const Icon = tab.icon
                  return (
                    <motion.button
                      key={tab.key}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => openTab(tab.key)}
                      className="bg-dark-800/60 hover:bg-dark-800 rounded-xl py-3 px-2 flex flex-col items-center gap-1.5 transition-all"
                    >
                      <div className={`w-9 h-9 rounded-lg ${tab.bg} flex items-center justify-center`}>
                        <Icon size={17} className={tab.color} />
                      </div>
                      <span className="text-[11px] font-medium text-dark-300">{tab.label}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Tab detail view
  return (
    <div className="space-y-3">
      {/* Back Header */}
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={goBack}
          className="w-9 h-9 rounded-xl bg-dark-800 flex items-center justify-center text-dark-300 hover:text-dark-50 transition-colors"
        >
          <ChevronLeft size={18} />
        </motion.button>
        <div className="flex items-center gap-2">
          {activeTabData && <activeTabData.icon size={16} className={activeTabData.color} />}
          <h2 className="font-display text-lg font-bold">{activeTabData?.label}</h2>
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
        >
          {renderTab()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
