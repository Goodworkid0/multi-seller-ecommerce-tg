import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, Edit2, Trash2, X, Briefcase, Clock, 
  DollarSign, Check, AlertCircle, Eye, EyeOff
} from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

const DELIVERY_OPTIONS = [
  '1 hour', '3 hours', '6 hours', '12 hours',
  '1 day', '2 days', '3 days', '5 days', '7 days', '14 days'
]

export default function SellerServices() {
  const { tgConfirm } = useAuthStore()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'other',
    price: '',
    delivery_time: '1 day',
    is_active: true
  })
  const [status, setStatus] = useState({ status: 'idle', message: '' })
  const [categories, setCategories] = useState([])

  useEffect(() => {
    loadServices()
    api.get('/api/services/categories').then(r => setCategories(r.data)).catch(() => {})
  }, [])

  const loadServices = async () => {
    try {
      const { data } = await api.get('/api/services/my')
      setServices(data)
    } catch (e) {
      console.error(e)
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingService(null)
    setForm({
      title: '',
      description: '',
      category: 'other',
      price: '',
      delivery_time: '1 day',
      is_active: true
    })
    setStatus({ status: 'idle', message: '' })
    setShowModal(true)
  }

  const openEditModal = (service) => {
    setEditingService(service)
    setForm({
      title: service.title,
      description: service.description || '',
      category: service.category || 'other',
      price: service.price.toString(),
      delivery_time: service.delivery_time || '1 day',
      is_active: service.is_active
    })
    setStatus({ status: 'idle', message: '' })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setStatus({ status: 'error', message: 'Title is required' })
      return
    }
    if (!form.price || parseFloat(form.price) <= 0) {
      setStatus({ status: 'error', message: 'Valid price is required' })
      return
    }

    setStatus({ status: 'loading', message: '' })

    try {
      const payload = {
        ...form,
        price: parseFloat(form.price)
      }

      if (editingService) {
        await api.put(`/api/services/${editingService.id}`, payload)
        setStatus({ status: 'success', message: 'Service updated!' })
      } else {
        await api.post('/api/services', payload)
        setStatus({ status: 'success', message: 'Service created!' })
      }

      setTimeout(() => {
        setShowModal(false)
        loadServices()
      }, 1000)
    } catch (e) {
      setStatus({ status: 'error', message: e.response?.data?.detail || 'Failed to save service' })
    }
  }

  const toggleActive = async (service) => {
    try {
      await api.patch(`/api/services/${service.id}/toggle`)
      loadServices()
    } catch (e) {
      console.error(e)
    }
  }

  const deleteService = async (service) => {
    if (!await tgConfirm('Delete this service?')) return
    try {
      await api.delete(`/api/services/${service.id}`)
      loadServices()
    } catch (e) {
      console.error(e)
    }
  }

  // Quick wins
  const hiddenServices = services.filter(s => !s.is_active)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Services</h1>
          <p className="text-xs text-dark-400">{services.length} services</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Quick Alert */}
      {hiddenServices.length > 0 && (
        <div className="bg-yellow-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
          <EyeOff size={14} className="text-yellow-400" />
          <div>
            <span className="text-sm font-bold text-yellow-400">{hiddenServices.length}</span>
            <span className="text-[11px] text-dark-400 ml-1">hidden services</span>
          </div>
        </div>
      )}

      {/* Services List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-3 animate-pulse">
              <div className="h-4 bg-dark-800 rounded w-1/3 mb-1" />
              <div className="h-3 bg-dark-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="card text-center py-8">
          <Briefcase size={32} className="mx-auto mb-3 text-dark-600" />
          <h3 className="font-semibold mb-1">No services yet</h3>
          <p className="text-dark-400 text-sm mb-3">Offer your skills and expertise</p>
          <button onClick={openCreateModal} className="btn-primary text-sm">
            Add Service
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {services.map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`card px-3 py-2.5 flex items-center gap-3 ${!service.is_active ? 'opacity-60' : ''}`}
            >
              {/* Service Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm truncate">{service.title}</h3>
                  {!service.is_active && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-700 text-dark-400">Hidden</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  <span className="text-primary-400 font-semibold">${service.price}</span>
                  <span className="text-dark-500 flex items-center gap-0.5">
                    <Clock size={10} />
                    {service.delivery_time}
                  </span>
                  <span className="text-dark-500">
                    {categories.find(c => c.id === service.category)?.name || service.category}
                  </span>
                </div>
              </div>

              {/* Actions - Inline */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleActive(service)}
                  className="p-1.5 rounded-lg hover:bg-dark-800 transition-colors"
                  title={service.is_active ? 'Hide' : 'Show'}
                >
                  {service.is_active ? <Eye size={14} className="text-primary-400" /> : <EyeOff size={14} className="text-dark-500" />}
                </button>
                <button
                  onClick={() => openEditModal(service)}
                  className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors"
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => deleteService(service)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-bold">
                    {editingService ? 'Edit Service' : 'Create Service'}
                  </h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-2 hover:bg-dark-800 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Title *</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g., Professional Logo Design"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe what you offer..."
                      className="input min-h-[100px] resize-none"
                      rows={4}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Category</label>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="input"
                      >
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Starting Price *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.price}
                          onChange={(e) => setForm({ ...form, price: e.target.value })}
                          placeholder="0.00"
                          className="input pl-7"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Delivery Time</label>
                    <select
                      value={form.delivery_time}
                      onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
                      className="input"
                    >
                      {DELIVERY_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-dark-600 text-primary-500 focus:ring-primary-500"
                    />
                    <label htmlFor="is_active" className="text-sm text-dark-400">
                      Visible to buyers
                    </label>
                  </div>

                  {status.message && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${
                      status.status === 'error' ? 'bg-red-500/10 text-red-400' :
                      status.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                      'bg-dark-800 text-dark-300'
                    }`}>
                      {status.status === 'error' && <AlertCircle size={16} />}
                      {status.status === 'success' && <Check size={16} />}
                      <span className="text-sm">{status.message}</span>
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={status.status === 'loading'}
                    className="w-full btn-primary"
                  >
                    {status.status === 'loading' ? 'Saving...' : editingService ? 'Update Service' : 'Create Service'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
