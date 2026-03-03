import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpCircle, Check, X, RefreshCw, DollarSign, RotateCcw, ExternalLink } from 'lucide-react'
import api from '../lib/api'

const statusColors = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  processing: 'bg-blue-500/15 text-blue-400',
  approved: 'bg-emerald-500/15 text-emerald-400',
  rejected: 'bg-red-500/15 text-red-400',
  failed: 'bg-red-500/15 text-red-400'
}

const formatDate = (v) => v ? new Date(v).toLocaleString() : '-'

export default function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = filter ? { status: filter } : {}
      const { data } = await api.get('/api/admin/withdrawals', { params })
      setWithdrawals(data)
    } catch {
      setWithdrawals([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const handleApprove = async (id) => {
    setActionLoading(id)
    setError('')
    try {
      await api.post(`/api/admin/withdrawals/${id}/approve`)
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Approve failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (id) => {
    const note = prompt('Rejection reason (optional):') ?? ''
    setActionLoading(id)
    setError('')
    try {
      await api.post(`/api/admin/withdrawals/${id}/reject`, null, { params: { note } })
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Reject failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRetry = async (id) => {
    setActionLoading(id)
    setError('')
    try {
      await api.post(`/api/admin/withdrawals/${id}/retry`)
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Retry failed')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Withdrawal Requests</h1>
          <p className="text-dark-400 text-xs">Review and process withdrawal requests (USDT TRC-20 payouts)</p>
        </div>
        <button onClick={load} className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['pending', 'processing', 'approved', 'failed', 'rejected', ''].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              filter === s
                ? 'bg-primary-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:text-dark-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-1/3 bg-dark-800 rounded mb-2" />
              <div className="h-3 w-1/2 bg-dark-800 rounded" />
            </div>
          ))}
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="card p-8 text-center">
          <ArrowUpCircle size={32} className="mx-auto text-dark-600 mb-2" />
          <p className="text-dark-400 text-sm">No withdrawal requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {withdrawals.map(wr => (
              <motion.div
                key={wr.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card p-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <DollarSign size={16} className="text-primary-400" />
                      <span className="font-bold text-lg">${wr.amount?.toFixed(2)}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusColors[wr.status] || 'bg-dark-800 text-dark-400'}`}>
                        {wr.status}
                      </span>
                    </div>
                    <p className="text-xs text-dark-400">
                      <span className="text-dark-300 font-medium">{wr.first_name || wr.username || 'Unknown'}</span>
                      {wr.username && <span className="text-dark-500"> @{wr.username}</span>}
                      {wr.telegram_id && <span className="text-dark-600"> ({wr.telegram_id})</span>}
                    </p>
                    {wr.destination && (
                      <p className="text-xs text-dark-400 font-mono truncate">To: <span className="text-dark-300">{wr.destination}</span></p>
                    )}
                    {wr.user_balance !== null && wr.user_balance !== undefined && (
                      <p className="text-xs text-dark-500">Current balance: ${wr.user_balance?.toFixed(2)}</p>
                    )}
                    <p className="text-[11px] text-dark-500">{formatDate(wr.created_at)}</p>
                    {wr.admin_note && (
                      <p className="text-xs text-dark-400 italic">Note: {wr.admin_note}</p>
                    )}

                    {/* Payout Info */}
                    {wr.payout_id && (
                      <div className="mt-1 p-2 rounded-lg bg-dark-800/50 space-y-0.5">
                        <p className="text-[11px] text-dark-400">Payout ID: <span className="text-dark-300 font-mono">{wr.payout_id}</span></p>
                        {wr.payout_status && (
                          <p className="text-[11px] text-dark-400">Payout Status: <span className="text-dark-300">{wr.payout_status}</span></p>
                        )}
                        {wr.payout_hash && (
                          <a
                            href={`https://tronscan.org/#/transaction/${wr.payout_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-primary-400 hover:underline"
                          >
                            <ExternalLink size={10} />
                            TX: {wr.payout_hash.slice(0, 20)}...
                          </a>
                        )}
                        {wr.payout_amount && (
                          <p className="text-[11px] text-dark-400">Payout Amount: <span className="text-dark-300">{wr.payout_amount} {wr.payout_currency?.toUpperCase()}</span></p>
                        )}
                      </div>
                    )}

                    {/* Payout Error */}
                    {wr.payout_error && (
                      <div className="mt-1 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-[11px] text-red-400">Error: {wr.payout_error}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-shrink-0 ml-3">
                    {wr.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(wr.id)}
                          disabled={actionLoading === wr.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors"
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(wr.id)}
                          disabled={actionLoading === wr.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors"
                        >
                          <X size={14} />
                          Reject
                        </button>
                      </>
                    )}
                    {wr.status === 'failed' && (
                      <>
                        <button
                          onClick={() => handleRetry(wr.id)}
                          disabled={actionLoading === wr.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-500/15 text-blue-400 rounded-lg hover:bg-blue-500/25 transition-colors"
                        >
                          <RotateCcw size={14} />
                          Retry
                        </button>
                        <button
                          onClick={() => handleReject(wr.id)}
                          disabled={actionLoading === wr.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors"
                        >
                          <X size={14} />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {wr.processed_at && (
                  <p className="text-[11px] text-dark-500">Processed: {formatDate(wr.processed_at)}</p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
