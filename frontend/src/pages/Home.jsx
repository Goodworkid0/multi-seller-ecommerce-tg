import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronDown, Sparkles, Star, Store, Shield, Lock, Zap, Users2, CheckCircle, Folder, Megaphone, MessageCircle, Users, ShieldX, Crown, Rocket, GraduationCap, Palette, Code, PenTool, Briefcase, Wrench, Search as SearchIcon, Gift, Package, Gavel } from 'lucide-react'
import api from '../lib/api'
import { useBrandingStore } from '../store/brandingStore'

export default function Home() {
  const [featuredSellers, setFeaturedSellers] = useState([])
  const [escrowStats, setEscrowStats] = useState(null)
  const [banners, setBanners] = useState([])
  const [tagCategories, setTagCategories] = useState([])
  const [serviceCategories, setServiceCategories] = useState([])
  const [publicStats, setPublicStats] = useState(null)
  const [rulesExpanded, setRulesExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const { announcementsUrl, vouchesUrl, officialGroupUrl, suggestionGroupUrl, marketplaceRules } = useBrandingStore()

  useEffect(() => { loadData() }, [])

  // Icon mapping for service categories
  const categoryIcons = {
    'rocket': Rocket,
    'graduation-cap': GraduationCap,
    'palette': Palette,
    'code': Code,
    'pen-tool': PenTool,
    'megaphone': Megaphone,
    'briefcase': Briefcase,
  }

  const loadData = async () => {
    try {
      const [sellersRes, escrowRes, bannersRes, categoriesRes, serviceCatRes, statsRes] = await Promise.all([
        api.get('/api/sellers/featured'),
        api.get('/api/middleman/stats').catch(() => ({ data: null })),
        api.get('/api/banners').catch(() => ({ data: [] })),
        api.get('/api/products/tag-categories').catch(() => ({ data: [] })),
        api.get('/api/services/categories').catch(() => ({ data: [] })),
        api.get('/api/public/stats').catch(() => ({ data: null }))
      ])
      setFeaturedSellers(sellersRes.data || [])
      setEscrowStats(escrowRes.data)
      setBanners(bannersRes.data || [])
      setTagCategories(categoriesRes.data || [])
      setServiceCategories(serviceCatRes.data || [])
      setPublicStats(statsRes.data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const bannersByPosition = (pos) => banners.filter(b => (b.position || 'below_vouches') === pos)

  const BannerSlot = ({ position }) => {
    const items = bannersByPosition(position)
    const [currentIndex, setCurrentIndex] = useState(0)
    
    // Auto-rotate every 5 seconds
    useEffect(() => {
      if (items.length <= 1) return
      const interval = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % items.length)
      }, 5000)
      return () => clearInterval(interval)
    }, [items.length])
    
    if (items.length === 0) return null
    
    const banner = items[currentIndex]
    
    return (
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl overflow-hidden border border-white/[0.06] backdrop-blur-sm"
          >
            {banner.image_url ? (
              <Link to={banner.link || '#'} className="block relative group">
                <div style={{ aspectRatio: '864/200' }} className="w-full overflow-hidden bg-dark-900">
                  <img 
                    src={banner.image_url} 
                    alt={banner.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">{banner.link_text || 'View'}</span>
                </div>
              </Link>
            ) : (
              <div className={`p-4 flex items-center justify-between gap-3 bg-gradient-to-r from-${banner.gradient_from}/15 via-${banner.gradient_to}/10 to-${banner.gradient_from}/15`}>
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-sm leading-tight">{banner.title}</h3>
                  {banner.subtitle && <p className="text-xs text-dark-300 mt-0.5 leading-relaxed">{banner.subtitle}</p>}
                </div>
                {banner.link && (
                  <Link to={banner.link} className="shrink-0 text-xs font-medium px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/[0.06] transition-all">
                    {banner.link_text || 'Learn More'}
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        
        {/* Dots indicator */}
        {items.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentIndex ? 'bg-white w-3' : 'bg-white/40 hover:bg-white/60'}`}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick Links */}
      <div className="space-y-2">
        {(announcementsUrl || officialGroupUrl) && (
          <div className="flex gap-2">
            {announcementsUrl && (
              <a
                href={announcementsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 card-hover py-2 px-3 flex items-center gap-2"
              >
                <Megaphone size={16} className="text-cyan-400" />
                <p className="text-xs font-medium">Announcements</p>
              </a>
            )}
            {officialGroupUrl && (
              <a
                href={officialGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 card-hover py-2 px-3 flex items-center gap-2"
              >
                <Users size={16} className="text-purple-400" />
                <p className="text-xs font-medium">Group</p>
              </a>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {suggestionGroupUrl && (
            <a
              href={suggestionGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 card-hover py-2 px-3 flex items-center gap-2"
            >
              <MessageCircle size={16} className="text-amber-400" />
              <p className="text-xs font-medium">Suggestions</p>
            </a>
          )}
          <Link
            to="/blacklist"
            className="flex-1 card-hover py-2 px-3 flex items-center gap-2"
          >
            <ShieldX size={16} className="text-red-400" />
            <p className="text-xs font-medium">Blacklist</p>
          </Link>
        </div>
      </div>

      {/* Marketplace Rules */}
      {marketplaceRules?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card overflow-hidden"
        >
          <button
            onClick={() => setRulesExpanded(!rulesExpanded)}
            className="w-full flex items-center justify-between p-3 hover:bg-dark-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-amber-400" />
              <span className="text-sm font-semibold">Marketplace Rules</span>
              <span className="text-[9px] text-dark-500 bg-dark-800 px-1.5 py-0.5 rounded-full">{marketplaceRules.length}</span>
            </div>
            <ChevronDown size={14} className={`text-dark-500 transition-transform ${rulesExpanded ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {rulesExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 space-y-1.5 border-t border-dark-700/50 pt-2">
                  {marketplaceRules.map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-amber-400/70 font-semibold shrink-0 w-4 text-right">{i + 1}.</span>
                      <span className="text-dark-300 leading-relaxed">{rule}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Featured Sellers */}
      {featuredSellers.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-base mb-3 flex items-center gap-1.5">
            <Star size={16} className="text-yellow-400 fill-yellow-400" />
            Featured Sellers
            {featuredSellers.length > 6 && (
              <span className="text-[10px] text-dark-500 ml-auto font-normal">Scroll for more</span>
            )}
          </h2>
          <div className="grid grid-cols-2 gap-2 max-h-[198px] overflow-y-auto scrollbar-hide">
            {featuredSellers.map((seller, i) => (
              <motion.div
                key={seller.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  to={`/shop/${seller.id}`}
                  className="card p-3 flex items-center gap-3 group hover:border-primary-500/30 transition-all"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {seller.avatar_url ? (
                      <img
                        src={seller.avatar_url}
                        alt={seller.shop_name || seller.username}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-purple/20 flex items-center justify-center">
                        <Store size={18} className="text-primary-400" />
                      </div>
                    )}
                    {seller.seller_rank > 0 && (
                      <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-dark-900 ${
                        seller.seller_rank === 3 ? 'bg-yellow-500' : 
                        seller.seller_rank === 2 ? 'bg-gray-400' : 
                        'bg-amber-600'
                      }`}>
                        <Crown size={8} className="text-dark-900" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary-400 transition-colors">
                      {seller.shop_name || seller.username || 'Seller'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {seller.seller_rating > 0 ? (
                        <div className="flex items-center gap-0.5">
                          <Star size={10} className="text-yellow-400 fill-yellow-400" />
                          <span className="text-[10px] text-dark-400">{seller.seller_rating.toFixed(1)}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-dark-500">New</span>
                      )}
                      {(seller.collateral || 0) > 0 && (
                        <span className="text-[10px] text-emerald-400 font-medium">
                          ${seller.collateral >= 1000 ? `${(seller.collateral/1000).toFixed(0)}k` : seller.collateral.toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Banners: above categories */}
      <BannerSlot position="above_categories" />

      {/* Giveaways CTA */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.09 }}
        >
          <Link to="/giveaways" className="card overflow-hidden group block">
            <div className="bg-gradient-to-r from-primary-500/10 via-dark-900 to-purple-500/10 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Gift size={20} className="text-primary-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-sm mb-1 group-hover:text-primary-300 transition-colors">
                    Giveaways
                  </h3>
                  <p className="text-xs text-dark-400 leading-relaxed">
                    Check current giveaways and enter in one tap.
                  </p>
                  <span className="inline-flex items-center gap-1 mt-2 text-xs text-primary-300 font-medium">
                    View Giveaways <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </section>

      {/* Categories */}
      {tagCategories.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-base mb-3 flex items-center gap-1.5">
            <Folder size={16} className="text-primary-400" />
            Browse by Category
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {tagCategories.map((category, i) => (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <Link 
                    to={`/products?type=products&tag=${category.children.map(c => encodeURIComponent(c.name)).join(',')}`}
                    className="font-medium text-sm hover:text-primary-400 transition-colors"
                  >
                    {category.name}
                  </Link>
                  <span className="text-xs text-dark-500">{category.total_count}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {category.children.slice(0, 4).map(tag => (
                    <Link
                      key={tag.id}
                      to={`/products?type=products&tag=${encodeURIComponent(tag.name)}`}
                      className="px-1.5 py-0.5 rounded bg-dark-800 text-[10px] text-dark-400 hover:bg-primary-500 hover:text-dark-50 transition-colors"
                    >
                      {tag.name}
                    </Link>
                  ))}
                  {category.children.length > 4 && (
                    <Link
                      to={`/products?type=products&tag=${category.children.map(c => encodeURIComponent(c.name)).join(',')}`}
                      className="text-[10px] text-dark-500 hover:text-primary-400"
                    >
                      +{category.children.length - 4}
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Service Categories */}
      {serviceCategories.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-base mb-3 flex items-center gap-1.5">
            <Wrench size={16} className="text-accent-purple" />
            Hire Service Providers
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {serviceCategories.map((category, i) => {
              const IconComponent = categoryIcons[category.icon] || Briefcase
              return (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/products?type=services&category=${category.id}`}
                    className="card p-3 flex items-center gap-3 group hover:border-accent-purple/30 transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple/20 to-primary-500/20 flex items-center justify-center shrink-0">
                      <IconComponent size={18} className="text-accent-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-accent-purple transition-colors">
                        {category.name}
                      </p>
                      <p className="text-[10px] text-dark-500">
                        {category.count} {category.count === 1 ? 'service' : 'services'}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </section>
      )}

      {/* Banners: above WTB */}
      <BannerSlot position="above_wtb" />

      {/* WTB CTA */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Link to="/wtb" className="card overflow-hidden group block">
            <div className="bg-gradient-to-r from-orange-500/10 via-dark-900 to-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <SearchIcon size={20} className="text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-sm mb-1 group-hover:text-orange-400 transition-colors">
                    Can't find what you need?
                  </h3>
                  <p className="text-xs text-dark-400 leading-relaxed">
                    Not sure whom to trust? Post a <span className="text-orange-400 font-medium">Want to Buy</span> request and let verified sellers come to you.
                  </p>
                  <span className="inline-flex items-center gap-1 mt-2 text-xs text-orange-400 font-medium">
                    Write a WTB Post <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </section>

      {/* Browse All */}
      <section>
        <Link to="/products" className="card-hover p-4 flex items-center justify-between group">
          <div>
            <h2 className="font-display font-semibold text-lg">Browse Marketplace</h2>
            <p className="text-sm text-dark-400">Products, services, and auctions</p>
          </div>
          <ChevronRight size={20} className="text-dark-600 group-hover:text-primary-400 transition-colors" />
        </Link>
      </section>

      {/* Banners: above escrow */}
      <BannerSlot position="above_escrow" />

      {/* Escrow Service */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Link to="/middleman" className="card-hover p-4 flex items-start gap-4 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
              <Users2 size={24} className="text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display font-semibold text-lg">Escrow Service</h2>
                <ChevronRight size={16} className="text-dark-600 group-hover:text-primary-400 transition-colors" />
              </div>
              <p className="text-sm text-dark-400 mb-2">
                Secure peer-to-peer trading with admin oversight. Trade safely with anyone.
              </p>
              <div className="flex items-center gap-4 text-xs">
                {escrowStats && escrowStats.completed_deals > 0 && (
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle size={12} />
                    <span className="font-medium">{escrowStats.completed_deals}</span>
                    <span className="text-dark-500">deals completed</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-dark-400">
                  <Shield size={12} className="text-cyan-400" />
                  <span>{publicStats?.middleman_fee ?? 5}% fee{publicStats?.middleman_min_fee > 0 ? ` (min $${publicStats.middleman_min_fee})` : ''}</span>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </section>

      {/* Upgrade Your Account */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card overflow-hidden"
        >
          <div className="bg-gradient-to-br from-primary-500/10 via-dark-900 to-accent-purple/10 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Crown size={20} className="text-yellow-400" />
              <h2 className="font-display font-bold text-lg">Upgrade Your Account</h2>
            </div>
            <p className="text-sm text-dark-300 mb-4">
              Unlock seller privileges and start earning on our marketplace
            </p>

            {/* Rank Tiers */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-amber-600/10 border border-amber-600/30 rounded-xl p-2.5 text-center">
                <div className="w-8 h-8 rounded-full bg-amber-600 mx-auto mb-1.5 flex items-center justify-center">
                  <Crown size={14} className="text-dark-900" />
                </div>
                <p className="text-[11px] font-bold text-amber-500">Bronze</p>
                <p className="text-[10px] text-dark-400">$50/mo</p>
                <p className="text-[9px] text-dark-500 mt-1">Start selling</p>
              </div>
              <div className="bg-gray-400/10 border border-gray-400/30 rounded-xl p-2.5 text-center">
                <div className="w-8 h-8 rounded-full bg-gray-400 mx-auto mb-1.5 flex items-center justify-center">
                  <Crown size={14} className="text-dark-900" />
                </div>
                <p className="text-[11px] font-bold text-gray-300">Silver</p>
                <p className="text-[10px] text-dark-400">$100/mo</p>
                <p className="text-[9px] text-dark-500 mt-1">Priority support</p>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-2.5 text-center">
                <div className="w-8 h-8 rounded-full bg-yellow-500 mx-auto mb-1.5 flex items-center justify-center">
                  <Crown size={14} className="text-dark-900" />
                </div>
                <p className="text-[11px] font-bold text-yellow-400">Gold</p>
                <p className="text-[10px] text-dark-400">$200/mo</p>
                <p className="text-[9px] text-dark-500 mt-1">Featured spot</p>
              </div>
            </div>

            {/* Perks */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                <span className="text-dark-300">Escrow protection for all transactions</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                <span className="text-dark-300">Featured homepage placement</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                <span className="text-dark-300">Verified seller rank badge</span>
              </div>
            </div>

            <Link
              to="/settings"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-all"
            >
              <Zap size={14} />
              Get Started
            </Link>
          </div>
        </motion.div>

        {/* Banners: above vouches */}
        <div className="mt-4">
          <BannerSlot position="above_vouches" />
        </div>

        {vouchesUrl && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <a
              href={vouchesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="card-hover p-4 flex items-center gap-3 mt-4"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <MessageCircle size={20} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Customer Vouches</p>
                <p className="text-xs text-dark-400">See what our customers are saying</p>
              </div>
              <ChevronRight size={16} className="text-dark-500" />
            </a>
          </motion.div>
        )}

        {/* Banners: below vouches */}
        <div className="mt-4">
          <BannerSlot position="below_vouches" />
        </div>

        {/* Users & Sellers - minimal */}
        {publicStats && (
          <>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-dark-500 text-xs py-4 mt-2">
            <span className="flex items-center gap-1.5">
              <Users size={12} />
              {publicStats.total_users?.toLocaleString() || 0} users
            </span>
            <span className="text-dark-700">•</span>
            <span className="flex items-center gap-1.5">
              <Store size={12} />
              {publicStats.total_sellers?.toLocaleString() || 0} sellers
            </span>
            <span className="text-dark-700">•</span>
            <span className="flex items-center gap-1.5">
              <Package size={12} />
              {publicStats.total_products?.toLocaleString() || 0} products
            </span>
            <span className="text-dark-700">•</span>
            <span className="flex items-center gap-1.5">
              <Gavel size={12} />
              {publicStats.total_auctions?.toLocaleString() || 0} auctions
            </span>
            <span className="text-dark-700">•</span>
            <span className="flex items-center gap-1.5">
              <Briefcase size={12} />
              {publicStats.total_services?.toLocaleString() || 0} services
            </span>
            {publicStats.active_count > 0 && (
              <>
                <span className="text-dark-700">•</span>
                <span className="flex items-center gap-1.5 text-emerald-500/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {publicStats.active_count} active
                </span>
              </>
            )}
            {publicStats.active_admins?.length > 0 && (
              <>
                <span className="text-dark-700">•</span>
                <span className="flex items-center gap-1.5 text-amber-400/80">
                  <Crown size={12} />
                  {publicStats.active_admins.map((name, i) => (
                    <span key={i}>@{name}{i < publicStats.active_admins.length - 1 ? ', ' : ''}</span>
                  ))}
                </span>
              </>
            )}
          </div>
          {/* Activity Legend */}
          <div className="flex items-center justify-center gap-3 text-[10px] text-dark-600 mt-1">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active (last 30 min)
            </span>
            <span className="flex items-center gap-1">
              <Crown size={10} className="text-amber-500/60" />
              Admin online
            </span>
          </div>
          </>
        )}
      </section>

      {/* Footer Banner Slots */}
      <BannerSlot position="footer_1" />
      <BannerSlot position="footer_2" />
      <BannerSlot position="footer_3" />
    </div>
  )
}
