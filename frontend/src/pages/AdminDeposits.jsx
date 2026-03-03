import { useEffect, useState } from 'react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

const statusClass = (status) => {
  const value = String(status || '').toLowerCase()
  if (value === 'finished' || value === 'confirmed') return 'bg-emerald-500/15 text-emerald-400'
  if (value === 'waiting' || value === 'confirming') return 'bg-yellow-500/15 text-yellow-400'
  if (value === 'manual_credited') return 'bg-blue-500/15 text-blue-300'
  if (value === 'manual_marked') return 'bg-indigo-500/15 text-indigo-300'
  if (value === 'failed' || value === 'expired') return 'bg-red-500/15 text-red-400'
  return 'bg-dark-800 text-dark-300'
}

const formatDate = (value) => {
  if (!value) return '-'
  const dt = new Date(value)
  return dt.toLocaleString()
}

export default function AdminDeposits() {
  const { getEffectiveRole, user } = useAuthStore()
  const effectiveRole = getEffectiveRole()
  const isAdmin = user?.role === 'admin' || effectiveRole === 'admin'
  const [deposits, setDeposits] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [actionError, setActionError] = useState('')

  const loadDeposits = async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get('/api/admin/deposits')
      setDeposits(data)
      setActionError('')
    } catch {
      setDeposits([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadDeposits()
    }
  }, [effectiveRole, isAdmin])

  const handleMarkCredited = async (depositId) => {
    setActionId(depositId)
    setActionError('')
    try {
      await api.post(`/api/admin/deposits/${depositId}/mark-credited`, { credited: true })
      await loadDeposits()
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Failed to mark deposit.'
      setActionError(detail)
    } finally {
      setActionId(null)
    }
  }

  const handleCredit = async (depositId) => {
    setActionId(depositId)
    setActionError('')
    try {
      await api.post(`/api/admin/deposits/${depositId}/credit`)
      await loadDeposits()
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Failed to credit deposit.'
      setActionError(detail)
    } finally {
      setActionId(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="card p-4">
        <p className="text-sm text-dark-300">Admin access required.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">Admin Deposits</h1>
        <p className="text-dark-400 text-xs">All user deposits with credit controls.</p>
      </div>

      <div className="card p-3">
        {actionError && (
          <p className="text-xs text-red-400 mb-2">{actionError}</p>
        )}
        {isLoading ? (
          <p className="text-sm text-dark-400">Loading deposits...</p>
        ) : deposits.length === 0 ? (
          <p className="text-sm text-dark-400">No deposits found.</p>
        ) : (
          <div className="space-y-3">
            {deposits.map(dep => (
              <div key={dep.deposit_id} className="p-3 rounded-lg bg-dark-900/60 border border-dark-800">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">#{dep.deposit_id} • ${dep.price_amount_usd.toFixed(2)}</p>
                    <p className="text-xs text-dark-400">
                      {dep.username ? `@${dep.username}` : dep.first_name || 'Unknown'} • {dep.telegram_id || '-'}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusClass(dep.payment_status)}`}>
                    {dep.payment_status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-dark-300">
                  <div>
                    <span className="text-dark-500">Pay:</span> {dep.pay_amount || '-'} {dep.pay_currency?.toUpperCase() || ''}
                  </div>
                  <div>
                    <span className="text-dark-500">Confirmations:</span> {dep.confirmations ?? 0}
                  </div>
                  <div>
                    <span className="text-dark-500">Created:</span> {formatDate(dep.created_at)}
                  </div>
                  <div>
                    <span className="text-dark-500">Credited:</span> {dep.is_credited ? 'Yes' : 'No'}
                  </div>
                </div>
                {!dep.is_credited && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-primary py-1.5 px-3 text-xs"
                      onClick={() => handleCredit(dep.deposit_id)}
                      disabled={actionId === dep.deposit_id}
                    >
                      {actionId === dep.deposit_id ? 'Crediting...' : '💰 Credit Balance'}
                    </button>
                    {dep.payment_status !== 'manual_marked' && (
                      <button
                        className="py-1.5 px-3 text-xs rounded-lg bg-dark-800 text-dark-200 hover:bg-dark-700"
                        onClick={() => handleMarkCredited(dep.deposit_id)}
                        disabled={actionId === dep.deposit_id}
                      >
                        ✓ Mark as Paid
                      </button>
                    )}
                  </div>
                )}
                {dep.is_credited && (
                  <div className="mt-2">
                    <span className="text-xs text-emerald-400">✓ Balance credited to user</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
