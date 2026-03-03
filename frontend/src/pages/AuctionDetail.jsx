import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Gavel, Clock, DollarSign, Timer, User, ArrowLeft,
  TrendingUp, AlertCircle, Check, ShoppingBag, CreditCard, Trophy
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

function formatTimeLeft(endDate) {
  const now = new Date()
  const end = new Date(endDate)
  const diff = end - now
  
  if (diff <= 0) return { text: 'Ended', urgent: true }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const secs = Math.floor((diff % (1000 * 60)) / 1000)
  
  if (days > 0) return { text: `${days}d ${hours}h ${mins}m`, urgent: false }
  if (hours > 0) return { text: `${hours}h ${mins}m ${secs}s`, urgent: hours < 1 }
  return { text: `${mins}m ${secs}s`, urgent: true }
}

export default function AuctionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, tgConfirm } = useAuthStore()
  
  const [auction, setAuction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bidAmount, setBidAmount] = useState('')
  const [bidStatus, setBidStatus] = useState({ status: 'idle', message: '' })
  const [timeLeft, setTimeLeft] = useState({ text: '', urgent: false })

  useEffect(() => {
    loadAuction()
  }, [id])

  useEffect(() => {
    if (!auction?.ends_at) return
    
    const interval = setInterval(() => {
      setTimeLeft(formatTimeLeft(auction.ends_at))
    }, 1000)
    
    setTimeLeft(formatTimeLeft(auction.ends_at))
    
    return () => clearInterval(interval)
  }, [auction?.ends_at])

  const loadAuction = async () => {
    try {
      const { data } = await api.get(`/api/auctions/${id}`)
      setAuction(data)
      // Set default bid amount
      const minBid = (data.current_bid || data.start_price) + (data.blitz_price || 1)
      setBidAmount(minBid.toFixed(2))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleBid = async () => {
    if (!bidAmount) return
    
    setBidStatus({ status: 'loading', message: '' })
    
    try {
      await api.post(`/api/auctions/${id}/bid?amount=${bidAmount}`)
      setBidStatus({ status: 'success', message: 'Bid placed!' })
      loadAuction()
    } catch (e) {
      setBidStatus({ status: 'error', message: e.response?.data?.detail || 'Failed to place bid' })
    }
  }

  const handleBuyNow = async () => {
    if (!await tgConfirm(`Buy now for $${auction.buyout_price}?`)) return
    
    setBidStatus({ status: 'loading', message: '' })
    
    try {
      await api.post(`/api/auctions/${id}/buy-now`)
      setBidStatus({ status: 'success', message: 'Purchase successful!' })
      setTimeout(() => navigate('/orders'), 1500)
    } catch (e) {
      setBidStatus({ status: 'error', message: e.response?.data?.detail || 'Failed to purchase' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen pb-24">
        <div className="p-4">
          <div className="animate-pulse">
            <div className="aspect-video bg-dark-800 rounded-xl mb-4" />
            <div className="h-6 bg-dark-800 rounded w-3/4 mb-2" />
            <div className="h-8 bg-dark-800 rounded w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  if (!auction) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Gavel size={48} className="mx-auto mb-4 text-dark-600" />
          <h2 className="font-semibold mb-2">Auction not found</h2>
          <Link to="/auctions" className="text-primary-400">Back to Auctions</Link>
        </div>
      </div>
    )
  }

  const minBid = (auction.current_bid || auction.start_price) + (auction.blitz_price || 1)
  const isActive = auction.status === 'active' && timeLeft.text !== 'Ended'
  const isAwaitingPayment = auction.status === 'awaiting_payment'
  const isWinner = user && auction.winner_id === user.id
  const paymentDeadline = auction.payment_deadline ? formatTimeLeft(auction.payment_deadline) : null

  const handlePay = async () => {
    if (!await tgConfirm(`Pay $${auction.current_bid?.toFixed(2)} for this auction?`)) return
    
    setBidStatus({ status: 'loading', message: '' })
    
    try {
      const { data } = await api.post(`/api/auctions/${id}/pay`)
      setBidStatus({ status: 'success', message: 'Payment successful!' })
      setTimeout(() => navigate(`/orders/${data.order_id}`), 1500)
    } catch (e) {
      setBidStatus({ status: 'error', message: e.response?.data?.detail || 'Payment failed' })
    }
  }

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 glass border-b border-dark-800">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display font-bold truncate flex-1">Auction Details</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Image */}
        <div className="aspect-video bg-dark-800 rounded-xl overflow-hidden">
          {auction.image_url ? (
            <img src={auction.image_url} alt={auction.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gavel size={64} className="text-dark-600" />
            </div>
          )}
        </div>

        {/* Time left banner */}
        <div className={`flex items-center justify-center gap-2 p-3 rounded-lg ${
          isAwaitingPayment && isWinner ? 'bg-accent-cyan/10 text-accent-cyan' :
          timeLeft.urgent ? 'bg-red-500/10 text-red-400' : 'bg-dark-800 text-dark-300'
        }`}>
          {isAwaitingPayment && isWinner ? (
            <>
              <Trophy size={18} />
              <span className="font-semibold">You Won! Pay within {paymentDeadline?.text || '48h'}</span>
            </>
          ) : (
            <>
              <Timer size={18} />
              <span className="font-semibold">{isActive ? timeLeft.text : 'Auction Ended'}</span>
            </>
          )}
        </div>

        {/* Title & Price */}
        <div>
          <h2 className="font-display text-xl font-bold mb-2">{auction.title}</h2>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs text-dark-500 mb-0.5">Current Bid</div>
              <div className="text-2xl font-bold text-accent-cyan">
                ${(auction.current_bid || auction.start_price).toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-dark-500 mb-0.5">Bids</div>
              <div className="text-lg font-semibold">{auction.bid_count}</div>
            </div>
          </div>
        </div>

        {/* Description */}
        {auction.description && (
          <div className="card">
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-sm text-dark-300 whitespace-pre-wrap">{auction.description}</p>
          </div>
        )}

        {/* Seller */}
        <Link to={`/shop/${auction.seller_id}`} className="card flex items-center gap-3 group">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center font-bold">
            {auction.seller_name?.[0] || 'S'}
          </div>
          <div>
            <div className="font-medium group-hover:text-primary-400 transition-colors">
              {auction.seller_name}
            </div>
            <div className="text-xs text-dark-500">Seller</div>
          </div>
        </Link>

        {/* Bid History */}
        {auction.bids?.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-3">Recent Bids</h3>
            <div className="space-y-2">
              {auction.bids.map((bid, i) => (
                <div key={bid.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-dark-500" />
                    <span className="text-dark-400">{bid.bidder_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={i === 0 ? 'text-accent-cyan font-semibold' : 'text-dark-400'}>
                      ${bid.amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status message */}
        {bidStatus.message && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            bidStatus.status === 'error' ? 'bg-red-500/10 text-red-400' :
            bidStatus.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
            'bg-dark-800 text-dark-300'
          }`}>
            {bidStatus.status === 'error' && <AlertCircle size={16} />}
            {bidStatus.status === 'success' && <Check size={16} />}
            <span className="text-sm">{bidStatus.message}</span>
          </div>
        )}
      </div>
      {/* Pay for Won Auction */}
      {isAwaitingPayment && isWinner && (
        <div className="fixed bottom-0 left-0 right-0 p-4 glass border-t border-dark-800 space-y-3">
          <button
            onClick={handlePay}
            disabled={bidStatus.status === 'loading'}
            className="w-full py-3 bg-accent-cyan text-dark-950 font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            <CreditCard size={18} />
            Pay ${auction.current_bid?.toFixed(2)}
          </button>
          <p className="text-[10px] text-dark-500 text-center">
            Your balance: ${user?.balance?.toFixed(2) || '0.00'} • {paymentDeadline?.text || '48h'} left to pay
          </p>
        </div>
      )}
      {/* Fixed Bottom Actions */}
      {isActive && user && auction.seller_id !== user.id && (
        <div className="fixed bottom-0 left-0 right-0 p-4 glass border-t border-dark-800 space-y-3">
          {/* Bid input */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500">$</span>
              <input
                type="number"
                step="0.01"
                min={minBid}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="input pl-7 w-full"
                placeholder={minBid.toFixed(2)}
              />
            </div>
            <button
              onClick={handleBid}
              disabled={bidStatus.status === 'loading' || parseFloat(bidAmount) < minBid}
              className="btn-primary flex items-center gap-2"
            >
              <Gavel size={18} />
              Place Bid
            </button>
          </div>

          {/* Buy Now */}
          {auction.buyout_price && (
            <button
              onClick={handleBuyNow}
              disabled={bidStatus.status === 'loading'}
              className="w-full py-3 bg-accent-cyan text-dark-950 font-semibold rounded-xl flex items-center justify-center gap-2"
            >
              <ShoppingBag size={18} />
              Buy Now — ${auction.buyout_price.toFixed(2)}
            </button>
          )}
          
          <p className="text-[10px] text-dark-500 text-center">
            Min bid: ${minBid.toFixed(2)} • Your balance: ${user?.balance?.toFixed(2) || '0.00'}
          </p>
        </div>
      )}
    </div>
  )
}
