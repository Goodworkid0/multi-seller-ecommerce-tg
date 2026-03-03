import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import QRCode from 'qrcode'
import { 
  Wallet, Copy, Check, ArrowUpCircle, AlertCircle, QrCode, Search, ChevronDown, Lock
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'

// Crypto options organized by category
const CRYPTO_CATEGORIES = [
  { id: 'popular', name: 'Popular', icon: '⭐' },
  { id: 'stablecoins', name: 'Stablecoins', icon: '💵' },
  { id: 'altcoins', name: 'Altcoins', icon: '🪙' },
]

const CRYPTO_OPTIONS = [
  // Popular
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC', icon: '₿', color: 'from-orange-400 to-orange-600', network: 'Bitcoin', category: 'popular' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH', icon: 'Ξ', color: 'from-blue-400 to-purple-600', network: 'ERC-20', category: 'popular' },
  { id: 'bnbbsc', name: 'BNB', symbol: 'BNB', icon: '◆', color: 'from-yellow-400 to-yellow-600', network: 'BEP-20', category: 'popular' },
  { id: 'sol', name: 'Solana', symbol: 'SOL', icon: '◎', color: 'from-purple-400 to-purple-600', network: 'Solana', category: 'popular' },
  { id: 'xrp', name: 'Ripple', symbol: 'XRP', icon: '✕', color: 'from-gray-400 to-gray-500', network: 'XRP Ledger', category: 'popular' },
  { id: 'ada', name: 'Cardano', symbol: 'ADA', icon: '₳', color: 'from-blue-500 to-blue-700', network: 'Cardano', category: 'popular' },
  { id: 'doge', name: 'Dogecoin', symbol: 'DOGE', icon: 'Ð', color: 'from-yellow-400 to-yellow-600', network: 'Dogecoin', category: 'popular' },
  { id: 'ltc', name: 'Litecoin', symbol: 'LTC', icon: 'Ł', color: 'from-gray-400 to-gray-600', network: 'Litecoin', category: 'popular' },
  { id: 'dot', name: 'Polkadot', symbol: 'DOT', icon: '●', color: 'from-pink-500 to-pink-700', network: 'Polkadot', category: 'popular' },
  { id: 'matic', name: 'Polygon', symbol: 'MATIC', icon: '⬡', color: 'from-purple-500 to-purple-700', network: 'Polygon', category: 'popular' },
  { id: 'avax', name: 'Avalanche', symbol: 'AVAX', icon: '▲', color: 'from-red-500 to-red-700', network: 'Avalanche C-Chain', category: 'popular' },
  { id: 'trx', name: 'TRON', symbol: 'TRX', icon: '⟁', color: 'from-red-400 to-red-600', network: 'TRC-20', category: 'popular' },
  { id: 'ton', name: 'Toncoin', symbol: 'TON', icon: '💎', color: 'from-blue-400 to-blue-600', network: 'TON', category: 'popular' },
  
  // Stablecoins
  { id: 'usdttrc20', name: 'Tether TRC20', symbol: 'USDT', icon: '₮', color: 'from-green-400 to-green-600', network: 'TRC-20', category: 'stablecoins' },
  { id: 'usdterc20', name: 'Tether ERC20', symbol: 'USDT', icon: '₮', color: 'from-green-400 to-green-600', network: 'ERC-20', category: 'stablecoins' },
  { id: 'usdtbep20', name: 'Tether BEP20', symbol: 'USDT', icon: '₮', color: 'from-green-400 to-green-600', network: 'BEP-20', category: 'stablecoins' },
  { id: 'usdtsol', name: 'Tether Solana', symbol: 'USDT', icon: '₮', color: 'from-green-400 to-green-600', network: 'Solana', category: 'stablecoins' },
  { id: 'usdc', name: 'USD Coin', symbol: 'USDC', icon: '$', color: 'from-blue-400 to-blue-600', network: 'ERC-20', category: 'stablecoins' },
  { id: 'usdcbep20', name: 'USD Coin BEP20', symbol: 'USDC', icon: '$', color: 'from-blue-400 to-blue-600', network: 'BEP-20', category: 'stablecoins' },
  { id: 'usdcsol', name: 'USD Coin Solana', symbol: 'USDC', icon: '$', color: 'from-blue-400 to-blue-600', network: 'Solana', category: 'stablecoins' },
  { id: 'dai', name: 'DAI', symbol: 'DAI', icon: '◈', color: 'from-yellow-500 to-orange-500', network: 'ERC-20', category: 'stablecoins' },
  { id: 'busd', name: 'Binance USD', symbol: 'BUSD', icon: '$', color: 'from-yellow-400 to-yellow-600', network: 'BEP-20', category: 'stablecoins' },
  
  // Meme coins
  { id: 'shib', name: 'Shiba Inu', symbol: 'SHIB', icon: '🐕', color: 'from-orange-400 to-red-500', network: 'ERC-20', category: 'altcoins' },
  { id: 'pepe', name: 'Pepe', symbol: 'PEPE', icon: '🐸', color: 'from-green-400 to-green-600', network: 'ERC-20', category: 'altcoins' },
  { id: 'floki', name: 'Floki', symbol: 'FLOKI', icon: '⚡', color: 'from-yellow-400 to-orange-500', network: 'BEP-20', category: 'altcoins' },
  { id: 'bonk', name: 'Bonk', symbol: 'BONK', icon: '🐶', color: 'from-orange-300 to-orange-500', network: 'Solana', category: 'altcoins' },
  
  // DeFi / Layer 2
  { id: 'link', name: 'Chainlink', symbol: 'LINK', icon: '⬡', color: 'from-blue-400 to-blue-600', network: 'ERC-20', category: 'altcoins' },
  { id: 'uni', name: 'Uniswap', symbol: 'UNI', icon: '🦄', color: 'from-pink-400 to-pink-600', network: 'ERC-20', category: 'altcoins' },
  { id: 'aave', name: 'Aave', symbol: 'AAVE', icon: '👻', color: 'from-purple-400 to-cyan-500', network: 'ERC-20', category: 'altcoins' },
  { id: 'mkr', name: 'Maker', symbol: 'MKR', icon: 'M', color: 'from-green-500 to-teal-600', network: 'ERC-20', category: 'altcoins' },
  { id: 'crv', name: 'Curve', symbol: 'CRV', icon: '↺', color: 'from-red-500 to-yellow-500', network: 'ERC-20', category: 'altcoins' },
  { id: 'arb', name: 'Arbitrum', symbol: 'ARB', icon: '⬢', color: 'from-blue-400 to-blue-600', network: 'Arbitrum', category: 'altcoins' },
  { id: 'op', name: 'Optimism', symbol: 'OP', icon: '⭕', color: 'from-red-400 to-red-600', network: 'Optimism', category: 'altcoins' },
  
  // Privacy
  { id: 'xmr', name: 'Monero', symbol: 'XMR', icon: 'ɱ', color: 'from-orange-500 to-gray-600', network: 'Monero', category: 'altcoins' },
  { id: 'zec', name: 'Zcash', symbol: 'ZEC', icon: 'Ⓩ', color: 'from-yellow-400 to-yellow-600', network: 'Zcash', category: 'altcoins' },
  { id: 'dash', name: 'Dash', symbol: 'DASH', icon: 'Đ', color: 'from-blue-400 to-blue-600', network: 'Dash', category: 'altcoins' },
  
  // Other popular
  { id: 'atom', name: 'Cosmos', symbol: 'ATOM', icon: '⚛', color: 'from-purple-500 to-black', network: 'Cosmos', category: 'altcoins' },
  { id: 'xlm', name: 'Stellar', symbol: 'XLM', icon: '✦', color: 'from-gray-500 to-black', network: 'Stellar', category: 'altcoins' },
  { id: 'algo', name: 'Algorand', symbol: 'ALGO', icon: 'Ⓐ', color: 'from-gray-400 to-gray-600', network: 'Algorand', category: 'altcoins' },
  { id: 'near', name: 'NEAR', symbol: 'NEAR', icon: 'Ⓝ', color: 'from-green-400 to-black', network: 'NEAR', category: 'altcoins' },
  { id: 'ftm', name: 'Fantom', symbol: 'FTM', icon: '◉', color: 'from-blue-400 to-blue-600', network: 'Fantom', category: 'altcoins' },
  { id: 'hbar', name: 'Hedera', symbol: 'HBAR', icon: 'ℏ', color: 'from-gray-400 to-black', network: 'Hedera', category: 'altcoins' },
  { id: 'vet', name: 'VeChain', symbol: 'VET', icon: 'V', color: 'from-blue-400 to-blue-600', network: 'VeChain', category: 'altcoins' },
  { id: 'egld', name: 'MultiversX', symbol: 'EGLD', icon: '✕', color: 'from-gray-400 to-gray-600', network: 'MultiversX', category: 'altcoins' },
  { id: 'xtz', name: 'Tezos', symbol: 'XTZ', icon: 'ꜩ', color: 'from-blue-400 to-blue-600', network: 'Tezos', category: 'altcoins' },
  { id: 'eos', name: 'EOS', symbol: 'EOS', icon: 'Ⓔ', color: 'from-gray-400 to-gray-600', network: 'EOS', category: 'altcoins' },
  { id: 'icp', name: 'Internet Computer', symbol: 'ICP', icon: '∞', color: 'from-purple-500 to-pink-500', network: 'ICP', category: 'altcoins' },
  { id: 'fil', name: 'Filecoin', symbol: 'FIL', icon: '⨍', color: 'from-blue-400 to-cyan-500', network: 'Filecoin', category: 'altcoins' },
  { id: 'sand', name: 'The Sandbox', symbol: 'SAND', icon: '□', color: 'from-blue-400 to-cyan-400', network: 'ERC-20', category: 'altcoins' },
  { id: 'mana', name: 'Decentraland', symbol: 'MANA', icon: '◇', color: 'from-red-400 to-pink-500', network: 'ERC-20', category: 'altcoins' },
  { id: 'apt', name: 'Aptos', symbol: 'APT', icon: 'A', color: 'from-teal-400 to-teal-600', network: 'Aptos', category: 'altcoins' },
]

