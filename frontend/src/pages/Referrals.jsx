import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Users, Gift, Copy, Check, DollarSign, UserPlus, 
  Clock, CheckCircle, Info, Edit3, Save, Sparkles
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import api from '../lib/api'

export default function Referrals() {
  const { user } = useAuthStore()
  const { branding } = useBrandingStore()
  const [referralCode, setReferralCode] = useState('')
  const [stats, setStats] = useState(null)
  const [config, setConfig] = useState(null)
  const [referrals, setReferrals] = useState([])
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [applyCode, setApplyCode] = useState('')
  const [applyStatus, setApplyStatus] = useState({ status: 'idle', message: '' })
  const [alreadyReferred, setAlreadyReferred] = useState(false)
  
  // Custom code editing
  const [editingCode, setEditingCode] = useState(false)
  const [customCode, setCustomCode] = useState('')
  const [savingCode, setSavingCode] = useState(false)
  const [codeError, setCodeError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [codeRes, statsRes, configRes, listRes] = await Promise.all([
        api.get('/api/referrals/my-code'),
        api.get('/api/referrals/stats'),
        api.get('/api/referrals/config'),
        api.get('/api/referrals/my-referrals')
      ])
      setReferralCode(codeRes.data.referral_code)
      setCustomCode(codeRes.data.referral_code)
      setStats(statsRes.data)
      setConfig(configRes.data)
      setReferrals(listRes.data)
      
      // Check if user was already referred
      const checkRes = await api.get('/api/referrals/check-referrer')
      setAlreadyReferred(checkRes.data.has_referrer)
    } catch (err) {
      console.error('Failed to load referral data:', err)
    } finally {
      setLoading(false)
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApplyCode = async () => {
    if (!applyCode.trim()) return
    setApplyStatus({ status: 'loading', message: '' })
    try {
      await api.post(`/api/referrals/apply/${applyCode.trim().toUpperCase()}`)
      setApplyStatus({ status: 'success', message: `Code applied! +${config?.first_deposit_bonus_percent || 10}% bonus on first deposit!` })
      setAlreadyReferred(true)
    } catch (err) {
      setApplyStatus({ 
        status: 'error', 
        message: err.response?.data?.detail || 'Invalid code' 
      })
    }
  }

  const startEditingCode = () => {
    setEditingCode(true)
    setCustomCode(referralCode)
    setCodeError('')
  }

  const cancelEditingCode = () => {
    setEditingCode(false)
    setCustomCode(referralCode)
    setCodeError('')
  }

  const saveCustomCode = async () => {
    const code = customCode.toUpperCase().trim()
    if (!code || code.length < 3) {
      setCodeError('Min 3 characters')
      return
    }
    if (!/^[A-Z0-9_]+$/.test(code)) {
      setCodeError('Letters, numbers, underscores only')
      return
    }
    
    setSavingCode(true)
    setCodeError('')
    try {
      const res = await api.put(`/api/referrals/my-code?code=${encodeURIComponent(code)}`)
      setReferralCode(res.data.referral_code)
      setEditingCode(false)
    } catch (err) {
      setCodeError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSavingCode(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-dark-600 border-t-primary-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-950 pb-24 pt-4 px-4">
      <div className="max-w-lg mx-auto space-y-3">
        
        {/* Stats Bar */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 card p-3 text-center">
            <p className="text-xl font-bold text-dark-50">{stats?.total_referrals || 0}</p>
            <p className="text-[10px] text-dark-400">Referrals</p>
          </div>
          <div className="flex-1 card p-3 text-center">
            <p className="text-xl font-bold text-primary-400">${stats?.total_earnings?.toFixed(2) || '0.00'}</p>
            <p className="text-[10px] text-dark-400">Earned</p>
          </div>
          <div className="flex-1 card p-3 text-center">
            <p className="text-xl font-bold text-primary-400">{config?.referral_percent || 5}%</p>
            <p className="text-[10px] text-dark-400">Commission</p>
          </div>
        </motion.div>

        {/* Invite Code Card */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-4 relative overflow-hidden"
        >
          {/* Gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 to-primary-600" />
          
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary-500/20 flex items-center justify-center">
                <Gift size={14} className="text-primary-400" />
              </div>
              <span className="font-semibold text-sm">Your Invite Code</span>
            </div>
            {!editingCode && (
              <button 
                onClick={startEditingCode}
                className="text-[10px] text-dark-400 hover:text-dark-50 flex items-center gap-1 transition-colors"
              >
                <Edit3 size={10} />
                Edit
              </button>
            )}
          </div>
          
          {!editingCode ? (
            <>
              <div className="flex gap-2">
                <div 
                  onClick={copyCode}
                  className="flex-1 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl px-4 py-4 cursor-pointer transition-colors group"
                >
                  <p className="font-mono text-2xl text-dark-50 tracking-[0.15em] text-center font-bold group-hover:text-primary-400 transition-colors">
                    {referralCode}
                  </p>
                </div>
                <button
                  onClick={copyCode}
                  className={`px-4 rounded-xl font-medium flex items-center justify-center transition-all ${
                    copied 
                      ? 'bg-primary-500 text-white' 
                      : 'bg-primary-600 hover:bg-primary-500 text-white'
                  }`}
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
              <p className="text-dark-400 text-[10px] text-center mt-2">
                Tap code or button to copy • Friends enter this when signing up
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  placeholder="YOUR_CODE"
                  className="flex-1 bg-dark-800 border border-dark-600 focus:border-primary-500 rounded-xl px-4 py-3 text-dark-50 font-mono text-lg tracking-widest text-center uppercase outline-none"
                  maxLength={16}
                  autoFocus
                />
                <button
                  onClick={saveCustomCode}
                  disabled={savingCode}
                  className="px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white transition-colors disabled:opacity-50"
                >
                  {savingCode ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save size={20} />
                  )}
                </button>
              </div>
              {codeError && (
                <p className="text-red-400 text-xs text-center">{codeError}</p>
              )}
              <button 
                onClick={cancelEditingCode}
                className="w-full text-dark-400 hover:text-dark-50 text-xs py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </motion.div>

        {/* Rewards Info - Compact */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-primary-400" />
            <span className="text-xs font-medium text-dark-300">How It Works</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-dark-800/50 rounded-lg p-2.5 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                <DollarSign size={12} className="text-primary-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-dark-50">{config?.referral_percent || 5}% forever</p>
                <p className="text-[9px] text-dark-400">from all purchases</p>
              </div>
            </div>
            <div className="bg-dark-800/50 rounded-lg p-2.5 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                <Gift size={12} className="text-primary-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-dark-50">+{config?.first_deposit_bonus_percent || 10}% bonus</p>
                <p className="text-[9px] text-dark-400">on friend's 1st deposit</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Apply Code - only if not referred */}
        {!alreadyReferred && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card p-3"
          >
            <p className="text-xs text-dark-400 mb-2">Have an invite code?</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={applyCode}
                onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                className="flex-1 bg-dark-800 border border-dark-600 focus:border-primary-500 rounded-lg px-3 py-2 text-dark-50 font-mono text-sm text-center tracking-widest uppercase outline-none"
                maxLength={16}
              />
              <button
                onClick={handleApplyCode}
                disabled={applyStatus.status === 'loading' || !applyCode.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <AnimatePresence>
              {applyStatus.message && (
                <motion.p 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`mt-2 text-xs ${applyStatus.status === 'success' ? 'text-primary-400' : 'text-red-400'}`}
                >
                  {applyStatus.message}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Already referred */}
        {alreadyReferred && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-3 flex items-center gap-2"
          >
            <CheckCircle size={14} className="text-primary-400 flex-shrink-0" />
            <p className="text-primary-400 text-xs">
              Invite code applied! +{config?.first_deposit_bonus_percent || 10}% bonus on first deposit.
            </p>
          </motion.div>
        )}

        {/* Referrals List */}
        {referrals.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-dark-700 flex items-center justify-between">
              <span className="text-xs font-medium">Your Referrals</span>
              <span className="text-[10px] text-dark-400">{referrals.length}</span>
            </div>
            <div className="divide-y divide-dark-700/50 max-h-64 overflow-y-auto">
              {referrals.map((ref) => (
                <div key={ref.id} className="px-3 py-2.5 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center">
                    <UserPlus size={12} className="text-dark-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ref.referred_username || 'User'}</p>
                    <p className="text-[10px] text-dark-500">{new Date(ref.created_at).toLocaleDateString()}</p>
                  </div>
                  {ref.is_rewarded ? (
                    <span className="text-xs font-medium text-primary-400">+${ref.referrer_reward}</span>
                  ) : (
                    <span className="text-[10px] text-dark-400 flex items-center gap-1">
                      <Clock size={10} /> Pending
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {referrals.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center py-6"
          >
            <div className="w-10 h-10 mx-auto bg-dark-800 rounded-full flex items-center justify-center mb-2">
              <Users size={18} className="text-dark-500" />
            </div>
            <p className="text-dark-400 text-sm">No referrals yet</p>
            <p className="text-dark-500 text-[10px]">Share your code to start earning!</p>
          </motion.div>
        )}
        
      </div>
    </div>
  )
}
