import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Users2, Plus, ChevronRight, Clock, CheckCircle, 
  XCircle, Users, Shield, AlertCircle, DollarSign,
  MessageCircle, ArrowRight, HelpCircle, Copy, Link2
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../components/Toast'

const STATUS_CONFIG = {
  pending_invite: { label: 'Pending Invite', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  negotiating: { label: 'Negotiating', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  pending_confirmation: { label: 'Pending Confirm', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  funds_locked: { label: 'Funds Locked', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },

  admin_joined: { label: 'Admin Joined', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  completed: { label: 'Completed', color: 'text-green-400', bg: 'bg-green-500/10' },
  cancelled: { label: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/10' },
}

export default function Middleman() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addToast } = useToast()
  const [info, setInfo] = useState(null)
  const [deals, setDeals] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  
  const [form, setForm] = useState({
    role: 'buyer',
    counterparty_username: '',
    title: '',
    amount: '',
    terms: '',
    lock_in_days: '0'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [infoRes, dealsRes, invitesRes] = await Promise.all([
        api.get('/api/middleman/info'),
        api.get('/api/middleman/deals'),
        api.get('/api/middleman/invites')
      ])
      setInfo(infoRes.data)
      setDeals(dealsRes.data || [])
      setInvites(invitesRes.data || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.counterparty_username.trim() || !form.title.trim()) return
    
    setCreating(true)
    try {
      const res = await api.post('/api/middleman/deals', {
        creator_role: form.role,
        counterparty_username: form.counterparty_username.trim(),
        title: form.title.trim(),
        amount: parseFloat(form.amount) || 0,
        terms: form.terms.trim() || null,
        lock_in_days: parseInt(form.lock_in_days) || 0
      })
      
      // Check if this was a promo code redemption
      if (res.data.promo_success) {
        addToast(res.data.message, { type: 'success' })
        setShowCreate(false)
        setForm({ role: 'buyer', counterparty_username: '', title: '', amount: '', terms: '', lock_in_days: 14 })
        return
      }
      
      navigate(`/middleman/${res.data.id}`)
    } catch (error) {
      console.error(error)
      addToast(error.response?.data?.detail || 'Failed to create deal', { type: 'error' })
    } finally {
      setCreating(false)
    }
  }

  const handleJoinByCode = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return
    
    setJoining(true)
    try {
      const res = await api.post(`/api/middleman/join/${joinCode.trim().toUpperCase()}`)
      
      // Check if this was a promo code redemption
      if (res.data.promo_success) {
        addToast(res.data.message, { type: 'success' })
        setJoinCode('')
        return
      }
      
      navigate(`/middleman/${res.data.id}`)
    } catch (error) {
      console.error(error)
      addToast(error.response?.data?.detail || 'Invalid invite code', { type: 'error' })
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse p-4">
          <div className="h-6 bg-dark-700 rounded w-1/3 mb-3" />
          <div className="h-4 bg-dark-700 rounded w-full mb-2" />
          <div className="h-4 bg-dark-700 rounded w-2/3" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card animate-pulse p-4 h-20" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold flex items-center gap-2">
          <Users2 size={24} className="text-primary-400" />
          Middleman Service
        </h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2"
        >
          <Plus size={16} />
          New Deal
        </button>
      </div>

      {/* Join by Code */}
      {!showCreate && (
        <motion.form
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleJoinByCode}
          className="card p-3 flex gap-2"
        >
          <div className="flex-1">
            <input
              type="text"
              placeholder="Enter invite code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={16}
              className="input text-sm w-full text-center font-mono tracking-widest"
            />
          </div>
          <button
            type="submit"
            disabled={joining || !joinCode.trim()}
            className="btn-secondary px-4 flex items-center gap-1.5 text-sm"
          >
            <Link2 size={14} />
            {joining ? '...' : 'Join'}
          </button>
        </motion.form>
      )}

      {/* Service Info */}
      {info && !showCreate && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center shrink-0">
              <Shield size={20} className="text-primary-400" />
            </div>
            <div>
              <h2 className="font-semibold mb-1">Safe Peer-to-Peer Trading</h2>
              <p className="text-xs text-dark-400 leading-relaxed">
                Our Middleman Service provides secure escrow for high-value trades between users. 
                An admin oversees the exchange to prevent scams.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-dark-800 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                <Users size={12} />
                How it works
              </div>
              <ol className="text-dark-300 space-y-0.5 text-[11px]">
                <li>1. Buyer creates deal & invites seller</li>
                <li>2. Both parties negotiate terms</li>
                <li>3. Both confirm → buyer funds locked</li>
                <li>4. Both complete → seller receives funds</li>
              </ol>
            </div>
            <div className="bg-dark-800 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                <DollarSign size={12} />
                Fees
              </div>
              <p className="text-dark-300 text-[11px]">
                {info.fee_percent}% of transaction value<br/>
                (minimum ${info.min_fee.toFixed(2)})
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Create Form */}
      {showCreate && (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreate}
          className="card p-4 space-y-3"
        >
          <h2 className="font-semibold flex items-center gap-2">
            <Plus size={16} className="text-primary-400" />
            Create New Escrow Deal
          </h2>
          
          {/* Role Selector */}
          <div>
            <label className="text-xs text-dark-400 mb-1.5 block">Your Role in This Deal *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'buyer' })}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  form.role === 'buyer'
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                }`}
              >
                I'm the Buyer
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'seller' })}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  form.role === 'seller'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                }`}
              >
                I'm the Seller
              </button>
            </div>
            <p className="text-[11px] text-dark-500 mt-1">
              {form.role === 'buyer' ? 'You will fund the escrow' : 'Your counterparty will fund the escrow'}
            </p>
          </div>
          
          <div>
            <label className="text-xs text-dark-400 mb-1 block">
              {form.role === 'buyer' ? "Seller's" : "Buyer's"} Telegram Handle *
            </label>
            <input
              type="text"
              placeholder={form.role === 'buyer' ? '@seller_username' : '@buyer_username'}
              value={form.counterparty_username}
              onChange={(e) => setForm({ ...form, counterparty_username: e.target.value })}
              className="input text-sm"
              required
            />
          </div>
          
          <div>
            <label className="text-xs text-dark-400 mb-1 block">Deal Title *</label>
            <input
              type="text"
              placeholder="e.g., CS2 Knife Trade"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input text-sm"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Lock-in Period (days)</label>
              <select
                value={form.lock_in_days}
                onChange={(e) => setForm({ ...form, lock_in_days: e.target.value })}
                className="input text-sm"
              >
                <option value="0">Immediate release</option>
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="text-xs text-dark-400 mb-1 block">Terms & Conditions</label>
            <textarea
              placeholder="Specify the exact terms of the exchange..."
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
              className="input text-sm resize-none"
              rows={3}
            />
          </div>
          
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !form.counterparty_username.trim() || !form.title.trim()}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {creating ? 'Creating...' : (
                <>
                  <ArrowRight size={16} />
                  Create & Invite {form.role === 'buyer' ? 'Seller' : 'Buyer'}
                </>
              )}
            </button>
          </div>
        </motion.form>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-yellow-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <AlertCircle size={14} />
            Invites for You ({invites.length})
          </h2>
          <div className="space-y-2">
            {invites.map((deal) => (
              <DealCard key={deal.id} deal={deal} userId={user?.id} isInvite />
            ))}
          </div>
        </section>
      )}

      {/* Active Deals */}
      {deals.filter(d => !['completed', 'cancelled'].includes(d.status)).length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-dark-300 uppercase tracking-wider mb-2 px-1">
            Active Deals ({deals.filter(d => !['completed', 'cancelled'].includes(d.status)).length})
          </h2>
          <div className="space-y-2">
            {deals.filter(d => !['completed', 'cancelled'].includes(d.status)).map((deal) => (
              <DealCard key={deal.id} deal={deal} userId={user?.id} />
            ))}
          </div>
        </section>
      )}

      {/* Past Deals */}
      {deals.filter(d => ['completed', 'cancelled'].includes(d.status)).length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-dark-500 uppercase tracking-wider mb-2 px-1">
            Past Deals
          </h2>
          <div className="space-y-2">
            {deals.filter(d => ['completed', 'cancelled'].includes(d.status)).map((deal) => (
              <DealCard key={deal.id} deal={deal} userId={user?.id} />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {deals.length === 0 && invites.length === 0 && !showCreate && (
        <div className="card p-8 text-center">
          <Users2 size={48} className="mx-auto text-dark-600 mb-3" />
          <h3 className="font-semibold mb-2">No Deals Yet</h3>
          <p className="text-dark-400 text-sm mb-4">
            Start a secure peer-to-peer trade with another user.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Create Your First Deal
          </button>
        </div>
      )}

      {/* FAQ Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-4"
      >
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <HelpCircle size={16} className="text-primary-400" />
          Frequently Asked Questions
        </h3>
        
        <div className="space-y-3">
          <div className="bg-dark-800 rounded-lg p-3">
            <h4 className="text-sm font-medium mb-1">Who can use Escrow?</h4>
            <p className="text-xs text-dark-400 leading-relaxed">
              Any two users can use the escrow service - buyers, sellers, or any combination. 
              Both parties don't need to be sellers on the platform. It's designed for secure 
              peer-to-peer trading between anyone.
            </p>
          </div>
          
          <div className="bg-dark-800 rounded-lg p-3">
            <h4 className="text-sm font-medium mb-1">What can be traded?</h4>
            <p className="text-xs text-dark-400 leading-relaxed">
              You can trade anything - game items, accounts, services, or any digital goods. 
              The admin will oversee the exchange to ensure both parties fulfill their obligations.
            </p>
          </div>
          
          <div className="bg-dark-800 rounded-lg p-3">
            <h4 className="text-sm font-medium mb-1">How does payment work?</h4>
            <p className="text-xs text-dark-400 leading-relaxed">
              <strong className="text-cyan-400">Automatic escrow:</strong> When both parties confirm terms, 
              the buyer's marketplace balance is automatically locked. When both mark complete, 
              funds transfer to seller's escrow balance (minus fee). Lock-in period applies before withdrawal.
            </p>
          </div>
          
          <div className="bg-dark-800 rounded-lg p-3">
            <h4 className="text-sm font-medium mb-1">What are the fees?</h4>
            <p className="text-xs text-dark-400 leading-relaxed">
              The escrow service fee is 5% of the transaction value (minimum $20). 
              This covers admin oversight and platform protection.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function DealCard({ deal, userId, isInvite = false }) {
  const status = STATUS_CONFIG[deal.status] || STATUS_CONFIG.negotiating
  // Determine the other party based on current user
  const isBuyer = deal.buyer_id === userId
  const otherParty = isBuyer 
    ? (deal.seller || { username: deal.seller_username })
    : (deal.buyer || { username: deal.buyer_username })
  
  return (
    <Link to={`/middleman/${deal.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`card-hover p-3 ${isInvite ? 'ring-1 ring-yellow-500/30' : ''}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${status.bg} flex items-center justify-center shrink-0`}>
            {deal.status === 'completed' ? (
              <CheckCircle size={18} className={status.color} />
            ) : deal.status === 'cancelled' ? (
              <XCircle size={18} className={status.color} />
            ) : deal.status === 'admin_joined' ? (
              <Shield size={18} className={status.color} />
            ) : (
              <Users2 size={18} className={status.color} />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-medium text-sm truncate">{deal.title}</h3>
              {isInvite && (
                <span className="badge bg-yellow-500/20 text-yellow-400 text-[10px]">New Invite</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-dark-400">
              <span>with @{otherParty?.username || '?'}</span>
              {deal.amount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-primary-400 font-medium">${deal.amount.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>
          
          <div className="text-right shrink-0">
            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
            <ChevronRight size={16} className="text-dark-600 ml-1 inline" />
          </div>
        </div>
      </motion.div>
    </Link>
  )
}
