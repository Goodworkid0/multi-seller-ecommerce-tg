import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, X, Send, Clock, DollarSign, Tag, User,
  ChevronDown, AlertCircle, Trash2, ShoppingBag, MessageCircle, Pencil, ArrowLeft, Star, ThumbsUp, Shield, Store, BookOpen
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import api from '../lib/api'

const formatDate = (v) => {
  if (!v) return ''
  const d = new Date(typeof v === 'string' && !v.endsWith('Z') ? v + 'Z' : v)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return d.toLocaleDateString()
}

const budgetLabel = (min, max) => {
  if (min && max) return `$${min.toFixed(0)}–$${max.toFixed(0)}`
  if (min) return `from $${min.toFixed(0)}`
  if (max) return `up to $${max.toFixed(0)}`
  return null
}

export default function WantToBuy() {
  const { user } = useAuthStore()
  const { wtbRules } = useBrandingStore()
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [myPosts, setMyPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showMyPosts, setShowMyPosts] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  // DM modal state
  const [dmTarget, setDmTarget] = useState(null) // { userId, postId, postTitle }
  const [dmText, setDmText] = useState('')
  const [dmSending, setDmSending] = useState(false)

  const [myTab, setMyTab] = useState('active') // 'active' | 'archive'
  const [showRules, setShowRules] = useState(false)

  const [editPost, setEditPost] = useState(null)
  const [editSaving, setEditSaving] = useState(false)

  // Create form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [category, setCategory] = useState('')

  const [wtbCategories, setWtbCategories] = useState([])
  const [wtbCatsLoading, setWtbCatsLoading] = useState(true)

  // Edit form (reuses separate state so Create isn't affected)
  const [eTitle, setETitle] = useState('')
  const [eDescription, setEDescription] = useState('')
  const [eBudgetMin, setEBudgetMin] = useState('')
  const [eBudgetMax, setEBudgetMax] = useState('')
  const [eCategory, setECategory] = useState('')

  const categoryLabel = (slug) => {
    if (!slug) return ''
    const found = wtbCategories.find(c => c.slug === slug)
    return found?.name || slug
  }

  const loadPosts = async (p = page, s = search) => {
    setLoading(true)
    try {
      const params = { page: p, limit: 20 }
      if (s.trim()) params.search = s.trim()
      const { data } = await api.get('/api/wtb', { params })
      setPosts(data.posts)
      setTotal(data.total)
      setPages(data.pages)
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  const loadMyPosts = async () => {
    try {
      const { data } = await api.get('/api/wtb/mine')
      setMyPosts(data)
    } catch {
      setMyPosts([])
    }
  }

  useEffect(() => { loadPosts(1); loadMyPosts() }, [])

  useEffect(() => {
    api.get('/api/wtb/categories').then(r => {
      setWtbCategories(r.data || [])
    }).catch(() => {
      setWtbCategories([])
    }).finally(() => setWtbCatsLoading(false))
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    loadPosts(1, search)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!title.trim() || title.trim().length < 5) {
      setError('Title must be at least 5 characters.')
      return
    }
    setCreating(true)
    setError('')
    try {
      await api.post('/api/wtb', {
        title: title.trim(),
        description: description.trim() || null,
        budget_min: budgetMin ? parseFloat(budgetMin) : null,
        budget_max: budgetMax ? parseFloat(budgetMax) : null,
        category: category.trim() || null,
      })
      setTitle('')
      setDescription('')
      setBudgetMin('')
      setBudgetMax('')
      setCategory('')
      setShowCreate(false)
      loadPosts(1)
      loadMyPosts()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create post.')
    } finally {
      setCreating(false)
    }
  }

  const handleArchive = async (id) => {
    try {
      await api.delete(`/api/wtb/${id}`)
      loadPosts()
      loadMyPosts()
    } catch {}
  }

  const activeMyPosts = myPosts.filter(p => p.status === 'active' && !p.is_archived)
  const archivedMyPosts = myPosts.filter(p => p.is_archived)

  const openEdit = (p) => {
    setEditPost(p)
    setETitle(p.title || '')
    setEDescription(p.description || '')
    setEBudgetMin(p.budget_min != null ? String(p.budget_min) : '')
    setEBudgetMax(p.budget_max != null ? String(p.budget_max) : '')
    setECategory(p.category || '')
  }

  const submitEdit = async (e) => {
    e.preventDefault()
    if (!editPost || editSaving) return
    if (!eTitle.trim() || eTitle.trim().length < 5) return
    setEditSaving(true)
    try {
      await api.put(`/api/wtb/${editPost.id}`, {
        title: eTitle.trim(),
        description: eDescription.trim() || null,
        budget_min: eBudgetMin ? parseFloat(eBudgetMin) : null,
        budget_max: eBudgetMax ? parseFloat(eBudgetMax) : null,
        category: eCategory.trim() || null,
      })
      setEditPost(null)
      loadPosts()
      loadMyPosts()
    } catch (err) {
      console.error('Edit failed:', err)
    } finally {
      setEditSaving(false)
    }
  }

  const handleSendDM = async (e) => {
    e.preventDefault()
    if (!dmText.trim() || !dmTarget || dmSending) return
    setDmSending(true)
    try {
      const { data } = await api.post('/api/dm/start', {
        user_id: dmTarget.userId,
        message: dmText.trim(),
        context_type: 'wtb_post',
        context_id: dmTarget.postId,
        context_label: dmTarget.postTitle || 'WTB Post'
      })
      setDmTarget(null)
      setDmText('')
      navigate(`/messages/${data.conversation_id}`)
    } catch (err) {
      console.error('DM failed:', err)
    } finally {
      setDmSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-dark-800/80 hover:bg-dark-700 transition-colors"
          >
            <ArrowLeft size={16} className="text-dark-300" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold">Want to Buy</h1>
            <p className="text-dark-400 text-xs">Post what you're looking for — sellers will find you</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            showCreate
              ? 'bg-dark-800 text-dark-300'
              : 'bg-primary-500 text-white shadow-lg shadow-primary-500/20'
          }`}
        >
          {showCreate ? <X size={14} /> : <Plus size={14} />}
          {showCreate ? 'Cancel' : 'New Post'}
        </button>
      </div>

      {/* WTB Rules */}
      {wtbRules && wtbRules.length > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-dark-800/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="text-primary-400" />
              <span className="text-xs font-semibold text-dark-200">WTB Rules</span>
            </div>
            <ChevronDown size={14} className={`text-dark-500 transition-transform ${showRules ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {showRules && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3.5 pb-3 border-t border-dark-800/50">
                  <ol className="space-y-1.5 mt-2.5">
                    {wtbRules.map((rule, i) => (
                      <li key={i} className="flex gap-2 text-xs text-dark-300 leading-relaxed">
                        <span className="text-primary-400 font-bold flex-shrink-0">{i + 1}.</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate}
            className="card p-4 space-y-3 overflow-hidden"
          >
            <h3 className="text-sm font-semibold">What are you looking for?</h3>

            <div>
              <label className="text-[10px] text-dark-400 mb-1 block">Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="input py-2 text-sm"
                placeholder="e.g. Netflix Premium 1 Year Account"
                maxLength={200}
              />
            </div>

            <div>
              <label className="text-[10px] text-dark-400 mb-1 block">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="input py-2 text-sm min-h-[60px] resize-none"
                placeholder="Any specific requirements, details, or preferences..."
                maxLength={1000}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-dark-400 mb-1 block">Min Budget ($)</label>
                <input
                  type="number"
                  value={budgetMin}
                  onChange={e => setBudgetMin(e.target.value)}
                  className="input py-2 text-sm"
                  placeholder="0"
                  min={0}
                  step={1}
                />
              </div>
              <div>
                <label className="text-[10px] text-dark-400 mb-1 block">Max Budget ($)</label>
                <input
                  type="number"
                  value={budgetMax}
                  onChange={e => setBudgetMax(e.target.value)}
                  className="input py-2 text-sm"
                  placeholder="100"
                  min={0}
                  step={1}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-dark-400 mb-1 block">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="input py-2 text-sm"
              >
                <option value="">No category</option>
                {(wtbCategories || []).map(c => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </select>
              {wtbCatsLoading && (
                <p className="text-[10px] text-dark-500 mt-1">Loading categories...</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
            >
              <Send size={14} />
              {creating ? 'Posting...' : 'Publish WTB Post'}
            </button>

            <p className="text-[10px] text-dark-500 text-center">Max 5 active posts.</p>
          </motion.form>
        )}
      </AnimatePresence>

      {/* My Posts */}
      {myPosts.length > 0 && (
        <div>
          <button
            onClick={() => setShowMyPosts(!showMyPosts)}
            className="flex items-center gap-2 text-xs text-dark-400 hover:text-dark-50 transition-colors mb-2"
          >
            <ChevronDown size={14} className={`transition-transform ${showMyPosts ? 'rotate-180' : ''}`} />
            My Posts ({activeMyPosts.length})
          </button>
          <AnimatePresence>
            {showMyPosts && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => setMyTab('active')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      myTab === 'active'
                        ? 'bg-primary-500/15 border-primary-500/30 text-primary-300'
                        : 'bg-dark-800 border-dark-700 text-dark-400 hover:text-dark-50'
                    }`}
                  >
                    Active ({activeMyPosts.length})
                  </button>
                  <button
                    onClick={() => setMyTab('archive')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      myTab === 'archive'
                        ? 'bg-primary-500/15 border-primary-500/30 text-primary-300'
                        : 'bg-dark-800 border-dark-700 text-dark-400 hover:text-dark-50'
                    }`}
                  >
                    Archive ({archivedMyPosts.length})
                  </button>
                </div>

                {(myTab === 'active' ? activeMyPosts : archivedMyPosts).length === 0 ? (
                  <div className="card p-4 text-center">
                    <p className="text-xs text-dark-500">
                      {myTab === 'active' ? 'No active WTB posts.' : 'No archived WTB posts.'}
                    </p>
                  </div>
                ) : (myTab === 'active' ? activeMyPosts : archivedMyPosts).map(p => (
                  <div key={p.id} className="card p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{p.title}</span>
                        {p.is_archived && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700 text-dark-400">Archived</span>
                        )}
                      </div>
                      {budgetLabel(p.budget_min, p.budget_max) && (
                        <span className="text-[10px] text-dark-400">{budgetLabel(p.budget_min, p.budget_max)}</span>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!p.is_archived && (
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:text-dark-50 transition-colors" title="Edit post">
                          <Pencil size={14} />
                        </button>
                      )}
                      {!p.is_archived && (
                        <button onClick={() => handleArchive(p.id)} className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:text-primary-300 transition-colors" title="Archive post">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3"
            onClick={() => !editSaving && setEditPost(null)}
          >
            <motion.form
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={submitEdit}
              className="card w-full max-w-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Edit WTB Post</h3>
                <button type="button" onClick={() => !editSaving && setEditPost(null)} className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:text-dark-50">
                  <X size={14} />
                </button>
              </div>

              <div>
                <label className="text-[10px] text-dark-400 mb-1 block">Title *</label>
                <input
                  value={eTitle}
                  onChange={e => setETitle(e.target.value)}
                  className="input py-2 text-sm"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="text-[10px] text-dark-400 mb-1 block">Description</label>
                <textarea
                  value={eDescription}
                  onChange={e => setEDescription(e.target.value)}
                  className="input py-2 text-sm min-h-[60px] resize-none"
                  maxLength={1000}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-dark-400 mb-1 block">Min Budget ($)</label>
                  <input type="number" value={eBudgetMin} onChange={e => setEBudgetMin(e.target.value)} className="input py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-dark-400 mb-1 block">Max Budget ($)</label>
                  <input type="number" value={eBudgetMax} onChange={e => setEBudgetMax(e.target.value)} className="input py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-dark-400 mb-1 block">Category (optional)</label>
                <select value={eCategory} onChange={e => setECategory(e.target.value)} className="input py-2 text-sm">
                  <option value="">No category</option>
                  {(wtbCategories || []).map(c => (
                    <option key={c.id} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={editSaving || eTitle.trim().length < 5}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              >
                <Pencil size={14} />
                {editSaving ? 'Saving...' : 'Save changes'}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input py-2.5 pl-9 pr-4 text-sm w-full"
          placeholder="Search WTB posts..."
        />
      </form>

      {/* Posts List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-2/3 bg-dark-800 rounded mb-2" />
              <div className="h-3 w-1/2 bg-dark-800 rounded" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="card p-8 text-center">
          <ShoppingBag size={32} className="mx-auto text-dark-600 mb-3" />
          <p className="text-dark-400 text-sm mb-1">No WTB posts yet</p>
          <p className="text-dark-500 text-xs">Be the first to post what you're looking for!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card p-3.5 space-y-2 cursor-pointer active:scale-[0.99] transition-transform"
              onClick={() => navigate(`/wtb/${post.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug">{post.title}</h3>
                {budgetLabel(post.budget_min, post.budget_max) && (
                  <span className="flex items-center gap-1 text-xs text-primary-400 font-medium whitespace-nowrap flex-shrink-0">
                    <DollarSign size={12} />
                    {budgetLabel(post.budget_min, post.budget_max)}
                  </span>
                )}
              </div>

              {post.description && (
                <p className="text-xs text-dark-300 leading-relaxed line-clamp-2">{post.description}</p>
              )}

              <div className="flex items-center justify-between text-[11px] text-dark-500">
                <div className="flex items-center gap-3">
                  {post.user && (
                    <span className="flex items-center gap-1.5">
                      {post.user.avatar_url ? (
                        <img src={post.user.avatar_url} className="w-4 h-4 rounded-full object-cover ring-1 ring-dark-700" alt="" />
                      ) : (
                        <User size={12} />
                      )}
                      <span>{post.user.first_name || post.user.username || 'User'}</span>
                      {post.user.role === 'admin' ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold">Admin</span>
                      ) : post.user.role === 'seller' ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-400 font-bold flex items-center gap-0.5">
                          <Store size={8} /> Seller
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-dark-700 text-dark-400 font-medium">Buyer</span>
                      )}
                      {post.user.role === 'seller' && ((post.user.rep_positive || 0) - (post.user.rep_negative || 0)) !== 0 && (
                        <span className={`flex items-center gap-0.5 text-[10px] ${((post.user.rep_positive || 0) - (post.user.rep_negative || 0)) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          <ThumbsUp size={8} />
                          {((post.user.rep_positive || 0) - (post.user.rep_negative || 0)) > 0 ? '+' : ''}{(post.user.rep_positive || 0) - (post.user.rep_negative || 0)}
                        </span>
                      )}
                      {post.user.role === 'seller' && (post.user.seller_review_count || 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                          <Star size={8} className="fill-yellow-400" />
                          {post.user.seller_rating?.toFixed(1)}
                        </span>
                      )}
                    </span>
                  )}
                  {post.category && (
                    <span className="flex items-center gap-1">
                      <Tag size={10} />
                      {categoryLabel(post.category)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {user && post.user && post.user.id !== user.id && (user.role === 'seller' || user.role === 'admin') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDmTarget({ userId: post.user.id, postId: post.id, postTitle: post.title }) }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors text-[11px] font-medium"
                    >
                      <MessageCircle size={11} />
                      Message
                    </button>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDate(post.created_at)}
                  </span>
                  {(post.reply_count || post.responses || 0) > 0 && (
                    <span className="flex items-center gap-1 text-primary-400">
                      <MessageCircle size={10} />
                      {post.reply_count || post.responses}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).slice(
            Math.max(0, page - 3), Math.min(pages, page + 2)
          ).map(p => (
            <button
              key={p}
              onClick={() => { setPage(p); loadPosts(p, search) }}
              className={`w-8 h-8 rounded-lg text-xs font-medium ${
                p === page ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400 hover:text-dark-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Total count */}
      {total > 0 && (
        <p className="text-center text-[11px] text-dark-500">{total} {total === 1 ? 'post' : 'posts'} total</p>
      )}

      {/* DM Modal */}
      <AnimatePresence>
        {dmTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => { setDmTarget(null); setDmText('') }}
            />
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="fixed left-4 right-4 bottom-8 z-50 card p-4 max-w-lg mx-auto"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-primary-400" />
                  <span className="text-sm font-semibold">Reply to WTB</span>
                </div>
                <button onClick={() => { setDmTarget(null); setDmText('') }} className="p-1 hover:bg-dark-800 rounded-lg">
                  <X size={16} className="text-dark-400" />
                </button>
              </div>
              <p className="text-xs text-dark-400 mb-3 truncate">Re: {dmTarget.postTitle}</p>
              <form onSubmit={handleSendDM} className="space-y-3">
                <textarea
                  value={dmText}
                  onChange={e => setDmText(e.target.value)}
                  placeholder="I have what you're looking for..."
                  className="input py-2.5 text-sm min-h-[80px] resize-none w-full"
                  maxLength={2000}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!dmText.trim() || dmSending}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Send size={14} />
                  {dmSending ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
