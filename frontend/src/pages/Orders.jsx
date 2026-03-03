import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Package, Clock, Check, X, AlertTriangle, ChevronRight, Shield, Search, MessageCircle, Star, ChevronDown } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

const statusConfig = {
  pending: { color: 'bg-yellow-500/20 text-yellow-400', icon: Clock, label: 'Pending' },
  paid: { color: 'bg-blue-500/20 text-blue-400', icon: Check, label: 'Paid' },
  delivered: { color: 'bg-emerald-500/20 text-emerald-400', icon: Check, label: 'Delivered' },
  completed: { color: 'bg-green-500/20 text-green-400', icon: Check, label: 'Completed' },
  disputed: { color: 'bg-red-500/20 text-red-400', icon: AlertTriangle, label: 'Under Review' },
  cancelled: { color: 'bg-dark-700 text-dark-300', icon: X, label: 'Cancelled' },
  refunded: { color: 'bg-orange-500/20 text-orange-400', icon: Shield, label: 'Refunded' },
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'disputed', label: 'Under Review' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled', label: 'Cancelled' },
]

// ============ VIEW TABS ============
function ViewTabs({ view, setView, effectiveRole }) {
  // Seller and admin get a single dedicated view, no tabs needed
  if (effectiveRole === 'seller' || effectiveRole === 'admin') return null

  // Buyer view: Purchases + Disputes
  const tabs = [
    { key: 'purchases', label: 'My Purchases' },
    { key: 'disputes', label: 'Disputes' },
  ]
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => setView(tab.key)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
            view === tab.key
              ? 'bg-primary-500/15 text-primary-300 ring-1 ring-primary-500/30'
              : 'bg-dark-800/60 text-dark-400 hover:text-dark-50 hover:bg-dark-800'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ============ FILTER BAR ============
const BUYER_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'price_high', label: 'Price: High → Low' },
  { value: 'price_low', label: 'Price: Low → High' },
]

