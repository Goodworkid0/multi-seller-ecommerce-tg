import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gift, X, Sparkles, ArrowRight, Check } from 'lucide-react'
import api from '../lib/api'
import { useBrandingStore } from '../store/brandingStore'

const STORAGE_KEY = 'referral_modal_dismissed'

export default function ReferralWelcomeModal({ userId }) {
  const [show, setShow] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null) // null | 'success' | 'error'
  const [message, setMessage] = useState('')
  const [bonusPercent, setBonusPercent] = useState(10)
  const { branding } = useBrandingStore()

  useEffect(() => {
    if (!userId) return
    checkIfShouldShow()
  }, [userId])

  const checkIfShouldShow = async () => {
    // Check if already dismissed for this user
    const dismissed = localStorage.getItem(`${STORAGE_KEY}_${userId}`)
    if (dismissed) return

    try {
      // Check if user already has a referrer
      const res = await api.get('/api/referrals/check-referrer')
      if (res.data.has_referrer) {
        // Already referred, don't show modal
        localStorage.setItem(`${STORAGE_KEY}_${userId}`, 'true')
        return
      }

      // Get referral config for bonus percent
      const configRes = await api.get('/api/referrals/config')
      if (configRes.data?.first_deposit_bonus_percent) {
        setBonusPercent(configRes.data.first_deposit_bonus_percent)
      }
      if (!configRes.data?.enabled) {
        // Referrals disabled
        return
      }

      // Show the modal
      setShow(true)
    } catch (err) {
      console.error('Failed to check referral status:', err)
    }
  }

  const handleApply = async () => {
    if (!code.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      const res = await api.post(`/api/referrals/apply/${code.trim().toUpperCase()}`)
      setStatus('success')
      setMessage(res.data.message || `Code applied! +${bonusPercent}% bonus on first deposit!`)
      // Dismiss after success
      setTimeout(() => {
        dismiss()
      }, 2000)
    } catch (err) {
      setStatus('error')
      setMessage(err.response?.data?.detail || 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  const dismiss = () => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, 'true')
    setShow(false)
  }

  const skip = () => {
    dismiss()
  }

  const accent = branding?.accent_color || '#ec4899'

  if (!show) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center px-4"
        onClick={(e) => e.target === e.currentTarget && skip()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-dark-800 rounded-2xl p-5 w-full max-w-sm border border-dark-700 shadow-2xl relative overflow-hidden"
        >
          {/* Gradient background effect */}
          <div 
            className="absolute top-0 left-0 right-0 h-24 opacity-20 blur-2xl"
            style={{ background: `linear-gradient(to bottom, ${accent}, transparent)` }}
          />

          {/* Close button */}
          <button
            onClick={skip}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-dark-700/50 hover:bg-dark-600 transition-colors text-dark-400 hover:text-dark-50 z-10"
          >
            <X size={16} />
          </button>

          {/* Content */}
          <div className="relative z-10">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div 
                className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
                style={{ background: `${accent}20` }}
              >
                <Gift size={28} style={{ color: accent }} />
                <Sparkles 
                  size={14} 
                  className="absolute -top-1 -right-1 text-yellow-400 animate-pulse" 
                />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-center text-dark-50 mb-1">
              Welcome! 🎉
            </h2>
            <p className="text-dark-400 text-center text-sm mb-5">
              Have an invite code? Enter it to get{' '}
              <span className="font-semibold" style={{ color: accent }}>
                +{bonusPercent}% bonus
              </span>{' '}
              on your first deposit!
            </p>

            {/* Input */}
            {status !== 'success' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter invite code..."
                  className="w-full bg-dark-900 text-dark-50 text-center text-lg tracking-widest px-4 py-3 rounded-xl border border-dark-600 focus:border-primary-500 outline-none uppercase font-mono placeholder:text-dark-500 placeholder:text-sm placeholder:tracking-normal placeholder:font-normal"
                  autoFocus
                  maxLength={12}
                  onKeyDown={e => e.key === 'Enter' && handleApply()}
                />

                {/* Error message */}
                {status === 'error' && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs text-center"
                  >
                    {message}
                  </motion.p>
                )}

                {/* Apply button */}
                <button
                  onClick={handleApply}
                  disabled={loading || !code.trim()}
                  className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  style={{ background: accent }}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Apply Code
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                {/* Skip link */}
                <button
                  onClick={skip}
                  className="w-full text-dark-400 hover:text-dark-300 text-sm py-2 transition-colors"
                >
                  I don't have a code, skip
                </button>
              </div>
            )}

            {/* Success state */}
            {status === 'success' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                  <Check size={32} className="text-emerald-400" />
                </div>
                <p className="text-emerald-400 font-semibold">{message}</p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
