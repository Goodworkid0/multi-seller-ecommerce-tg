import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, Edit2, Trash2, X, Gavel, Clock, 
  DollarSign, Check, AlertCircle, Eye, EyeOff, Timer, Upload
} from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

const DURATION_OPTIONS = [
  { value: 1, label: '1 Day after last bid' },
  { value: 2, label: '2 Days after last bid' },
  { value: 3, label: '3 Days after last bid' },
  { value: 5, label: '5 Days after last bid' },
  { value: 7, label: '7 Days after last bid' },
]

function formatTimeLeft(endDate) {
  if (!endDate) return 'Not started'
  const now = new Date()
  const end = new Date(endDate)
  const diff = end - now
  
  if (diff <= 0) return 'Ended'
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  
  if (days > 0) return `${days}d ${hours}h left`
  return `${hours}h left`
}

export default function SellerAuctions() {
  const { tgConfirm } = useAuthStore()
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAuction, setEditingAuction] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    start_price: '',
    blitz_price: '1',
    buyout_price: '',
    duration_days: 2,
    image_url: ''
  })
  const [status, setStatus] = useState({ status: 'idle', message: '' })

  useEffect(() => {
    loadAuctions()
  }, [])

  const loadAuctions = async () => {
    try {
      const { data } = await api.get('/api/auctions/my')
      setAuctions(data)
    } catch (e) {
      console.error(e)
      setAuctions([])
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingAuction(null)
    setForm({
      title: '',
      description: '',
      start_price: '',
      blitz_price: '1',
      buyout_price: '',
      duration_days: 2,
      image_url: ''
    })
    setStatus({ status: 'idle', message: '' })
    setShowModal(true)
  }

  const openEditModal = (auction) => {
    setEditingAuction(auction)
    setForm({
      title: auction.title,
      description: auction.description || '',
      start_price: auction.start_price?.toString() || '',
      blitz_price: auction.blitz_price?.toString() || '1',
      buyout_price: auction.buyout_price?.toString() || '',
      duration_days: auction.duration_days || 2,
      image_url: auction.image_url || ''
    })
    setStatus({ status: 'idle', message: '' })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setStatus({ status: 'error', message: 'Title is required' })
      return
    }
    if (!form.start_price || parseFloat(form.start_price) <= 0) {
      setStatus({ status: 'error', message: 'Valid starting price is required' })
      return
    }

    setStatus({ status: 'loading', message: '' })

    try {
      const payload = {
        title: form.title,
        description: form.description,
        start_price: parseFloat(form.start_price),
        blitz_price: parseFloat(form.blitz_price) || 1,
        buyout_price: form.buyout_price ? parseFloat(form.buyout_price) : null,
        duration_days: form.duration_days,
        image_url: form.image_url || null
      }

      if (editingAuction) {
        await api.put(`/api/auctions/${editingAuction.id}`, payload)
        setStatus({ status: 'success', message: 'Auction updated!' })
      } else {
        await api.post('/api/auctions', payload)
        setStatus({ status: 'success', message: 'Auction created!' })
      }

      setTimeout(() => {
        setShowModal(false)
        loadAuctions()
      }, 1000)
    } catch (e) {
      setStatus({ status: 'error', message: e.response?.data?.detail || 'Failed to save auction' })
    }
  }

  const cancelAuction = async (auction) => {
    if (!await tgConfirm('Cancel this auction? This cannot be undone if there are bids.')) return
    try {
      await api.post(`/api/auctions/${auction.id}/cancel`)
      loadAuctions()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to cancel')
    }
  }

  const deleteAuction = async (auction) => {
    if (!await tgConfirm('Delete this auction?')) return
    try {
      await api.delete(`/api/auctions/${auction.id}`)
      loadAuctions()
    } catch (e) {
      console.error(e)
    }
  }

  const getStatusBadge = (auction) => {
    if (auction.status === 'awaiting_payment') {
      return <span className="px-2 py-0.5 rounded-full bg-accent-cyan/20 text-[10px] text-accent-cyan font-semibold animate-pulse">Awaiting Payment</span>
    }
    if (auction.status === 'ended' || auction.status === 'sold') {
      return <span className="px-2 py-0.5 rounded-full bg-dark-700 text-[10px] text-dark-400">
        {auction.status === 'sold' ? 'Sold' : 'Ended'}
      </span>
    }
    if (auction.status === 'cancelled') {
      return <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-[10px] text-red-400">Cancelled</span>
    }
    if (auction.status === 'active') {
      return <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-400">Active</span>
    }
    return <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-[10px] text-yellow-400">Draft</span>
  }

  // Separate awaiting_payment auctions for highlighting
  const awaitingPaymentAuctions = auctions.filter(a => a.status === 'awaiting_payment')
  const activeAuctions = auctions.filter(a => a.status === 'active')
  const draftAuctions = auctions.filter(a => a.status === 'draft')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Auctions</h1>
          <p className="text-xs text-dark-400">{auctions.length} auctions</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Quick Alerts */}
      {(awaitingPaymentAuctions.length > 0 || draftAuctions.length > 0) && (
        <div className="flex gap-2">
          {awaitingPaymentAuctions.length > 0 && (
            <div className="flex-1 bg-accent-cyan/10 rounded-lg px-3 py-2 flex items-center gap-2">
              <Clock size={14} className="text-accent-cyan" />
              <div>
                <span className="text-sm font-bold text-accent-cyan">{awaitingPaymentAuctions.length}</span>
                <p className="text-[9px] text-dark-400">Awaiting Payment</p>
              </div>
            </div>
          )}
          {draftAuctions.length > 0 && (
            <div className="flex-1 bg-yellow-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
              <Gavel size={14} className="text-yellow-400" />
              <div>
                <span className="text-sm font-bold text-yellow-400">{draftAuctions.length}</span>
                <p className="text-[9px] text-dark-400">Drafts</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auctions List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-3 animate-pulse">
              <div className="h-4 bg-dark-800 rounded w-1/3 mb-1" />
              <div className="h-3 bg-dark-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <div className="card text-center py-8">
          <Gavel size={32} className="mx-auto mb-3 text-dark-600" />
          <h3 className="font-semibold mb-1">No auctions yet</h3>
          <p className="text-dark-400 text-sm mb-3">Sell unique items through auctions</p>
          <button onClick={openCreateModal} className="btn-primary text-sm">
            Add Auction
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {auctions.map((auction, i) => (
            <motion.div
              key={auction.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card px-3 py-2.5 flex items-center gap-3"
            >
              {/* Auction Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm truncate">{auction.title}</h3>
                  {getStatusBadge(auction)}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  <span className="text-primary-400 font-semibold">${auction.start_price}</span>
                  {auction.current_bid && (
                    <span className="text-accent-cyan font-medium">${auction.current_bid} bid</span>
                  )}
                  <span className="text-dark-500">{auction.bid_count || 0} bids</span>
                  <span className="text-dark-500 flex items-center gap-0.5">
                    <Timer size={10} />
                    {formatTimeLeft(auction.ends_at)}
                  </span>
                </div>
              </div>

              {/* Actions - Inline */}
              <div className="flex items-center gap-1">
                {auction.status === 'draft' && (
                  <button
                    onClick={() => openEditModal(auction)}
                    className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                {auction.status === 'active' && auction.bid_count === 0 && (
                  <button
                    onClick={() => cancelAuction(auction)}
                    className="p-1.5 rounded-lg hover:bg-yellow-500/10 text-yellow-400 transition-colors"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                )}
                {(auction.status === 'draft' || auction.status === 'cancelled' || auction.status === 'ended') && (
                  <button
                    onClick={() => deleteAuction(auction)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-bold">
                    {editingAuction ? 'Edit Auction' : 'Create Auction'}
                  </h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-2 hover:bg-dark-800 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Title *</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g., Rare Gaming Account"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe what you're selling..."
                      className="input min-h-[100px] resize-none"
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Ends After</label>
                    <select
                      value={form.duration_days}
                      onChange={(e) => setForm({ ...form, duration_days: parseInt(e.target.value) })}
                      className="input"
                    >
                      {DURATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Start Price *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.start_price}
                        onChange={(e) => setForm({ ...form, start_price: e.target.value })}
                        placeholder="0.00"
                        className="input pl-7"
                      />
                    </div>
                    <p className="text-[10px] text-dark-500 mt-1">Opening bid price</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Blitz (Min Increment)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={form.blitz_price}
                          onChange={(e) => setForm({ ...form, blitz_price: e.target.value })}
                          placeholder="1.00"
                          className="input pl-7"
                        />
                      </div>
                      <p className="text-[10px] text-dark-500 mt-1">Min bid increment</p>
                    </div>

                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Buyout Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.buyout_price}
                          onChange={(e) => setForm({ ...form, buyout_price: e.target.value })}
                          placeholder="Optional"
                          className="input pl-7"
                        />
                      </div>
                      <p className="text-[10px] text-dark-500 mt-1">Instant purchase price</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Image URL</label>
                    <input
                      value={form.image_url}
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                      placeholder="https://..."
                      className="input"
                    />
                  </div>

                  {status.message && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${
                      status.status === 'error' ? 'bg-red-500/10 text-red-400' :
                      status.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                      'bg-dark-800 text-dark-300'
                    }`}>
                      {status.status === 'error' && <AlertCircle size={16} />}
                      {status.status === 'success' && <Check size={16} />}
                      <span className="text-sm">{status.message}</span>
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={status.status === 'loading'}
                    className="w-full btn-primary"
                  >
                    {status.status === 'loading' ? 'Saving...' : editingAuction ? 'Update Auction' : 'Create Auction'}
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
