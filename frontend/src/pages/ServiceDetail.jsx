import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Star, Clock, User, Briefcase,
  MessageCircle, ShoppingCart, ChevronRight
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

export default function ServiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [service, setService] = useState(null)
  const [loading, setLoading] = useState(true)
  const [contactLoading, setContactLoading] = useState(false)
  const { user } = useAuthStore()

  useEffect(() => {
    loadService()
  }, [id])

  const loadService = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/services/${id}`)
      setService(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleContactSeller = async () => {
    if (!user) return
    setContactLoading(true)
    try {
      const { data } = await api.post('/api/dm/start', {
        recipient_id: service.seller_id,
        message: `Hi, I'm interested in your service: ${service.title} ($${service.price.toFixed(2)})`,
      })
      navigate(`/messages/${data.conversation_id}`)
    } catch (err) {
      console.error('Failed to start DM:', err)
    }
    setContactLoading(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse p-6">
          <div className="h-6 bg-dark-800 rounded w-3/4 mb-4" />
          <div className="h-4 bg-dark-800 rounded w-1/2 mb-2" />
          <div className="h-4 bg-dark-800 rounded w-full mb-2" />
          <div className="h-4 bg-dark-800 rounded w-2/3 mb-4" />
          <div className="h-10 bg-dark-800 rounded w-1/3" />
        </div>
      </div>
    )
  }

  if (!service) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-4">🔍</div>
        <h3 className="font-semibold mb-2">Service not found</h3>
        <p className="text-sm text-dark-400 mb-4">This service may have been removed or is no longer available.</p>
        <Link
          to="/services"
          className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm"
        >
          <ArrowLeft size={16} />
          Back to Services
        </Link>
      </div>
    )
  }

  const isOwn = user && user.id === service.seller_id

  return (
    <div className="space-y-4">
      {/* Back */}
      <Link
        to="/services"
        className="inline-flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-50 transition-colors"
      >
        <ChevronRight size={14} className="rotate-180" />
        Back to Services
      </Link>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center shrink-0">
            <Briefcase size={24} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-lg leading-tight">{service.title}</h1>
            {service.category && (
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] rounded-full bg-dark-800 text-dark-400">
                {service.category}
              </span>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 text-xs text-dark-400">
          {service.rating > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Star size={13} fill="currentColor" />
              {service.rating.toFixed(1)}
              <span className="text-dark-500">({service.review_count})</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {service.delivery_time}
          </span>
          {service.orders_count > 0 && (
            <span className="flex items-center gap-1">
              <ShoppingCart size={13} />
              {service.orders_count} order{service.orders_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Description */}
        {service.description && (
          <div>
            <h2 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-2">Description</h2>
            <p className="text-sm text-dark-300 whitespace-pre-wrap leading-relaxed">{service.description}</p>
          </div>
        )}

        {/* Price */}
        <div className="bg-dark-800/50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-dark-500 uppercase tracking-wider">Starting at</p>
            <p className="text-2xl font-bold text-primary-400">${service.price.toFixed(2)}</p>
          </div>
        </div>
      </motion.div>

      {/* Seller Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="card p-4"
      >
        <div className="flex items-center justify-between">
          <Link
            to={`/shop/${service.seller_id}`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/20 flex items-center justify-center">
              <User size={18} className="text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-medium">{service.seller_name}</p>
              <p className="text-[10px] text-dark-500">View shop</p>
            </div>
          </Link>
          {!isOwn && user && (
            <button
              onClick={handleContactSeller}
              disabled={contactLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-sm transition-colors disabled:opacity-50"
              title="Contact Seller"
            >
              <MessageCircle size={16} className="text-primary-400" />
              <span className="text-dark-200">Message</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