function FilterBar({ statusFilter, setStatusFilter, searchTerm, setSearchTerm, showSearch, sortBy, setSortBy, showSort }) {
  return (
    <div className="card p-2.5">
      <div className={`grid ${showSearch ? 'grid-cols-2' : showSort ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input py-1.5 text-xs appearance-none pr-8">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
        </div>
        {showSort && setSortBy && (
          <div className="relative">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input py-1.5 text-xs appearance-none pr-8">
              {BUYER_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
          </div>
        )}
        {showSearch && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="input py-1.5 text-xs pl-7"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ============ BUYER ORDER CARD ============
function BuyerOrderCard({ order, index, onClick }) {
  const sc = statusConfig[order.status] || statusConfig.pending
  const Icon = sc.icon
  const showTimer = order.status === 'delivered' && order.auto_complete_at
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="card p-3 cursor-pointer hover:bg-dark-800/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-dark-800 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon size={16} className={sc.color.split(' ')[1]} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Order #{order.id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
          </div>
          <p className="text-[11px] text-dark-400">
            {new Date(order.created_at).toLocaleDateString()} · {order.items?.length || 0} items
          </p>
          {showTimer && (
            <p className="text-[10px] text-amber-400 mt-0.5">⏱ Auto-completes {new Date(order.auto_complete_at).toLocaleString()}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-bold text-sm">${order.total_amount?.toFixed(2)}</span>
          <ChevronRight size={14} className="text-dark-500" />
        </div>
      </div>
    </motion.div>
  )
}

// ============ SELLER ORDER CARD ============
function SellerOrderCard({ order, index, onClick }) {
  const sc = statusConfig[order.status] || statusConfig.pending
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onClick}
      className="card p-3 cursor-pointer hover:bg-dark-800/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold">Order #{order.order_id}</p>
            {order.has_dispute && <AlertTriangle size={12} className="text-red-400" />}
          </div>
          <p className="text-[11px] text-dark-400">{order.buyer_username ? `@${order.buyer_username}` : order.buyer_first_name || 'Buyer'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
          <MessageCircle size={12} className="text-dark-500" />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0">
          <Package size={14} className="text-dark-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{order.product_name || `Product #${order.product_id}`}</p>
          <p className="text-[11px] text-dark-500">Qty {order.quantity} × ${order.price?.toFixed(2)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-bold">${order.total?.toFixed(2)}</p>
          <p className="text-[10px] text-dark-500">{order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}</p>
        </div>
      </div>
      {order.auto_complete_at && order.status === 'delivered' && (
        <p className="text-[10px] text-amber-400 mt-1.5">⏱ Auto-completes {new Date(order.auto_complete_at).toLocaleString()}</p>
      )}
      {order.review && (
        <div className="mt-2 pt-2 border-t border-dark-800/50">
          <div className="flex items-center gap-1">
            {[1,2,3,4,5].map(s => (
              <Star key={s} size={11} className={s <= order.review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-dark-600'} />
            ))}
            <span className="text-[10px] text-dark-400 ml-1">by @{order.review.reviewer_username || 'buyer'}</span>
          </div>
          {order.review.comment && <p className="text-[10px] text-dark-400 mt-0.5 truncate">{order.review.comment}</p>}
        </div>
      )}
    </motion.div>
  )
}

// ============ ADMIN ORDER CARD ============
function AdminOrderCard({ order, index, onClick }) {
  const sc = statusConfig[order.status] || statusConfig.pending
  const Icon = sc.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onClick}
      className="card p-3 cursor-pointer hover:bg-dark-800/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">Order #{order.id}</p>
            {order.has_dispute && <AlertTriangle size={12} className="text-red-400" />}
          </div>
          <p className="text-[11px] text-dark-400">
            Buyer: {order.buyer_username ? `@${order.buyer_username}` : order.buyer_first_name || `#${order.buyer_id}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
        </div>
      </div>

      {/* Items summary */}
      <div className="space-y-1">
        {order.items?.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0">
              <Package size={12} className="text-dark-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{item.product_name || `Product #${item.product_id}`}</p>
              <p className="text-[10px] text-dark-500">
                {item.seller_shop || `Seller #${item.seller_id}`} · Qty {item.quantity} × ${item.price?.toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-800/50">
        <p className="text-[10px] text-dark-500">{new Date(order.created_at).toLocaleDateString()}</p>
        <p className="text-xs font-bold">${order.total_amount?.toFixed(2)}</p>
      </div>
      {order.auto_complete_at && order.status === 'delivered' && (
        <p className="text-[10px] text-amber-400 mt-1">⏱ Auto-completes {new Date(order.auto_complete_at).toLocaleString()}</p>
      )}
    </motion.div>
  )
}

// ============ MAIN COMPONENT ============
export default function Orders() {
  const navigate = useNavigate()
  const { user, haptic, getEffectiveRole } = useAuthStore()

  const isSeller = !!user?.shop_name
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'admin'
  const effectiveRole = getEffectiveRole()

  // Default view based on effective role
  const defaultView = effectiveRole === 'seller' ? 'sales' : effectiveRole === 'admin' ? 'all' : 'purchases'
  const [view, setView] = useState(defaultView)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  // Data
  const [buyerOrders, setBuyerOrders] = useState([])
  const [sellerOrders, setSellerOrders] = useState([])
  const [adminOrders, setAdminOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrders()
  }, [view])

  const loadOrders = async () => {
    setLoading(true)
    try {
      if (view === 'purchases' || view === 'disputes') {
        const { data } = await api.get('/api/orders')
        setBuyerOrders(data)
      } else if (view === 'sales') {
        const { data } = await api.get('/api/orders/seller')
        setSellerOrders(data)
      } else if (view === 'all') {
        const { data } = await api.get('/api/admin/orders')
        setAdminOrders(data)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // Sort helper for buyer orders
  const sortOrders = (orders) => {
    return [...orders].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.created_at) - new Date(b.created_at)
        case 'price_high': return (b.total_amount || 0) - (a.total_amount || 0)
        case 'price_low': return (a.total_amount || 0) - (b.total_amount || 0)
        case 'newest':
        default: return new Date(b.created_at) - new Date(a.created_at)
      }
    })
  }

  // Filtered data
  const filteredBuyer = sortOrders(buyerOrders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    return true
  }))

  const filteredDisputes = sortOrders(buyerOrders.filter(o => o.status === 'disputed'))

  const filteredSeller = sellerOrders.filter(o => {
    if (statusFilter !== 'all' && String(o.status) !== statusFilter) return false
    if (searchTerm.trim()) {
      const needle = searchTerm.toLowerCase()
      const hay = [o.product_name, o.buyer_username, o.buyer_first_name, String(o.order_id)].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  const filteredAdmin = adminOrders.filter(o => {
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

  // Loading skeleton
  const Skeleton = () => (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card animate-pulse p-4">
          <div className="h-5 bg-dark-800 rounded w-1/3 mb-2" />
          <div className="h-4 bg-dark-800 rounded w-1/2" />
        </div>
      ))}
    </div>
  )

  const Empty = ({ text }) => (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <Package size={28} className="text-dark-500" />
      </div>
      <h2 className="font-display text-lg font-bold mb-1">No orders</h2>
      <p className="text-dark-400 text-sm">{text}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">
        {effectiveRole === 'seller' ? 'Sales' : effectiveRole === 'admin' ? 'All Orders' : 'Orders'}
      </h1>

      <ViewTabs view={view} setView={setView} effectiveRole={effectiveRole} />

      {(view === 'purchases' || view === 'disputes') && (
        <FilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchTerm=""
          setSearchTerm={() => {}}
          showSearch={false}
          sortBy={sortBy}
          setSortBy={setSortBy}
          showSort={view === 'purchases'}
        />
      )}

      {view !== 'purchases' && view !== 'disputes' && (
        <FilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          showSearch={true}
        />
      )}

      {loading ? <Skeleton /> : (
        <>
          {/* Buyer view */}
          {view === 'purchases' && (
            filteredBuyer.length === 0 ? <Empty text="Your purchase history will appear here" /> : (
              <div className="space-y-2">
                {filteredBuyer.map((order, i) => (
                  <BuyerOrderCard key={order.id} order={order} index={i} onClick={() => navigate(`/orders/${order.id}`)} />
                ))}
              </div>
            )
          )}

          {/* Disputes view */}
          {view === 'disputes' && (
            filteredDisputes.length === 0 ? <Empty text="No open disputes" /> : (
              <div className="space-y-2">
                {filteredDisputes.map((order, i) => (
                  <BuyerOrderCard key={order.id} order={order} index={i} onClick={() => navigate(`/orders/${order.id}`)} />
                ))}
              </div>
            )
          )}

          {/* Seller view */}
          {view === 'sales' && (
            filteredSeller.length === 0 ? <Empty text="Orders for your products will appear here" /> : (
              <div className="space-y-2">
                {filteredSeller.map((order, i) => (
                  <SellerOrderCard key={`${order.order_id}-${order.product_id}`} order={order} index={i} onClick={() => navigate(`/orders/${order.order_id}`)} />
                ))}
              </div>
            )
          )}

          {/* Admin view */}
          {view === 'all' && (
            filteredAdmin.length === 0 ? <Empty text="No orders found" /> : (
              <div className="space-y-2">
                {filteredAdmin.map((order, i) => (
                  <AdminOrderCard key={order.id} order={order} index={i} onClick={() => navigate(`/orders/${order.id}`)} />
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
