import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Check, X, MessageCircle, Shield, DollarSign, ChevronDown } from 'lucide-react'
import api from '../lib/api'

const statusStyles = {
  open: 'bg-red-500/15 text-red-400',
  resolved: 'bg-emerald-500/15 text-emerald-400',
  closed: 'bg-dark-700 text-dark-400',
}

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [expandedId, setExpandedId] = useState(null)
  const [resolveForm, setResolveForm] = useState({ resolution: '', action: 'favor_seller' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadDisputes() }, [statusFilter])

  const loadDisputes = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/admin/disputes?status=${statusFilter}`)
      setDisputes(data)
    } catch { setDisputes([]) } finally { setLoading(false) }
  }

  const handleResolve = async (disputeId) => {
    if (!resolveForm.resolution.trim()) return
    setSubmitting(true)
    try {
      await api.post(`/api/admin/disputes/${disputeId}/resolve`, resolveForm)
      setExpandedId(null)
      setResolveForm({ resolution: '', action: 'favor_seller' })
      loadDisputes()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to resolve')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold flex items-center gap-2">
          <AlertTriangle size={20} className="text-red-400" /> Reviews
        </h1>
        <span className="text-xs text-dark-400">{disputes.length} results</span>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {['open', 'resolved', 'closed', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
              statusFilter === s 
                ? 'bg-primary-500/15 text-primary-300 ring-1 ring-primary-500/30' 
                : 'bg-dark-800/60 text-dark-400 hover:text-dark-50'
            }`}
          >{s}</button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card p-4 animate-pulse"><div className="h-5 w-1/3 bg-dark-800 rounded mb-2" /><div className="h-4 w-2/3 bg-dark-800 rounded" /></div>)}</div>
      ) : disputes.length === 0 ? (
        <div className="card p-10 text-center">
          <Shield size={32} className="mx-auto mb-3 text-dark-500" />
          <p className="text-dark-400 text-sm">No reviews found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {disputes.map((d, i) => {
            const isExpanded = expandedId === d.id
            return (
              <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : d.id)} className="w-full p-3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className={d.status === 'open' ? 'text-red-400' : 'text-dark-400'} />
                      <div>
                        <p className="text-sm font-semibold">Review #{d.id} — Order #{d.order_id}</p>
                        <p className="text-[11px] text-dark-400">
                          by @{d.opener_username || d.opener_first_name} 
                          {d.seller_username && <> · seller @{d.seller_username}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusStyles[d.status] || statusStyles.closed}`}>{d.status}</span>
                      <ChevronDown size={14} className={`text-dark-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-3 pb-3 space-y-3 border-t border-dark-800 pt-3">
                        {/* Info Grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <span className="text-dark-500">Order Total</span>
                            <p className="font-bold">${d.order_total?.toFixed(2)}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2">
                            <span className="text-dark-500">Order Status</span>
                            <p className="font-bold capitalize">{d.order_status}</p>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-2 col-span-2">
                            <span className="text-dark-500">Opened</span>
                            <p>{new Date(d.created_at).toLocaleString()}</p>
                          </div>
                        </div>

                        {/* Reason */}
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5">
                          <p className="text-[10px] text-red-400 font-medium mb-1">Reason</p>
                          <p className="text-xs">{d.reason}</p>
                        </div>

                        {/* Resolution */}
                        {d.resolution && (
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                            <p className="text-[10px] text-emerald-400 font-medium mb-1">Resolution</p>
                            <p className="text-xs">{d.resolution}</p>
                          </div>
                        )}

                        {/* Resolve Form */}
                        {d.status === 'open' && (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={resolveForm.resolution}
                              onChange={(e) => setResolveForm({ ...resolveForm, resolution: e.target.value })}
                              className="input min-h-[70px] text-xs"
                              placeholder="Resolution note..."
                            />
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1.5 text-xs">
                                <input type="radio" name={`action-${d.id}`} value="favor_seller" checked={resolveForm.action === 'favor_seller'} onChange={() => setResolveForm({ ...resolveForm, action: 'favor_seller' })} />
                                Favor Seller (no refund)
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-orange-400">
                                <input type="radio" name={`action-${d.id}`} value="refund_buyer" checked={resolveForm.action === 'refund_buyer'} onChange={() => setResolveForm({ ...resolveForm, action: 'refund_buyer' })} />
                                <DollarSign size={12} /> Refund Buyer
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolve(d.id)}
                                disabled={submitting || !resolveForm.resolution.trim()}
                                className="btn-primary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                              >
                                <Check size={14} /> Resolve
                              </button>
                              <button onClick={() => setExpandedId(null)} className="px-4 py-2 bg-dark-800 rounded-xl text-xs hover:bg-dark-700 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Link to order messages */}
                        <a href={`/orders/${d.order_id}`} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300">
                          <MessageCircle size={12} /> View order messages
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
