import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Store, Shield, Star, MessageCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import api from '../../lib/api'

function CollateralCard({ highlight }) {
  const { user, setUser } = useAuthStore()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleCollateral = async (action) => {
    const val = parseFloat(amount)
    if (!val || val <= 0) return setMsg({ type: 'error', text: 'Enter a valid amount' })
    setLoading(true)
    setMsg(null)
    try {
      const res = await api.post(`/api/sellers/collateral/${action}?amount=${val}`)
      setMsg({ type: 'ok', text: res.data.message })
      setAmount('')
      const me = await api.get('/api/auth/me')
      setUser(me.data)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`card p-3.5 transition-all duration-500 ${highlight ? 'ring-2 ring-primary-500' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-primary-400" />
        <h2 className="text-sm font-semibold">Collateral</h2>
      </div>
      <p className="text-[11px] text-dark-400 leading-relaxed mb-3">
        Deposit collateral as a trust guarantee visible to buyers.
      </p>
      <div className="flex items-center justify-between bg-dark-800/60 rounded-lg p-3 mb-3">
        <span className="text-[11px] text-dark-400">Current</span>
        <span className="text-lg font-bold text-primary-400">${(user?.collateral || 0).toFixed(2)}</span>
      </div>
      <div className="flex gap-1.5">
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input flex-1 py-2 text-sm"
        />
        <button
          onClick={() => handleCollateral('deposit')}
          disabled={loading}
          className="btn-primary px-3 py-2 text-xs"
        >
          Deposit
        </button>
        <button
          onClick={() => handleCollateral('withdraw')}
          disabled={loading}
          className="px-3 py-2 text-xs rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
        >
          Withdraw
        </button>
      </div>
      {msg && (
        <p className={`text-[11px] mt-2 ${msg.type === 'error' ? 'text-red-400' : 'text-primary-400'}`}>{msg.text}</p>
      )}
    </motion.div>
  )
}

function FeaturedCard({ highlight }) {
  const { user, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [ranks, setRanks] = useState([])
  const [featuredCost, setFeaturedCost] = useState(200)

  const RANK_NAMES = { 0: 'None', 1: 'Bronze', 2: 'Silver', 3: 'Gold' }
  const RANK_COLORS = { 1: 'text-amber-600', 2: 'text-gray-300', 3: 'text-yellow-400' }
  const currentRank = user?.seller_rank || 0
  const featuredActive = user?.featured_expires_at && new Date(user.featured_expires_at) > new Date()
  const daysLeft = featuredActive ? Math.ceil((new Date(user.featured_expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : 0

  const rankActive = user?.seller_expires_at && new Date(user.seller_expires_at) > new Date()
  const rankDaysLeft = rankActive ? Math.ceil((new Date(user.seller_expires_at) - new Date()) / (1000 * 60 * 60 * 24)) : 0

  useEffect(() => {
    api.get('/api/sellers/ranks').then(res => {
      setRanks(res.data.ranks || [])
      setFeaturedCost(res.data.featured_cost || 200)
    }).catch(() => {})
  }, [])

  const handleBuyRank = async (rank) => {
    setLoading(true)
    setMsg(null)
    try {
      const res = await api.post(`/api/sellers/rank/buy/${rank}`)
      setMsg({ type: 'ok', text: res.data.message })
      const me = await api.get('/api/auth/me')
      setUser(me.data)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleBuyFeatured = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const res = await api.post('/api/sellers/featured/buy')
      setMsg({ type: 'ok', text: res.data.message })
      const me = await api.get('/api/auth/me')
      setUser(me.data)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`card p-3.5 space-y-3 transition-all duration-500 ${highlight ? 'ring-2 ring-primary-500' : ''}`}>
      <div className="flex items-center gap-2">
        <Star size={16} className="text-yellow-400 fill-yellow-400" />
        <h2 className="text-sm font-semibold">Seller Rank & Featured</h2>
      </div>

      {/* Current Status */}
      {currentRank > 0 && (
        <div className="flex items-center justify-between bg-dark-800/60 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Star size={18} className={`${RANK_COLORS[currentRank]} fill-current`} />
            <div>
              <span className="text-sm font-bold">{RANK_NAMES[currentRank]} Rank</span>
              {rankActive && (
                <p className="text-[10px] text-emerald-400">
                  {rankDaysLeft}d remaining
                </p>
              )}
              {featuredActive && (
                <p className="text-[10px] text-yellow-400">
                  Featured: {daysLeft}d left
                </p>
              )}
              {!featuredActive && currentRank === 1 && (
                <p className="text-[10px] text-dark-400">No featured</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rank Selection */}
      <div>
        <p className="text-[11px] text-dark-400 mb-2">Choose a rank:</p>
        <div className="grid grid-cols-3 gap-2">
          {ranks.map(rank => {
            const isCurrent = currentRank === rank.rank
            return (
              <div
                key={rank.rank}
                className={`p-3 rounded-xl border text-center ${
                  isCurrent 
                    ? 'bg-primary-500/10 border-primary-500/30' 
                    : 'bg-dark-800/60 border-dark-700 hover:border-dark-600'
                }`}
              >
                <Star 
                  size={18} 
                  className={`mx-auto mb-1 ${
                    rank.rank === 3 ? 'text-yellow-400 fill-yellow-400' :
                    rank.rank === 2 ? 'text-gray-300 fill-gray-300' :
                    'text-amber-600 fill-amber-600'
                  }`} 
                />
                <p className="text-xs font-semibold">{rank.name}</p>
                <p className="text-lg font-bold">${rank.price}<span className="text-[9px] font-normal text-dark-500">/mo</span></p>
                <p className="text-[9px] text-dark-500">
                  {rank.featured_days > 0 ? `+${rank.featured_days}d featured` : 'No featured'}
                </p>
                <button
                  onClick={() => handleBuyRank(rank.rank)}
                  disabled={loading}
                  className="mt-2 w-full py-1.5 text-[10px] font-medium rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
                >
                  {loading ? '...' : isCurrent ? 'Extend' : 'Buy'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Featured Spot Purchase */}
      {(currentRank <= 1 || !featuredActive) && (
        <div className="border-t border-dark-700 pt-3">
          <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
            <div>
              <span className="text-xs font-semibold text-yellow-400">★ Buy Featured Spot</span>
              <p className="text-[10px] text-dark-400">
                Appear on homepage for 30 days
              </p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold text-yellow-400">${featuredCost}</p>
              <button
                onClick={handleBuyFeatured}
                disabled={loading}
                className="text-[10px] px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors font-medium"
              >
                {loading ? '...' : featuredActive ? 'Extend' : 'Buy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${msg.type === 'error' ? 'text-red-400' : 'text-primary-400'}`}>{msg.text}</p>
      )}
    </motion.div>
  )
}

