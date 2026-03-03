import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShoppingCart, Package, Truck, Clock } from 'lucide-react'
import api from '../../lib/api'

const statusClass = (status) => {
  const value = String(status || '').toLowerCase()
  if (value === 'paid') return 'bg-yellow-500/15 text-yellow-400'
  if (value === 'delivered') return 'bg-emerald-500/15 text-emerald-400'
  if (value === 'pending') return 'bg-blue-500/15 text-blue-400'
  if (value === 'cancelled') return 'bg-red-500/15 text-red-400'
  if (value === 'refunded') return 'bg-purple-500/15 text-purple-400'
  if (value === 'disputed') return 'bg-orange-500/15 text-orange-400'
  return 'bg-dark-800 text-dark-300'
}

export default function SellerOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/api/orders/seller')
        setOrders(data)
      } catch {
        setOrders([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Quick wins
  const toDeliver = orders.filter(o => o.status === 'paid')
  const pendingOrders = orders.filter(o => o.status === 'pending')

  const filteredOrders = orders.filter((order) => {
    const statusMatch = statusFilter === 'all' || String(order.status) === statusFilter
    const needle = searchTerm.trim().toLowerCase()
    if (!needle) return statusMatch
    const haystack = [
      order.product_name,
      order.buyer_username,
      order.buyer_first_name,
      String(order.order_id || '')
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return statusMatch && haystack.includes(needle)
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Orders</h1>
          <p className="text-xs text-dark-400">{orders.length} orders</p>
        </div>
      </div>

      {/* Quick Alerts */}
      {(toDeliver.length > 0 || pendingOrders.length > 0) && (
        <div className="flex gap-2">
          {toDeliver.length > 0 && (
            <button
              onClick={() => setStatusFilter('paid')}
              className="flex-1 bg-yellow-500/10 rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-yellow-500/15 transition-colors"
            >
              <Truck size={14} className="text-yellow-400" />
              <div>
                <span className="text-sm font-bold text-yellow-400">{toDeliver.length}</span>
                <p className="text-[9px] text-dark-400">To Deliver</p>
              </div>
            </button>
          )}
          {pendingOrders.length > 0 && (
            <button
              onClick={() => setStatusFilter('pending')}
              className="flex-1 bg-dark-800/50 rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-dark-800 transition-colors"
            >
              <Clock size={14} className="text-dark-400" />
              <div>
                <span className="text-sm font-bold text-dark-300">{pendingOrders.length}</span>
                <p className="text-[9px] text-dark-400">Pending</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input text-sm py-1.5 flex-1"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
          className="input text-sm py-1.5 flex-1"
        />
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-3 animate-pulse">
              <div className="h-4 bg-dark-800 rounded w-1/3 mb-1" />
              <div className="h-3 bg-dark-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card text-center py-8">
          <ShoppingCart size={32} className="mx-auto mb-3 text-dark-600" />
          <h3 className="font-semibold mb-1">No orders found</h3>
          <p className="text-dark-400 text-sm">Try changing your filters</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredOrders.map((order, i) => (
            <motion.div
              key={`${order.order_id}-${order.product_id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card px-3 py-2.5 flex items-center gap-3"
            >
              {/* Order Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">#{order.order_id}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusClass(order.status)}`}>
                    {order.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  <span className="text-dark-300 truncate">{order.product_name}</span>
                  <span className="text-dark-500">x{order.quantity}</span>
                </div>
              </div>

              {/* Price & Buyer */}
              <div className="text-right">
                <p className="text-sm font-semibold text-primary-400">${order.total.toFixed(2)}</p>
                <p className="text-[10px] text-dark-500">
                  {order.buyer_username ? `@${order.buyer_username}` : order.buyer_first_name || 'Buyer'}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
