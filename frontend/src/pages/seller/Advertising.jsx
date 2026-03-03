import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Image, DollarSign, Calendar, Clock, Check, X, 
  RefreshCw, Eye, Upload, AlertTriangle, Zap
} from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

const POSITION_LABELS = {
  above_categories: 'Premium Spotlight',
  above_wtb: 'Featured Banner',
  above_escrow: 'Trust Zone',
  above_vouches: 'Top Showcase',
  below_vouches: 'Discovery Zone'
}

const POSITION_DESC = {
  above_categories: 'Top of Home & Products',
  above_wtb: 'WTB section - Active buyers',
  above_escrow: 'Escrow area - Build trust',
  above_vouches: 'Above reviews section',
  below_vouches: 'Below reviews - High traffic'
}

const statusColors = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  expired: 'bg-dark-700 text-dark-400',
  cancelled: 'bg-red-500/15 text-red-400'
}

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'

export default function SellerAdvertising() {
  const { user, setUser } = useAuthStore()
  const [config, setConfig] = useState(null)
  const [myBookings, setMyBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBookForm, setShowBookForm] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState('')
  const [availability, setAvailability] = useState(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  
  // Form state
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    link: '',
    link_text: 'Learn More',
    starts_at: '',
    duration_days: 30
  })
  const [booking, setBooking] = useState({ status: 'idle', message: '' })
  const [uploadingId, setUploadingId] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [configRes, bookingsRes] = await Promise.all([
        api.get('/api/banners/slots/config'),
        api.get('/api/banners/my-bookings')
      ])
      setConfig(configRes.data)
      setMyBookings(bookingsRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const checkAvailability = async () => {
    if (!selectedPosition || !form.starts_at) return
    setCheckingAvailability(true)
    try {
      const { data } = await api.get('/api/banners/slots/availability', {
        params: {
          position: selectedPosition,
          starts_at: new Date(form.starts_at).toISOString()
        }
      })
      setAvailability(data)
    } catch (e) {
      setAvailability(null)
    } finally {
      setCheckingAvailability(false)
    }
  }

  useEffect(() => {
    if (selectedPosition && form.starts_at) {
      checkAvailability()
    } else {
      setAvailability(null)
    }
  }, [selectedPosition, form.starts_at])

  const handleBook = async (e) => {
    e.preventDefault()
    if (!selectedPosition || !form.title.trim() || !form.starts_at) {
      setBooking({ status: 'error', message: 'Fill all required fields' })
      return
    }
    if (!availability?.is_available) {
      setBooking({ status: 'error', message: 'This slot is not available' })
      return
    }
    setBooking({ status: 'loading', message: '' })
    try {
      const { data } = await api.post('/api/banners/slots/book', {
        ...form,
        position: selectedPosition,
        starts_at: new Date(form.starts_at).toISOString()
      })
      setBooking({ status: 'success', message: data.message })
      // Update user balance
      setUser({ ...user, balance: data.balance })
      // Reset form
      setForm({ title: '', subtitle: '', link: '', link_text: 'Learn More', starts_at: '', duration_days: 30 })
      setSelectedPosition('')
      setShowBookForm(false)
      loadData()
    } catch (e) {
      setBooking({ status: 'error', message: e?.response?.data?.detail || 'Booking failed' })
    }
  }

  const handleUpload = async (bookingId, file) => {
    setUploadingId(bookingId)
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.post(`/api/banners/my-bookings/${bookingId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      loadData()
    } catch (e) {
      alert(e?.response?.data?.detail || 'Upload failed')
    } finally {
      setUploadingId(null)
    }
  }

  // Set default start date to tomorrow
  const tomorrow = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 16)
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="card p-6 animate-pulse"><div className="h-8 bg-dark-800 rounded w-1/2" /></div>
        <div className="card p-6 animate-pulse"><div className="h-24 bg-dark-800 rounded" /></div>
      </div>
    )
  }

  const positions = config?.positions || {}
  const isEnabled = config?.enabled !== false

  // Quick wins
  const pendingApproval = myBookings.filter(b => !b.is_approved && b.status === 'pending')
  const activeBookings = myBookings.filter(b => b.status === 'active')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Advertising</h1>
          <p className="text-xs text-dark-400">{myBookings.length} bookings</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-dark-400">Balance</span>
          <p className="text-sm font-bold text-emerald-400">${(user?.balance || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Quick Alerts */}
      {pendingApproval.length > 0 && (
        <div className="bg-yellow-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
          <Clock size={14} className="text-yellow-400" />
          <div>
            <span className="text-sm font-bold text-yellow-400">{pendingApproval.length}</span>
            <span className="text-[11px] text-dark-400 ml-1">awaiting approval</span>
          </div>
        </div>
      )}

      {!isEnabled && (
        <div className="bg-amber-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-xs text-amber-400">Banner purchases are currently disabled</span>
        </div>
      )}

      {/* Banner Size Guide */}
      <div className="bg-primary-500/5 rounded-lg p-2.5 border border-primary-500/10">
        <p className="text-[10px] text-primary-400 font-medium mb-1">{'\uD83D\uDDBC\uFE0F'} Banner Image Guide</p>
        <div className="text-[10px] text-dark-300 space-y-0.5">
          <p>Recommended size: <span className="text-white font-semibold">864 × 200 px</span> (4.32:1 ratio)</p>
          <p>Accepted formats: <span className="text-white font-medium">GIF, PNG, JPG, WebP</span> · Max 5 MB</p>
          <p className="text-dark-500">GIFs will animate automatically. Images scale to full container width.</p>
        </div>
      </div>

      {/* Available Slots */}
      {isEnabled && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-dark-400 flex items-center gap-1.5">
              <Zap size={12} /> Available Slots
            </h2>
            <button
              onClick={() => { setShowBookForm(!showBookForm); setSelectedPosition(''); setAvailability(null); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                showBookForm ? 'bg-dark-700 text-dark-300' : 'bg-primary-500/20 text-primary-400 hover:bg-primary-500/30'
              }`}
            >
              {showBookForm ? 'Cancel' : '+ Book'}
            </button>
          </div>

          {/* Slot Pricing Cards */}
          <div className="space-y-1.5">
            {Object.entries(positions).map(([key, pos]) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => { if (!showBookForm) { setShowBookForm(true); setSelectedPosition(key); setForm(f => ({ ...f, starts_at: tomorrow() })); } }}
                className={`card px-3 py-2.5 cursor-pointer transition-all ${
                  showBookForm && selectedPosition === key 
                    ? 'ring-1 ring-primary-500/50 bg-primary-500/5' 
                    : 'hover:bg-dark-800/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium">{POSITION_LABELS[key] || key}</h3>
                    <div className="text-[10px] text-dark-500 mt-0.5">
                      {POSITION_DESC[key]} · {pos.max_active} slots
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-primary-400">${pos.price || pos.price_30d}</div>
                    <div className="text-[9px] text-dark-500">per month</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Booking Form */}
          <AnimatePresence>
            {showBookForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <form onSubmit={handleBook} className="card p-3 mt-2 space-y-2.5">
                  <h3 className="text-xs font-semibold text-dark-300">Book a Slot</h3>
                  
                  {/* Position Select */}
                  <select
                    value={selectedPosition}
                    onChange={e => setSelectedPosition(e.target.value)}
                    className="input py-1.5 text-xs w-full"
                  >
                    <option value="">Select position...</option>
                    {Object.entries(positions).map(([key, pos]) => (
                      <option key={key} value={key}>{POSITION_LABELS[key]} - ${pos.price || pos.price_30d}</option>
                    ))}
                  </select>

                  {/* Title & Subtitle */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      className="input py-1.5 text-xs flex-1"
                      placeholder="Title *"
                      maxLength={100}
                    />
                    <input
                      type="text"
                      value={form.subtitle}
                      onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                      className="input py-1.5 text-xs flex-1"
                      placeholder="Subtitle"
                      maxLength={200}
                    />
                  </div>

                  {/* Link */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.link}
                      onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                      className="input py-1.5 text-xs flex-1"
                      placeholder="Link URL"
                    />
                    <input
                      type="text"
                      value={form.link_text}
                      onChange={e => setForm(f => ({ ...f, link_text: e.target.value }))}
                      className="input py-1.5 text-xs w-24"
                      placeholder="Button"
                    />
                  </div>

                  {/* Start Date (30-day duration) */}
                  <div>
                    <label className="text-[10px] text-dark-500 mb-0.5 block">Start Date (30-day booking)</label>
                    <input
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                      className="input py-1.5 text-xs w-full"
                      min={tomorrow().slice(0, 16)}
                    />
                  </div>

                  {/* Availability Check */}
                  {checkingAvailability && (
                    <div className="flex items-center gap-2 text-dark-400 text-xs">
                      <RefreshCw size={12} className="animate-spin" /> Checking...
                    </div>
                  )}
                  {availability && !checkingAvailability && (
                    <div className={`p-2 rounded-lg text-xs flex items-center justify-between ${
                      availability.is_available 
                        ? 'bg-emerald-500/10' 
                        : 'bg-red-500/10'
                    }`}>
                      {availability.is_available ? (
                        <>
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Check size={12} />
                            Available ({availability.current_count}/{availability.max_allowed})
                          </span>
                          <span className="font-bold text-emerald-300">${availability.price}</span>
                        </>
                      ) : (
                        <span className="text-red-400 flex items-center gap-1">
                          <X size={12} />
                          Fully booked
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status message */}
                  {booking.status !== 'idle' && booking.status !== 'loading' && (
                    <div className={`text-xs ${booking.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {booking.message}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={!availability?.is_available || booking.status === 'loading'}
                    className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {booking.status === 'loading' ? (
                      <><RefreshCw size={12} className="animate-spin" /> Processing...</>
                    ) : (
                      <><DollarSign size={12} /> Book for ${availability?.price || '...'}</>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* My Bookings */}
      <section>
        <h2 className="text-xs font-semibold text-dark-400 mb-2 flex items-center gap-1.5">
          <Calendar size={12} /> My Bookings
        </h2>
        {myBookings.length === 0 ? (
          <div className="card text-center py-6">
            <Image size={24} className="mx-auto text-dark-600 mb-2" />
            <p className="text-dark-500 text-sm">No bookings yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {myBookings.map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card px-3 py-2.5 flex items-center gap-3"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{b.title}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColors[b.status]}`}>{b.status}</span>
                    {!b.is_approved && b.status === 'pending' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">Pending</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                    <span className="text-dark-400">{POSITION_LABELS[b.position]}</span>
                    <span className="text-dark-500">{formatDate(b.starts_at)}</span>
                    <span className="text-emerald-400 font-medium">${b.price_paid.toFixed(2)}</span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1">
                  <label className="p-1.5 rounded-lg hover:bg-dark-800 text-yellow-400 cursor-pointer transition-colors" title="Upload GIF/Image (864×200px recommended)">
                    <Upload size={14} />
                    <input
                      type="file"
                      accept="image/gif,image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && handleUpload(b.id, e.target.files[0])}
                      disabled={uploadingId === b.id}
                    />
                  </label>
                  {b.image_url && (
                    <a href={/^https?:\/\//i.test(b.image_url) ? b.image_url : '#'} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors" title="View">
                      <Eye size={14} />
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