export default function SellerSettings() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [shopForm, setShopForm] = useState({ shop_name: '', shop_description: '', auto_response: '' })
  const [shopStatus, setShopStatus] = useState({ status: 'idle', message: '' })
  const [highlightSection, setHighlightSection] = useState(null)
  
  const profileRef = useRef(null)
  const collateralRef = useRef(null)
  const rankRef = useRef(null)

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    const section = searchParams.get('section')
    if (section) {
      setHighlightSection(section)
      setTimeout(() => {
        const ref = section === 'profile' ? profileRef : section === 'collateral' ? collateralRef : section === 'rank' ? rankRef : null
        ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      // Clear highlight after animation
      setTimeout(() => setHighlightSection(null), 2000)
    }
  }, [searchParams])

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/api/sellers/profile')
      setShopForm({
        shop_name: data?.shop_name || '',
        shop_description: data?.shop_description || '',
        auto_response: data?.auto_response || ''
      })
    } catch (error) {
      console.error(error)
    }
  }

  const handleShopSave = async () => {
    setShopStatus({ status: 'loading', message: '' })
    try {
      await api.put('/api/sellers/profile', {
        shop_name: shopForm.shop_name.trim() || null,
        shop_description: shopForm.shop_description.trim() || null,
        auto_response: shopForm.auto_response.trim() || null
      })
      setShopStatus({ status: 'success', message: 'Shop settings saved.' })
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Save failed.'
      setShopStatus({ status: 'error', message: detail })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-lg font-bold">Settings</h1>
        <p className="text-[11px] text-dark-400">Manage seller account preferences</p>
      </div>

      <motion.div
        ref={profileRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`card p-3.5 transition-all duration-500 ${highlightSection === 'profile' ? 'ring-2 ring-primary-500' : ''}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <Store size={16} className="text-primary-400" />
          <h2 className="text-sm font-semibold">Shop Settings</h2>
        </div>
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] text-dark-400 mb-1">Shop Name</label>
            <input
              value={shopForm.shop_name}
              onChange={(e) => setShopForm({ ...shopForm, shop_name: e.target.value })}
              className="input py-2 text-sm"
              placeholder="Your shop name"
            />
          </div>
          <div>
            <label className="block text-[11px] text-dark-400 mb-1">Description</label>
            <textarea
              value={shopForm.shop_description}
              onChange={(e) => setShopForm({ ...shopForm, shop_description: e.target.value })}
              className="input min-h-[80px] text-sm"
              placeholder="Describe your shop"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <MessageCircle size={12} className="text-primary-400" />
              <label className="text-[11px] text-dark-400">Auto-Response</label>
            </div>
            <textarea
              value={shopForm.auto_response}
              onChange={(e) => setShopForm({ ...shopForm, auto_response: e.target.value })}
              className="input min-h-[60px] text-sm"
              placeholder="Auto-reply to new messages (leave empty to disable)"
              maxLength={500}
            />
            <p className="text-[10px] text-dark-500 mt-1">Automatically respond when someone sends you a new message</p>
          </div>
          <button
            onClick={handleShopSave}
            disabled={shopStatus.status === 'loading'}
            className="btn-primary w-full py-2 text-sm"
          >
            {shopStatus.status === 'loading' ? 'Saving...' : 'Save Changes'}
          </button>
          {shopStatus.message && (
            <p className={`text-[11px] ${shopStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
              {shopStatus.message}
            </p>
          )}
        </div>
      </motion.div>

      {/* Account Info */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-3.5">
        <h2 className="text-sm font-semibold mb-3">Seller Account</h2>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-dark-400">Username</span>
            <span>@{user?.username || '-'}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-dark-400">Wallet Balance</span>
            <span className="text-emerald-400 font-semibold">${(user?.balance || 0).toFixed(2)}</span>
          </div>
          {user?.seller_expires_at && (
            <div className="flex justify-between text-[11px]">
              <span className="text-dark-400">Subscription</span>
              <span className={
                new Date(user.seller_expires_at) > new Date()
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }>
                {new Date(user.seller_expires_at) > new Date()
                  ? `Active until ${new Date(user.seller_expires_at).toLocaleDateString()}`
                  : 'Expired'}
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Collateral */}
      <div ref={collateralRef}>
        <CollateralCard highlight={highlightSection === 'collateral'} />
      </div>

      {/* Rank & Featured */}
      <div ref={rankRef}>
        <FeaturedCard highlight={highlightSection === 'rank'} />
      </div>
    </div>
  )
}
