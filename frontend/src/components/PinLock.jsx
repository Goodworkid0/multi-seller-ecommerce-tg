import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Delete, Fingerprint, ShieldCheck } from 'lucide-react'
import { useBrandingStore } from '../store/brandingStore'
import api from '../lib/api'

const PIN_LENGTH = 4
const MAX_LEN = 6

export default function PinLock({ onUnlock }) {
  const { appName, logoUrl } = useBrandingStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [success, setSuccess] = useState(false)
  const [pressedKey, setPressedKey] = useState(null)

  const handleDigit = useCallback((digit) => {
    if (pin.length >= MAX_LEN || loading || success) return
    const next = pin + digit
    setPin(next)
    setError('')
    setPressedKey(digit)
    setTimeout(() => setPressedKey(null), 120)
  }, [pin, loading, success])

  const handleDelete = useCallback(() => {
    if (loading || success) return
    setPin(p => p.slice(0, -1))
    setError('')
    setPressedKey('del')
    setTimeout(() => setPressedKey(null), 120)
  }, [loading, success])

  useEffect(() => {
    if (pin.length === MAX_LEN) verifyPin(pin)
  }, [pin])

  const verifyPin = async (pinValue) => {
    setLoading(true)
    try {
      await api.post('/api/auth/pin/verify', { pin: pinValue })
      sessionStorage.setItem('pin_verified', '1')
      setSuccess(true)
      setTimeout(() => onUnlock(), 600)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Invalid PIN')
      setPin('')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
    setLoading(false)
  }

  const handleSubmit = () => {
    if (pin.length >= PIN_LENGTH && !loading && !success) verifyPin(pin)
  }

  // Keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleDelete()
      else if (e.key === 'Enter') handleSubmit()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleDigit, handleDelete, pin])

  const dots = Array.from({ length: MAX_LEN }, (_, i) => i)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6 select-none"
    >
      {/* Logo / Brand */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="mb-6 text-center"
      >
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20"
            >
              <ShieldCheck size={36} className="text-white" />
            </motion.div>
          ) : (
            <motion.div key="logo" className="relative mx-auto mb-4">
              {logoUrl ? (
                <img src={logoUrl} alt={appName} className="w-20 h-20 rounded-2xl mx-auto object-cover shadow-lg shadow-primary-500/10" />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-primary-500/20">
                  <span className="text-3xl font-bold text-white">{appName?.[0] || ''}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center gap-2 justify-center mb-1">
            <Lock size={16} className={success ? 'text-emerald-400' : 'text-primary-400'} />
            <h2 className="text-lg font-semibold text-dark-50">
              {success ? 'Unlocked' : 'Enter PIN'}
            </h2>
          </div>
          <p className="text-dark-500 text-xs">
            {success ? 'Welcome back!' : `Enter your PIN to access ${appName}`}
          </p>
        </motion.div>
      </motion.div>

      {/* PIN dots */}
      <motion.div
        animate={shake ? { x: [-16, 16, -10, 10, -4, 4, 0] } : {}}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        className="flex gap-3 mb-2"
      >
        {dots.map((i) => {
          const filled = i < pin.length
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{
                scale: filled ? [1, 1.3, 1] : 1,
                backgroundColor: success
                  ? 'rgb(52, 211, 153)'
                  : filled
                    ? 'rgb(var(--color-primary-400))'
                    : 'rgb(38, 40, 48)',
              }}
              transition={{
                scale: { duration: 0.2, ease: 'easeOut' },
                backgroundColor: { duration: 0.15 }
              }}
              className={`w-3.5 h-3.5 rounded-full ${
                !filled && !success ? 'border border-dark-600' : ''
              } ${success ? 'shadow-sm shadow-emerald-400/30' : filled ? 'shadow-sm shadow-primary-400/20' : ''}`}
            />
          )
        })}
      </motion.div>

      {/* Error */}
      <div className="h-8 flex items-center justify-center">
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-red-400 text-xs font-medium"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Number pad */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className="grid grid-cols-3 gap-2.5 max-w-[260px] w-full"
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <motion.button
            key={n}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleDigit(String(n))}
            disabled={success}
            className={`h-[60px] rounded-2xl text-xl font-medium transition-all duration-100 ${
              pressedKey === String(n)
                ? 'bg-primary-500/20 text-primary-300 shadow-inner'
                : 'bg-dark-800/80 hover:bg-dark-700 text-dark-100'
            } disabled:opacity-30`}
          >
            {n}
          </motion.button>
        ))}

        {/* Fingerprint / Submit */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleSubmit}
          disabled={pin.length < PIN_LENGTH || loading || success}
          className="h-[60px] rounded-2xl bg-dark-800/80 hover:bg-dark-700 flex items-center justify-center transition-all disabled:opacity-20"
        >
          {loading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-dark-600 border-t-primary-400 rounded-full"
            />
          ) : (
            <Fingerprint size={22} className="text-primary-400" />
          )}
        </motion.button>

        {/* 0 */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleDigit('0')}
          disabled={success}
          className={`h-[60px] rounded-2xl text-xl font-medium transition-all duration-100 ${
            pressedKey === '0'
              ? 'bg-primary-500/20 text-primary-300'
              : 'bg-dark-800/80 hover:bg-dark-700 text-dark-100'
          } disabled:opacity-30`}
        >
          0
        </motion.button>

        {/* Delete */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleDelete}
          disabled={pin.length === 0 || success}
          className="h-[60px] rounded-2xl bg-dark-800/80 hover:bg-dark-700 flex items-center justify-center transition-all disabled:opacity-20"
        >
          <Delete size={22} className="text-dark-400" />
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