const statusClass = (status) => {
  const value = String(status || '').toLowerCase()
  if (value === 'finished' || value === 'confirmed') return 'bg-emerald-500/15 text-emerald-400'
  if (value === 'waiting' || value === 'confirming') return 'bg-yellow-500/15 text-yellow-400'
  if (value === 'manual_credited') return 'bg-blue-500/15 text-blue-300'
  if (value === 'manual_marked') return 'bg-indigo-500/15 text-indigo-300'
  if (value === 'failed' || value === 'expired') return 'bg-red-500/15 text-red-400'
  return 'bg-dark-800 text-dark-300'
}

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

const sanitizeAmount = (value) => {
  const normalized = value.replace(',', '.')
  const stripped = normalized.replace(/[^0-9.]/g, '')
  const [whole, ...rest] = stripped.split('.')
  if (rest.length === 0) return whole
  return `${whole}.${rest.join('')}`
}

const formatAmount = (value) => {
  if (!value) return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num.toFixed(2)
}

export default function Deposit() {
  const { user, setUser, getEffectiveRole } = useAuthStore()
  const effectiveRole = getEffectiveRole()
  const isSellerView = effectiveRole === 'seller'
  const [selectedCrypto, setSelectedCrypto] = useState(CRYPTO_OPTIONS[0])
  const [copied, setCopied] = useState(false)
  const [amount, setAmount] = useState('')
  const [activeTab, setActiveTab] = useState('deposit')
  const [depositStatus, setDepositStatus] = useState({ status: 'idle', message: '' })
  const [depositInfo, setDepositInfo] = useState(null)
  const [balanceRefreshed, setBalanceRefreshed] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [depositHistory, setDepositHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [withdrawStatus, setWithdrawStatus] = useState({ status: 'idle', message: '' })
  const [withdrawals, setWithdrawals] = useState([])
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false)
  const [canWithdraw, setCanWithdraw] = useState(false)
  const [withdrawalFeePercent, setWithdrawalFeePercent] = useState(0)
  const [pendingWithdrawAmount, setPendingWithdrawAmount] = useState(0)
  const [withdrawPin, setWithdrawPin] = useState('')

  const [btcPrice, setBtcPrice] = useState(null)
  const [cryptoSearch, setCryptoSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('popular')
  const [showAllCryptos, setShowAllCryptos] = useState(false)

  const quickAmounts = [50, 100, 250, 500]

  // Filter cryptos based on search and category
  const filteredCryptos = useMemo(() => {
    let result = CRYPTO_OPTIONS
    
    if (cryptoSearch.trim()) {
      const search = cryptoSearch.toLowerCase()
      result = result.filter(c => 
        c.name.toLowerCase().includes(search) || 
        c.symbol.toLowerCase().includes(search) ||
        c.network.toLowerCase().includes(search)
      )
    } else {
      result = result.filter(c => c.category === selectedCategory)
    }
    
    return result
  }, [cryptoSearch, selectedCategory])

  useEffect(() => {
    const fetchBtcPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await res.json()
        if (data?.bitcoin?.usd) setBtcPrice(data.bitcoin.usd)
      } catch { /* ignore */ }
    }
    fetchBtcPrice()
    const interval = setInterval(fetchBtcPrice, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setDepositInfo(null)
    setDepositStatus({ status: 'idle', message: '' })
    setBalanceRefreshed(false)
    setQrDataUrl('')
  }, [selectedCrypto.id])

  const loadDepositHistory = async () => {
    setHistoryLoading(true)
    try {
      const { data } = await api.get('/api/payments/nowpayments/deposits')
      setDepositHistory(data)
    } catch {
      setDepositHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadDepositHistory()
    loadWithdrawals()
    loadWalletOverview()
  }, [])

  const loadWalletOverview = async () => {
    try {
      const { data } = await api.get('/api/wallet')
      setCanWithdraw(!!data.can_withdraw)
      setWithdrawalFeePercent(data.withdrawal_fee_percent || 0)
      setPendingWithdrawAmount(data.pending_withdrawal_amount || 0)
    } catch {
      setCanWithdraw(false)
    }
  }

  const loadWithdrawals = async () => {
    setWithdrawalsLoading(true)
    try {
      const { data } = await api.get('/api/wallet/withdrawals')
      setWithdrawals(data)
    } catch {
      setWithdrawals([])
    } finally {
      setWithdrawalsLoading(false)
    }
  }



  useEffect(() => {
    if (!depositInfo?.pay_address) {
      setQrDataUrl('')
      return
    }

    let isActive = true
    const buildQr = async () => {
      try {
        const url = await QRCode.toDataURL(depositInfo.pay_address, {
          width: 160,
          margin: 1
        })
        if (isActive) setQrDataUrl(url)
      } catch {
        if (isActive) setQrDataUrl('')
      }
    }

    buildQr()
    return () => {
      isActive = false
    }
  }, [depositInfo?.pay_address])

  useEffect(() => {
    if (!depositInfo?.deposit_id) return

    let isActive = true
    const pollStatus = async () => {
      try {
        const { data } = await api.get(`/api/payments/nowpayments/deposits/${depositInfo.deposit_id}`)
        if (!isActive) return
        setDepositInfo(prev => ({ ...prev, ...data }))
        if (data.is_credited && !balanceRefreshed) {
          const userRes = await api.get('/api/auth/me')
          setUser(userRes.data)
          setBalanceRefreshed(true)
          loadDepositHistory()
        }
      } catch {
        // Ignore polling errors; user can retry by refreshing or creating a new deposit.
      }
    }

    pollStatus()
    const timer = setInterval(pollStatus, 10000)
    return () => {
      isActive = false
      clearInterval(timer)
    }
  }, [depositInfo?.deposit_id, balanceRefreshed, setUser])

  const handleCopy = () => {
    if (!depositInfo?.pay_address) return
    navigator.clipboard.writeText(depositInfo.pay_address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDeposit = async () => {
    const value = parseFloat(amount)
    if (!value || value < 10) {
      setDepositStatus({ status: 'error', message: 'Minimum deposit is $10.' })
      return
    }
    setDepositStatus({ status: 'loading', message: '' })
    setDepositInfo(null)
    try {
      const { data } = await api.post('/api/payments/nowpayments/create', {
        amount: value,
        pay_currency: selectedCrypto.id
      })
      setDepositInfo(data)
      setDepositStatus({ status: 'success', message: 'Send crypto to the address below.' })
      loadDepositHistory()
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Deposit failed.'
      setDepositStatus({ status: 'error', message: detail })
    }
  }

  const handleWithdraw = async () => {
    const value = parseFloat(withdrawAmount)
    if (!value || value <= 0) {
      setWithdrawStatus({ status: 'error', message: 'Enter a valid amount.' })
      return
    }
    const addr = withdrawAddress.trim()
    if (!addr.startsWith('T') || addr.length !== 34) {
      setWithdrawStatus({ status: 'error', message: 'Invalid TRC-20 address. Must start with T and be 34 characters.' })
      return
    }
    if (!withdrawPin || withdrawPin.length < 4) {
      setWithdrawStatus({ status: 'error', message: 'Enter your PIN code to confirm withdrawal.' })
      return
    }
    setWithdrawStatus({ status: 'loading', message: '' })
    try {
      await api.post('/api/wallet/withdraw', {
        amount: value,
        address: addr,
        pin: withdrawPin
      })
      const userRes = await api.get('/api/auth/me')
      setUser(userRes.data)
      setWithdrawStatus({ status: 'success', message: 'Withdrawal request submitted. USDT will be sent after admin approval.' })
      setWithdrawAmount('')
      setWithdrawAddress('')
      setWithdrawPin('')
      loadWithdrawals()
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Withdrawal request failed.'
      setWithdrawStatus({ status: 'error', message: detail })
      setWithdrawPin('')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-bold">Wallet</h1>
        <p className="text-dark-400 text-xs">Deposit cryptocurrency to fund your account</p>
      </div>

      {/* Balance Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500/20 via-dark-900 to-accent-purple/20 p-4"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/20 blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent-purple/20 blur-3xl rounded-full" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 text-dark-400">
            <Wallet size={18} />
            <span className="text-sm">Available Balance</span>
          </div>
          <h2 className="font-display text-3xl font-bold mb-1">
            ${user?.balance?.toFixed(2) || '0.00'}
          </h2>
          <p className="text-dark-400 text-sm">
            {btcPrice
              ? `≈ ${((user?.balance || 0) / btcPrice).toFixed(6)} BTC`
              : '...'}
          </p>
          
          {/* Pending Withdrawal */}
          {pendingWithdrawAmount > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-400">Pending Withdraw</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-orange-400">${pendingWithdrawAmount.toFixed(2)}</span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-400 text-[10px] font-medium">
                    ⏳ Awaiting
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-dark-500 mt-1">Withdrawal request pending admin approval.</p>
            </div>
          )}

          {/* Escrow Balance (locked/held) */}
          {(user?.escrow_balance || 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-400">Hold Balance</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-yellow-400">${user.escrow_balance.toFixed(2)}</span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-400 text-[10px] font-medium">
                    🔒 Locked
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-dark-500 mt-1">Released to your balance after the lock-in period expires.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Withdraw Toggle */}
      {canWithdraw && (user?.balance > 0) && (
        <div className="flex justify-end">
          <button
            onClick={() => setActiveTab(activeTab === 'withdraw' ? 'deposit' : 'withdraw')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'withdraw'
                ? 'bg-primary-500 text-white ring-2 ring-primary-400/60 shadow-lg shadow-primary-500/20'
                : 'bg-dark-800 text-dark-300 hover:text-dark-50'
            }`}
          >
            <ArrowUpCircle size={16} />
            {activeTab === 'withdraw' ? 'Back to Deposit' : 'Withdraw'}
          </button>
        </div>
      )}

      {activeTab === 'deposit' && (
        <>
          {/* Crypto Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-dark-400">Select Cryptocurrency</label>
              <span className="text-xs text-dark-500">{CRYPTO_OPTIONS.length} available</span>
            </div>
            
            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                value={cryptoSearch}
                onChange={(e) => setCryptoSearch(e.target.value)}
                placeholder="Search coins..."
                className="w-full bg-dark-800 border border-dark-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            
            {/* Category Tabs */}
            {!cryptoSearch && (
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                {CRYPTO_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-primary-500/20 text-primary-400 ring-1 ring-primary-500/50'
                        : 'bg-dark-800 text-dark-400 hover:text-dark-50'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Crypto Grid */}
            <div className={`grid grid-cols-2 gap-2 ${filteredCryptos.length > 6 && !showAllCryptos ? 'max-h-[260px] overflow-hidden' : ''} -m-1 p-1`}>
              {(showAllCryptos ? filteredCryptos : filteredCryptos.slice(0, 8)).map(crypto => (
                <button
                  key={crypto.id}
                  onClick={() => setSelectedCrypto(crypto)}
                  className={`card p-2.5 text-left transition-all ${
                    selectedCrypto.id === crypto.id 
                      ? 'ring-2 ring-primary-500 bg-primary-500/10' 
                      : 'hover:bg-dark-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${crypto.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                      {crypto.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{crypto.symbol}</p>
                      <p className="text-[10px] text-dark-400 truncate">{crypto.network}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Show More/Less */}
            {filteredCryptos.length > 8 && (
              <button
                onClick={() => setShowAllCryptos(!showAllCryptos)}
                className="w-full flex items-center justify-center gap-1 py-2 text-xs text-dark-400 hover:text-dark-50 transition-colors"
              >
                <span>{showAllCryptos ? 'Show less' : `Show all ${filteredCryptos.length} coins`}</span>
                <ChevronDown size={14} className={`transition-transform ${showAllCryptos ? 'rotate-180' : ''}`} />
              </button>
            )}
            
            {filteredCryptos.length === 0 && (
              <div className="text-center py-4 text-dark-400 text-sm">
                No cryptocurrencies found
              </div>
            )}
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <label className="text-sm text-dark-400">Amount (USD)</label>
            <div className="relative rounded-xl focus-within:ring-2 focus-within:ring-primary-500/60 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-dark-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                onBlur={() => setAmount(formatAmount(amount))}
                placeholder="0.00"
                className="w-full bg-dark-800 border border-dark-700 rounded-xl py-3 pl-9 pr-4 text-lg font-semibold focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/70 focus:bg-dark-700/70 caret-primary-300 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    const current = parseFloat(amount || '0')
                    const next = Number.isFinite(current) ? current + amt : amt
                    setAmount(String(next))
                    setDepositStatus({ status: 'idle', message: '' })
                  }}
                  className="flex-1 py-1.5 text-xs bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors"
                >
                  ${amt}
                </button>
              ))}
            </div>
            <button
              onClick={handleDeposit}
              disabled={depositStatus.status === 'loading'}
              className="btn-primary w-full py-2"
            >
              {depositStatus.status === 'loading' ? 'Creating...' : 'Generate Deposit Address'}
            </button>
            {depositStatus.message && (
              <p className={`text-sm ${depositStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                {depositStatus.message}
              </p>
            )}
          </div>

          {/* Deposit Address */}
          {depositInfo && (
            <motion.div 
              key={depositInfo.payment_id || selectedCrypto.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-4 space-y-3"
            >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Deposit Address</h3>
                <p className="text-xs text-dark-400">{selectedCrypto.network}</p>
              </div>
              {depositInfo.payment_status && (
                <span className={`text-xs px-2 py-1 rounded-full ${statusClass(depositInfo.payment_status)}`}>
                  {depositInfo.payment_status}
                </span>
              )}
              <button className="p-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors">
                <QrCode size={18} />
              </button>
            </div>

            {/* QR Code Placeholder */}
            <div className="flex justify-center py-2">
              <div className="w-28 h-28 bg-white rounded-xl p-2">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR for ${depositInfo.pay_currency?.toUpperCase()}`}
                    className="w-full h-full rounded-lg"
                  />
                ) : (
                  <div className="w-full h-full bg-dark-200 rounded-lg flex items-center justify-center">
                    <span className="text-dark-600 text-xs text-center p-2">QR Code loading</span>
                  </div>
                )}
              </div>
            </div>

            {/* Address Copy */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-dark-800 rounded-lg">
                <code className="flex-1 text-xs break-all text-dark-200">
                  {depositInfo.pay_address}
                </code>
                <button 
                  onClick={handleCopy}
                  className="p-2 hover:bg-dark-700 rounded-lg transition-colors flex-shrink-0"
                >
                  {copied ? (
                    <Check size={18} className="text-primary-400" />
                  ) : (
                    <Copy size={18} className="text-dark-400" />
                  )}
                </button>
              </div>
              {copied && (
                <p className="text-primary-400 text-xs text-center">Address copied!</p>
              )}
            </div>

            {/* Warning */}
            <div className="flex gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle size={18} className="text-yellow-500 flex-shrink-0" />
              <div className="text-xs">
                <p className="text-yellow-400 font-medium">Important</p>
                <p className="text-dark-400">Send exactly {depositInfo.pay_amount} {depositInfo.pay_currency?.toUpperCase()}.</p>
              </div>
            </div>
            {depositInfo.confirmations !== undefined && (
              <div className="flex justify-between text-xs text-dark-400">
                <span>Confirmations</span>
                <span>{depositInfo.confirmations}</span>
              </div>
            )}
            {depositInfo.is_credited && (
              <p className="text-xs text-primary-400">Balance credited.</p>
            )}
          </motion.div>
          )}

          {/* Info */}
          <div className="card p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-dark-400">Minimum deposit</span>
              <span>$10.00</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-dark-400">Network fee</span>
              <span>~$0.50</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-dark-400">Confirmations needed</span>
              <span>{selectedCrypto.id === 'btc' ? '2' : selectedCrypto.id === 'eth' ? '12' : '1'}</span>
            </div>
            {depositInfo?.price_amount_usd ? (
              <div className="flex justify-between text-xs">
                <span className="text-dark-400">Estimated USD</span>
                <span>${depositInfo.price_amount_usd.toFixed(2)}</span>
              </div>
            ) : null}
          </div>
        </>
      )}

      {activeTab === 'deposit' && (
        <div className="card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Deposit History</h3>
            <button
              onClick={loadDepositHistory}
              className="text-xs text-dark-400 hover:text-dark-50"
            >
              Refresh
            </button>
          </div>
          {historyLoading ? (
            <p className="text-xs text-dark-400">Loading deposits...</p>
          ) : depositHistory.length === 0 ? (
            <p className="text-xs text-dark-400">No deposits yet.</p>
          ) : (
            <div className="space-y-2">
              {depositHistory.map(dep => (
                <div key={dep.deposit_id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-dark-900/60 border border-dark-800">
                  <div>
                    <p className="text-xs font-medium">
                      ${dep.price_amount_usd?.toFixed(2)} • {dep.pay_currency?.toUpperCase() || '-'}
                    </p>
                    <p className="text-[11px] text-dark-400">{formatDate(dep.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[11px] px-2 py-1 rounded-full ${statusClass(dep.payment_status)}`}>
                      {dep.payment_status}
                    </span>
                    <p className="text-[11px] text-dark-400 mt-1">Conf: {dep.confirmations ?? 0}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="space-y-3">
          <div className="card p-4 space-y-3">
            <div>
              <label className="block text-xs text-dark-400 mb-2">Amount (USD)</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="input py-2 text-sm"
                placeholder="0.00"
              />
            </div>

            {/* Fee Preview */}
            {withdrawalFeePercent > 0 && withdrawAmount && parseFloat(withdrawAmount) > 0 && (() => {
              const amt = parseFloat(withdrawAmount)
              const fee = Math.round(amt * withdrawalFeePercent) / 100
              const net = Math.round((amt - fee) * 100) / 100
              return (
                <div className="p-2.5 bg-dark-800/70 rounded-lg space-y-1.5 border border-dark-700/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-dark-400">Fee ({withdrawalFeePercent}%)</span>
                    <span className="text-red-400">-${fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-dark-400">You'll receive</span>
                    <span className="text-primary-400">${net > 0 ? net.toFixed(2) : '0.00'} USDT</span>
                  </div>
                </div>
              )
            })()}

            <div>
              <label className="block text-xs text-dark-400 mb-2">USDT Address (TRC-20)</label>
              <input
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                className="input py-2 text-sm font-mono"
                placeholder="T..."
                maxLength={34}
              />
              <p className="text-[10px] text-dark-500 mt-1">Tron (TRC-20) address only. Must start with T.</p>
            </div>

            {/* PIN Code - mandatory for withdrawals */}
            {!user?.has_pin ? (
              <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <Lock size={18} className="text-yellow-400 shrink-0" />
                <div className="text-sm">
                  <p className="text-yellow-300 font-medium">PIN Required</p>
                  <p className="text-dark-400 text-xs">Set a PIN code in <a href="/settings" className="text-primary-400 underline">Settings &gt; Security</a> to enable withdrawals.</p>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-dark-400 mb-2">PIN Code</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={withdrawPin}
                  onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, ''))}
                  className="input py-2 text-sm text-center tracking-[0.3em]"
                  placeholder="Enter PIN"
                  maxLength={6}
                />
              </div>
            )}

            <button
              onClick={handleWithdraw}
              disabled={withdrawStatus.status === 'loading' || !user?.has_pin}
              className="btn-primary w-full py-2 disabled:opacity-50"
            >
              {withdrawStatus.status === 'loading' ? 'Submitting...' : 'Request Withdrawal'}
            </button>
            {withdrawStatus.message && (
              <p className={`text-sm ${withdrawStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                {withdrawStatus.message}
              </p>
            )}
            <div className="flex gap-2 p-2.5 bg-dark-800 rounded-lg">
              <AlertCircle size={14} className="text-dark-400 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-dark-400">
                <p>Withdrawals are sent as <span className="text-dark-50 font-medium">USDT (TRC-20)</span> after admin approval.</p>
                <p className="mt-0.5">Minimum: <span className="text-dark-50">$10.00</span>{withdrawalFeePercent > 0 ? ` · Fee: ${withdrawalFeePercent}%` : ''}</p>
              </div>
            </div>
          </div>

          {/* Withdrawal History */}
          <div className="card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Withdrawal History</h3>
              <button onClick={loadWithdrawals} className="text-xs text-dark-400 hover:text-dark-50">Refresh</button>
            </div>
            {withdrawalsLoading ? (
              <p className="text-xs text-dark-400">Loading...</p>
            ) : withdrawals.length === 0 ? (
              <p className="text-xs text-dark-400">No withdrawal requests yet.</p>
            ) : (
              <div className="space-y-2">
                {withdrawals.map(wr => (
                  <div key={wr.id} className="p-2.5 rounded-lg bg-dark-900/60 border border-dark-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">${wr.amount?.toFixed(2)}</p>
                        {(wr.fee_amount > 0) && (
                          <p className="text-[10px] text-dark-500">Fee: ${wr.fee_amount?.toFixed(2)} · Net: ${wr.net_amount?.toFixed(2)}</p>
                        )}
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                        wr.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' :
                        wr.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                        wr.status === 'processing' ? 'bg-blue-500/15 text-blue-400' :
                        wr.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                        'bg-yellow-500/15 text-yellow-400'
                      }`}>
                        {wr.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-dark-400 font-mono truncate">{wr.destination || '-'}</p>
                    {wr.payout_hash && (
                      <a
                        href={`https://tronscan.org/#/transaction/${wr.payout_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary-400 hover:underline truncate block"
                      >
                        TX: {wr.payout_hash.slice(0, 16)}...
                      </a>
                    )}
                    <p className="text-[11px] text-dark-500">{formatDate(wr.created_at)}</p>
                    {wr.admin_note && <p className="text-[11px] text-dark-400 italic">{wr.admin_note}</p>}
                    {wr.payout_error && <p className="text-[11px] text-red-400">{wr.payout_error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
