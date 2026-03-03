import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, Package, Edit2, Trash2, Key, X, Upload,
  Check, AlertCircle, FileUp, Eye, Copy, Tag, Layers, ImagePlus, Trash, Shield
} from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

export default function SellerProducts() {
  const { tgConfirm } = useAuthStore()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showKeysModal, setShowKeysModal] = useState(false)
  const [showViewKeysModal, setShowViewKeysModal] = useState(false)
  const [showVariantsModal, setShowVariantsModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [stockKeys, setStockKeys] = useState([])
  const [predefinedTags, setPredefinedTags] = useState([])
  const [customTagInput, setCustomTagInput] = useState('')
  const [variants, setVariants] = useState([])
  const [variantForm, setVariantForm] = useState({ name: '', price: '' })
  const [editingVariant, setEditingVariant] = useState(null)
  const [variantKeysInput, setVariantKeysInput] = useState('')
  const [selectedVariantForKeys, setSelectedVariantForKeys] = useState(null)
  const [productVariantsForKeys, setProductVariantsForKeys] = useState([])
  const [selectedVariantForAddKeys, setSelectedVariantForAddKeys] = useState(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    tags: [],
    bulk_discounts: [],
    warranty_hours: 48
  })

  const [keysInput, setKeysInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [productsRes, tagsRes] = await Promise.all([
        api.get('/api/sellers/products'),
        api.get('/api/products/predefined-tags')
      ])
      setProducts(productsRes.data)
      setPredefinedTags(tagsRes.data.map(t => t.name))
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        tags: form.tags.length > 0 ? form.tags : null,
        bulk_discounts: form.bulk_discounts.length > 0 
          ? form.bulk_discounts.filter(t => t.min_qty && t.discount_pct).map(t => ({
              min_qty: parseInt(t.min_qty),
              discount_pct: parseFloat(t.discount_pct)
            }))
          : null
      }

      let productId = selectedProduct?.id
      if (selectedProduct) {
        await api.put(`/api/products/${selectedProduct.id}`, payload)
      } else {
        const { data } = await api.post('/api/products', payload)
        productId = data.id
      }

      // Upload image if a new file was selected
      if (imageFile && productId) {
        const fd = new FormData()
        fd.append('file', imageFile)
        await api.post(`/api/products/${productId}/image`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      setShowModal(false)
      setSelectedProduct(null)
      setForm({
        name: '', description: '', price: '',
        tags: [], bulk_discounts: []
      })
      setCustomTagInput('')
      setImageFile(null)
      setImagePreview(null)
      loadData()
    } catch (error) {
      console.error(error)
      alert(error.response?.data?.detail || 'Error saving product')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddKeys = async (e) => {
    e.preventDefault()
    if (!selectedProduct || !keysInput.trim()) return

    setSubmitting(true)
    try {
      const keys = keysInput.split('\n').map(k => k.trim()).filter(k => k)
      
      // Use variant endpoint if variant is selected
      if (selectedVariantForAddKeys) {
        await api.post(`/api/products/${selectedProduct.id}/variants/${selectedVariantForAddKeys.id}/keys`, { keys })
      } else {
        await api.post(`/api/products/${selectedProduct.id}/keys`, { keys })
      }
      
      setShowKeysModal(false)
      setKeysInput('')
      setSelectedProduct(null)
      setSelectedVariantForAddKeys(null)
      setProductVariantsForKeys([])
      loadData()
    } catch (error) {
      console.error(error)
      alert(error.response?.data?.detail || 'Error adding keys')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedProduct) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      // Use variant endpoint if variant is selected
      if (selectedVariantForAddKeys) {
        await api.post(`/api/products/${selectedProduct.id}/variants/${selectedVariantForAddKeys.id}/keys/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      } else {
        await api.post(`/api/products/${selectedProduct.id}/keys/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }
      setShowKeysModal(false)
      setKeysInput('')
      setSelectedProduct(null)
      setSelectedVariantForAddKeys(null)
      setProductVariantsForKeys([])
      loadData()
    } catch (error) {
      console.error(error)
      alert(error.response?.data?.detail || 'Error uploading file')
    } finally {
      setSubmitting(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (product) => {
    if (!await tgConfirm('Are you sure you want to delete this product?')) return

    try {
      await api.delete(`/api/products/${product.id}`)
      loadData()
    } catch (error) {
      console.error(error)
    }
  }

  const openEdit = (product) => {
    setSelectedProduct(product)
    // Parse tags from product — could be JSON array or legacy platform
    let productTags = []
    if (product.tags && Array.isArray(product.tags)) {
      productTags = product.tags
    } else if (product.platform) {
      productTags = [product.platform]
    }
    setForm({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      tags: productTags,
      bulk_discounts: (product.bulk_discounts || []).map(t => ({
        min_qty: t.min_qty.toString(),
        discount_pct: t.discount_pct.toString()
      })),
      warranty_hours: product.warranty_hours ?? 48
    })
    setCustomTagInput('')
    setImageFile(null)
    setImagePreview(product.image_url || null)
    setShowModal(true)
  }

  const openAddKeys = async (product) => {
    setSelectedProduct(product)
    setSelectedVariantForAddKeys(null)
    setShowKeysModal(true)
    
    // Load variants for this product
    try {
      const { data } = await api.get(`/api/products/${product.id}/variants`)
      setProductVariantsForKeys(data || [])
    } catch {
      setProductVariantsForKeys([])
    }
  }

  const openViewKeys = async (product) => {
    setSelectedProduct(product)
    setShowViewKeysModal(true)
    try {
      const { data } = await api.get(`/api/products/${product.id}/keys`)
      setStockKeys(data)
    } catch {
      setStockKeys([])
    }
  }

  const deleteKey = async (keyId) => {
    if (!selectedProduct) return
    try {
      await api.delete(`/api/products/${selectedProduct.id}/keys/${keyId}`)
      setStockKeys(prev => prev.filter(k => k.id !== keyId))
      loadData()
    } catch (error) {
      alert(error.response?.data?.detail || 'Error deleting key')
    }
  }

  const copyKey = (val) => {
    navigator.clipboard.writeText(val)
  }

  // ========== Variants Functions ==========
  const openVariants = async (product) => {
    setSelectedProduct(product)
    setShowVariantsModal(true)
    setVariantForm({ name: '', price: '' })
    setEditingVariant(null)
    setSelectedVariantForKeys(null)
    setVariantKeysInput('')
    try {
      const { data } = await api.get(`/api/products/${product.id}/variants`)
      setVariants(data)
    } catch {
      setVariants([])
    }
  }

  const handleAddVariant = async (e) => {
    e.preventDefault()
    if (!variantForm.name || !variantForm.price) return
    setSubmitting(true)
    try {
      if (editingVariant) {
        await api.put(`/api/products/${selectedProduct.id}/variants/${editingVariant.id}`, {
          name: variantForm.name,
          price: parseFloat(variantForm.price)
        })
      } else {
        await api.post(`/api/products/${selectedProduct.id}/variants`, {
          name: variantForm.name,
          price: parseFloat(variantForm.price)
        })
      }
      setVariantForm({ name: '', price: '' })
      setEditingVariant(null)
      const { data } = await api.get(`/api/products/${selectedProduct.id}/variants`)
      setVariants(data)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error saving variant')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteVariant = async (variantId) => {
    if (!await tgConfirm('Delete this variant?')) return
    try {
      await api.delete(`/api/products/${selectedProduct.id}/variants/${variantId}`)
      setVariants(prev => prev.filter(v => v.id !== variantId))
    } catch (err) {
      alert(err.response?.data?.detail || 'Error deleting variant')
    }
  }

  const handleAddKeysToVariant = async () => {
    if (!selectedVariantForKeys || !variantKeysInput.trim()) return
    setSubmitting(true)
    try {
      const keys = variantKeysInput.split('\n').map(k => k.trim()).filter(k => k)
      await api.post(`/api/products/${selectedProduct.id}/variants/${selectedVariantForKeys.id}/keys`, { keys })
      setVariantKeysInput('')
      setSelectedVariantForKeys(null)
      // Refresh variants to get updated stock counts
      const { data } = await api.get(`/api/products/${selectedProduct.id}/variants`)
      setVariants(data)
      loadData() // Refresh product list too
    } catch (err) {
      alert(err.response?.data?.detail || 'Error adding keys')
    } finally {
      setSubmitting(false)
    }
  }



  // Quick wins
  const outOfStock = products.filter(p => p.stock_count === 0)
  const lowStock = products.filter(p => p.stock_count > 0 && p.stock_count < 5)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">Products</h1>
          <p className="text-xs text-dark-400">{products.length} products</p>
        </div>
        <button
          onClick={() => { setSelectedProduct(null); setForm({ name: '', description: '', price: '', tags: [], bulk_discounts: [], warranty_hours: 48 }); setImageFile(null); setImagePreview(null); setShowModal(true) }}
          className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Quick Alerts */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div className="flex gap-2">
          {outOfStock.length > 0 && (
            <div className="flex-1 bg-red-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
              <Package size={14} className="text-red-400" />
              <div>
                <span className="text-sm font-bold text-red-400">{outOfStock.length}</span>
                <p className="text-[9px] text-dark-400">Out of Stock</p>
              </div>
            </div>
          )}
          {lowStock.length > 0 && (
            <div className="flex-1 bg-yellow-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
              <Package size={14} className="text-yellow-400" />
              <div>
                <span className="text-sm font-bold text-yellow-400">{lowStock.length}</span>
                <p className="text-[9px] text-dark-400">Low Stock</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Products List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-3 animate-pulse">
              <div className="h-4 bg-dark-800 rounded w-1/3 mb-1" />
              <div className="h-3 bg-dark-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card text-center py-8">
          <Package size={32} className="mx-auto mb-3 text-dark-600" />
          <h3 className="font-semibold mb-1">No products yet</h3>
          <p className="text-dark-400 text-sm mb-3">Start by adding your first product</p>
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm">
            Add Product
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card px-3 py-2.5 flex items-center gap-3"
            >
              {/* Product Image Thumbnail */}
              {product.image_url ? (
                <img src={product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-dark-700" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center shrink-0 border border-dark-700">
                  <Package size={16} className="text-dark-600" />
                </div>
              )}
              {/* Product Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm truncate">{product.name}</h3>
                  {!product.is_active && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-700 text-dark-400">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  <span className="text-primary-400 font-semibold">${product.price.toFixed(2)}</span>
                  <span className={`font-medium ${product.stock_count === 0 ? 'text-red-400' : product.stock_count < 5 ? 'text-yellow-400' : 'text-dark-400'}`}>
                    {product.stock_count} stock
                  </span>
                  <span className="text-dark-500">{product.sales_count} sold</span>
                  {product.warranty_hours > 0 ? (
                    <span className="text-emerald-400 flex items-center gap-0.5"><Shield size={9} />{product.warranty_hours < 24 ? `${product.warranty_hours}h` : `${Math.round(product.warranty_hours / 24)}d`}</span>
                  ) : (
                    <span className="text-dark-500">No warranty</span>
                  )}
                </div>
              </div>

              {/* Actions - Inline */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openAddKeys(product)}
                  className="p-1.5 rounded-lg hover:bg-dark-800 text-yellow-400 transition-colors"
                  title="Add Keys"
                >
                  <Key size={14} />
                </button>
                <button
                  onClick={() => openVariants(product)}
                  className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors"
                  title="Variants"
                >
                  <Layers size={14} />
                </button>
                <button
                  onClick={() => openViewKeys(product)}
                  className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors"
                  title="View Stock"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={() => openEdit(product)}
                  className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors"
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(product)}
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

      {/* Add/Edit Product Modal */}
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-xl font-bold">
                  {selectedProduct ? 'Edit Product' : 'Add Product'}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-dark-800 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-dark-400 mb-1">Product Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-dark-400 mb-1">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input min-h-[100px]"
                    required
                  />
                </div>

                {/* Product Image */}
                <div>
                  <label className="block text-sm text-dark-400 mb-1">
                    Product Image <span className="text-dark-500">(optional)</span>
                  </label>
                  {imagePreview ? (
                    <div className="relative group w-full">
                      <img
                        src={imageFile ? imagePreview : imagePreview}
                        alt="Product"
                        className="w-full h-36 object-cover rounded-lg border border-dark-700"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                        <label className="p-2 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
                          <ImagePlus size={16} className="text-primary-400" />
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) {
                                setImageFile(f)
                                setImagePreview(URL.createObjectURL(f))
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={async () => {
                            if (selectedProduct?.id && selectedProduct?.image_url) {
                              try {
                                await api.delete(`/api/products/${selectedProduct.id}/image`)
                              } catch {}
                            }
                            setImageFile(null)
                            setImagePreview(null)
                          }}
                          className="p-2 bg-dark-800 rounded-lg hover:bg-red-500/20 transition-colors"
                        >
                          <Trash size={16} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-28 rounded-lg border-2 border-dashed border-dark-700 hover:border-primary-500/50 cursor-pointer transition-colors bg-dark-800/30">
                      <ImagePlus size={24} className="text-dark-500 mb-1" />
                      <span className="text-xs text-dark-500">Click to upload image</span>
                      <span className="text-[10px] text-dark-600 mt-0.5">PNG, JPG, WebP, GIF · Max 5MB</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) {
                            if (f.size > 5 * 1024 * 1024) {
                              alert('Image too large (max 5MB)')
                              return
                            }
                            setImageFile(f)
                            setImagePreview(URL.createObjectURL(f))
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                </div>

                {/* Warranty Period */}
                <div>
                  <label className="block text-sm text-dark-400 mb-1 flex items-center gap-1.5">
                    <Shield size={13} className="text-emerald-400" />
                    Warranty Period
                  </label>
                  <select
                    value={form.warranty_hours}
                    onChange={(e) => setForm({ ...form, warranty_hours: parseInt(e.target.value) })}
                    className="input"
                  >
                    <option value={0}>No Warranty</option>
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={12}>12 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={48}>48 hours (default)</option>
                    <option value={72}>72 hours</option>
                    <option value={168}>7 days</option>
                    <option value={336}>14 days</option>
                    <option value={720}>30 days</option>
                  </select>
                  <p className="text-[10px] text-dark-500 mt-1">
                    {form.warranty_hours === 0
                      ? 'Buyer cannot request refund. They can still rate & report.'
                      : `Buyer can report issues within ${form.warranty_hours < 24 ? form.warranty_hours + 'h' : Math.round(form.warranty_hours / 24) + ' day(s)'} of delivery.`
                    }
                  </p>
                </div>

                {/* Bulk Discount Tiers */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">
                    Bulk Discounts <span className="text-dark-500">(optional)</span>
                  </label>
                  {form.bulk_discounts.map((tier, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <input
                        type="number"
                        placeholder="Min qty"
                        value={tier.min_qty}
                        onChange={(e) => {
                          const updated = [...form.bulk_discounts]
                          updated[i] = { ...updated[i], min_qty: e.target.value }
                          setForm({ ...form, bulk_discounts: updated })
                        }}
                        className="input flex-1"
                        min="2"
                      />
                      <input
                        type="number"
                        placeholder="Discount %"
                        value={tier.discount_pct}
                        onChange={(e) => {
                          const updated = [...form.bulk_discounts]
                          updated[i] = { ...updated[i], discount_pct: e.target.value }
                          setForm({ ...form, bulk_discounts: updated })
                        }}
                        className="input flex-1"
                        min="1"
                        max="99"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = form.bulk_discounts.filter((_, j) => j !== i)
                          setForm({ ...form, bulk_discounts: updated })
                        }}
                        className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg shrink-0"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, bulk_discounts: [...form.bulk_discounts, { min_qty: '', discount_pct: '' }] })}
                    className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                  >
                    <Plus size={14} /> Add tier
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-dark-400 mb-1">
                    Tags <span className="text-dark-500">(up to 5)</span>
                  </label>
                  {/* Selected tags */}
                  {form.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {form.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-primary-500/20 text-primary-300 border border-primary-500/30"
                        >
                          <Tag size={10} />
                          {tag}
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, tags: form.tags.filter(t => t !== tag) })}
                            className="ml-0.5 hover:text-red-400 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Predefined tags */}
                  {form.tags.length < 5 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {predefinedTags
                        .filter(tag => !form.tags.includes(tag))
                        .map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              if (form.tags.length < 5) {
                                setForm({ ...form, tags: [...form.tags, tag] })
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs transition-colors bg-dark-800 text-dark-300 hover:bg-dark-700"
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                  )}
                  {/* Custom tag input */}
                  {form.tags.length < 5 && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const val = customTagInput.trim()
                            if (val && !form.tags.includes(val) && form.tags.length < 5) {
                              setForm({ ...form, tags: [...form.tags, val] })
                              setCustomTagInput('')
                            }
                          }
                        }}
                        className="input flex-1"
                        placeholder="Type a custom tag & press Enter..."
                        maxLength={50}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = customTagInput.trim()
                          if (val && !form.tags.includes(val) && form.tags.length < 5) {
                            setForm({ ...form, tags: [...form.tags, val] })
                            setCustomTagInput('')
                          }
                        }}
                        disabled={!customTagInput.trim() || form.tags.length >= 5}
                        className="btn-secondary px-3 shrink-0"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                  {form.tags.length >= 5 && (
                    <p className="text-xs text-yellow-400 mt-1">Maximum 5 tags reached</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check size={18} />
                      {selectedProduct ? 'Update Product' : 'Create Product'}
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Keys Modal */}
      <AnimatePresence>
        {showKeysModal && selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowKeysModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-xl font-bold">Add Keys</h2>
                  <p className="text-sm text-dark-400">{selectedProduct.name}</p>
                </div>
                <button onClick={() => setShowKeysModal(false)} className="p-2 hover:bg-dark-800 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              {/* Variant Selector */}
              {productVariantsForKeys.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm text-dark-400 mb-1.5">
                    Select variant (required)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {productVariantsForKeys.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariantForAddKeys(v)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selectedVariantForAddKeys?.id === v.id
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700 hover:border-dark-600'
                        }`}
                      >
                        <p className="font-medium text-sm">{v.name}</p>
                        <p className="text-xs text-dark-400">${v.price} · {v.stock_count} in stock</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleAddKeys} className="space-y-4">
                <div>
                  <label className="block text-sm text-dark-400 mb-1">
                    Enter keys (one per line)
                  </label>
                  <textarea
                    value={keysInput}
                    onChange={(e) => setKeysInput(e.target.value)}
                    className="input min-h-[160px] font-mono text-sm"
                    placeholder="XXXXX-XXXXX-XXXXX&#10;YYYYY-YYYYY-YYYYY&#10;ZZZZZ-ZZZZZ-ZZZZZ"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    {keysInput.split('\n').filter(k => k.trim()).length} keys entered
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !keysInput.trim() || (productVariantsForKeys.length > 0 && !selectedVariantForAddKeys)}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload size={18} />
                      Add Keys{selectedVariantForAddKeys ? ` to ${selectedVariantForAddKeys.name}` : ''}
                    </>
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-dark-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-dark-900 text-dark-500">or upload file</span>
                  </div>
                </div>

                <label className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-dark-600 hover:border-primary-500/50 hover:bg-dark-800/50 transition-colors cursor-pointer ${submitting ? 'opacity-50 pointer-events-none' : ''}`}>
                  <FileUp size={18} className="text-primary-400" />
                  <span className="text-sm">Upload CSV or JSON</span>
                  <input
                    type="file"
                    accept=".csv,.json,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={submitting}
                  />
                </label>
                <p className="text-[10px] text-dark-500 text-center -mt-2">
                  CSV: one key per cell · JSON: ["key1","key2"] or {`{"keys": [...]}`}
                </p>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Keys Modal */}
      <AnimatePresence>
        {showViewKeysModal && selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowViewKeysModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-xl font-bold">Stock Keys</h2>
                  <p className="text-sm text-dark-400">{selectedProduct.name} — {stockKeys.length} keys</p>
                </div>
                <button onClick={() => setShowViewKeysModal(false)} className="p-2 hover:bg-dark-800 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
                {stockKeys.length === 0 ? (
                  <div className="text-center py-8">
                    <Package size={32} className="mx-auto text-dark-600 mb-2" />
                    <p className="text-dark-400 text-sm">No keys in stock</p>
                  </div>
                ) : (
                  stockKeys.map((k) => (
                    <div key={k.id} className="flex items-center gap-2 p-2.5 bg-dark-800/50 rounded-lg group">
                      <code className="flex-1 text-xs font-mono text-dark-200 truncate">{k.key_value}</code>
                      <button
                        onClick={() => copyKey(k.key_value)}
                        className="p-1.5 rounded-lg text-dark-500 hover:text-dark-50 hover:bg-dark-700 opacity-0 group-hover:opacity-100 transition-all"
                        title="Copy"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => deleteKey(k.id)}
                        className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Variants Modal */}
      <AnimatePresence>
        {showVariantsModal && selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowVariantsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-xl font-bold">Product Variants</h2>
                  <p className="text-sm text-dark-400">{selectedProduct.name}</p>
                </div>
                <button onClick={() => setShowVariantsModal(false)} className="p-2 hover:bg-dark-800 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              {/* Add/Edit Variant Form */}
              <form onSubmit={handleAddVariant} className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={variantForm.name}
                  onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                  placeholder="Variant name (e.g., Deluxe Edition)"
                  className="input flex-1"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  value={variantForm.price}
                  onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })}
                  placeholder="Price"
                  className="input w-24"
                  required
                />
                <button type="submit" disabled={submitting} className="btn-primary px-4">
                  {editingVariant ? 'Update' : 'Add'}
                </button>
                {editingVariant && (
                  <button
                    type="button"
                    onClick={() => { setEditingVariant(null); setVariantForm({ name: '', price: '' }) }}
                    className="btn-secondary px-3"
                  >
                    Cancel
                  </button>
                )}
              </form>

              {/* Variants List */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {variants.length === 0 ? (
                  <div className="text-center py-8">
                    <Layers size={32} className="mx-auto text-dark-600 mb-2" />
                    <p className="text-dark-400 text-sm">No variants yet</p>
                    <p className="text-dark-500 text-xs mt-1">Add variants for different editions, regions, etc.</p>
                  </div>
                ) : (
                  variants.map((v) => (
                    <div key={v.id} className="bg-dark-800/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">{v.name}</span>
                          <span className="ml-2 text-primary-400">${v.price.toFixed(2)}</span>
                          <span className={`ml-2 text-xs ${v.stock_count > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {v.stock_count} in stock
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditingVariant(v); setVariantForm({ name: v.name, price: v.price.toString() }) }}
                            className="p-1.5 hover:bg-dark-700 rounded-lg text-dark-400"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setSelectedVariantForKeys(selectedVariantForKeys?.id === v.id ? null : v)}
                            className={`p-1.5 hover:bg-dark-700 rounded-lg ${selectedVariantForKeys?.id === v.id ? 'text-primary-400' : 'text-dark-400'}`}
                            title="Add Keys"
                          >
                            <Key size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteVariant(v.id)}
                            className="p-1.5 hover:bg-red-400/10 rounded-lg text-dark-400 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      
                      {/* Inline keys input for this variant */}
                      {selectedVariantForKeys?.id === v.id && (
                        <div className="mt-2 pt-2 border-t border-dark-700">
                          <p className="text-xs text-dark-400 mb-2">Add keys for "{v.name}" (one per line)</p>
                          <textarea
                            value={variantKeysInput}
                            onChange={(e) => setVariantKeysInput(e.target.value)}
                            placeholder="KEY-111&#10;KEY-222&#10;KEY-333"
                            className="input text-sm min-h-[80px] font-mono"
                          />
                          <button
                            onClick={handleAddKeysToVariant}
                            disabled={submitting || !variantKeysInput.trim()}
                            className="btn-primary text-sm mt-2 w-full"
                          >
                            {submitting ? 'Adding...' : 'Add Keys to Variant'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
