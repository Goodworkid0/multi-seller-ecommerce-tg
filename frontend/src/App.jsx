import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState, Component } from 'react'
import { useAuthStore } from './store/authStore'
import { useBrandingStore } from './store/brandingStore'

// Pages
import HomeRole from './pages/HomeRole'
import Products from './pages/Products'
import Services from './pages/Services'
import ServiceDetail from './pages/ServiceDetail'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Orders from './pages/Orders'
import Settings from './pages/Settings'
import Deposit from './pages/Deposit'
import SellerProfile from './pages/SellerProfile'
import OrderDetail from './pages/OrderDetail'
import Notifications from './pages/Notifications'
import Middleman from './pages/Middleman'
import MiddlemanDeal from './pages/MiddlemanDeal'
import Blacklist from './pages/Blacklist'
import Referrals from './pages/Referrals'
import Inquiries from './pages/Inquiries'
import InquiryChat from './pages/InquiryChat'
import WantToBuy from './pages/WantToBuy'
import WtbDetail from './pages/WtbDetail'
import Messages from './pages/Messages'
import DMChat from './pages/DMChat'
import Giveaways from './pages/Giveaways'
import Layout from './components/Layout'
import PinLock from './components/PinLock'
import { ToastProvider } from './components/Toast'
import ConfirmModal from './components/ConfirmModal'
import SellerLayout from './components/SellerLayout'
import SellerDashboard from './pages/seller/Dashboard'
import SellerOrders from './pages/seller/Orders'
import SellerMessages from './pages/seller/Messages'
import SellerProducts from './pages/seller/Products'
import SellerServices from './pages/seller/Services'
import SellerAuctions from './pages/seller/Auctions'
import SellerSettings from './pages/seller/Settings'
import SellerAdvertising from './pages/seller/Advertising'
import SellerReviews from './pages/seller/Reviews'
import Auctions from './pages/Auctions'
import AuctionDetail from './pages/AuctionDetail'

// Error boundary — prevents blank screen on uncaught render errors
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err, info) { console.error('React crash:', err, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 bg-dark-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h1 className="font-display font-bold text-xl text-dark-100 mb-2">Something went wrong</h1>
            <p className="text-dark-400 text-sm mb-6">An unexpected error occurred. Please reload the app.</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
              className="inline-flex items-center gap-2 bg-dark-800 hover:bg-dark-700 text-dark-200 font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Service unavailable screen
function ServiceDown() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-dark-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-dark-400">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h1 className="font-display font-bold text-xl text-dark-100 mb-2">Service Unavailable</h1>
        <p className="text-dark-400 text-sm mb-6">We're experiencing technical difficulties. Please try again later.</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 bg-dark-800 hover:bg-dark-700 text-dark-200 font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Try Again
        </button>
      </div>
    </div>
  )
}

// Loading screen
function LoadingScreen() {
  const { appName, logoUrl, loaded } = useBrandingStore()
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="text-center">
        {loaded && appName ? (
          // Branding loaded — show brand
          <>
            {logoUrl ? (
              <img src={logoUrl} alt={appName} className="w-16 h-16 rounded-2xl mx-auto mb-4 animate-pulse object-cover" />
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                <span className="text-2xl font-bold">{appName?.[0] || ''}</span>
              </div>
            )}
            <h1 className="font-display font-bold text-xl gradient-text mb-2">{appName}</h1>
          </>
        ) : (
          // Branding not loaded yet — show generic spinner
          <div className="w-16 h-16 bg-dark-800 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <p className="text-dark-400 text-sm">Loading...</p>
      </div>
    </div>
  )
}

// Telegram-only gate — blocks browser access in production
function TelegramGate() {
  const { appName, logoUrl, botUsername } = useBrandingStore()
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        {logoUrl ? (
          <img src={logoUrl} alt={appName} className="w-20 h-20 rounded-2xl mx-auto mb-6 object-cover" />
        ) : (
          <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl font-bold">{appName?.[0] || ''}</span>
          </div>
        )}
        <h1 className="font-display font-bold text-2xl gradient-text mb-3">{appName}</h1>
        <p className="text-dark-300 text-sm mb-6">This app is only available inside Telegram.</p>
        <a
          href={`https://t.me/${botUsername}`}
          className="inline-flex items-center gap-2 bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.2-.04-.28-.02-.12.02-2.02 1.28-5.69 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.28-1.51-.42-1.45-.89.03-.25.38-.5 1.04-.78 4.07-1.77 6.79-2.94 8.15-3.51 3.88-1.62 4.69-1.9 5.21-1.91.12 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z"/></svg>
          Open in Telegram
        </a>
        <p className="text-dark-500 text-xs mt-4">Search for @{botUsername} in Telegram</p>
        
        {/* Blacklist Link */}
        <a
          href="/blacklist"
          className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 text-sm mt-6 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
          View Blacklist
        </a>
      </div>
    </div>
  )
}

// Check if we're inside Telegram WebApp
const isTelegramWebApp = () => {
  const tg = window.Telegram?.WebApp
  // Check if initData exists (only present when opened from Telegram)
  if (tg?.initData && tg.initData.length > 0) return true
  // Check if user data is available
  if (tg?.initDataUnsafe?.user) return true
  return false
}

function App() {
  const { initTelegram, restoreSession, devLogin, isInitialized, isLoading, isTelegram, user } = useAuthStore()
  const [blockedByGate, setBlockedByGate] = useState(false)
  const [pinLocked, setPinLocked] = useState(false)

  // Check if PIN lock is needed after auth resolves
  useEffect(() => {
    if (isInitialized && user?.has_pin && !sessionStorage.getItem('pin_verified')) {
      setPinLocked(true)
    }
  }, [isInitialized, user?.has_pin])

  useEffect(() => {
    // Load branding first (no auth needed)
    useBrandingStore.getState().load().then(() => {
      const name = useBrandingStore.getState().appName
      if (name) document.title = name
    })

    const init = async () => {
      // In production builds, enforce Telegram-only access
      if (!import.meta.env.DEV && !isTelegramWebApp()) {
        // Allow if user has a restored session (e.g. PWA fallback)
        const hasSession = await restoreSession()
        if (!hasSession) {
          setBlockedByGate(true)
          return
        }
      }

      // If in Telegram context, always authenticate via initTelegram
      // so login history is properly recorded
      if (isTelegramWebApp()) {
        await initTelegram()
      } else {
        // Non-Telegram: try to restore existing session first
        const hasSession = await restoreSession()
        
        if (!hasSession) {
          await initTelegram()
          
          // Development mode - auto login for testing
          if (import.meta.env.DEV && !window.Telegram?.WebApp?.initDataUnsafe?.user) {
            console.log('Dev mode: auto-login')
            await devLogin('123456789')
          }
        }
      }
    }
    
    init()
  }, [])

  // Telegram gate — block browser access in production
  if (blockedByGate) {
    return <TelegramGate />
  }

  // Service down — backend unreachable
  if (useBrandingStore.getState().loadError && !useBrandingStore.getState().appName) {
    return <ServiceDown />
  }

  // Show loading screen while initializing
  if (!isInitialized || isLoading) {
    return <LoadingScreen />
  }

  // PIN lock screen
  if (pinLocked) {
    return <PinLock onUnlock={() => setPinLocked(false)} />
  }

  return (
    <ErrorBoundary>
    <ToastProvider>
    <ConfirmModal />
    <BrowserRouter>
      <Routes>
        {/* Main Shop Routes */}
        <Route path="/" element={<Layout />}>
          <Route index element={<HomeRole />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="services" element={<Services />} />
          <Route path="services/:id" element={<ServiceDetail />} />
          <Route path="auctions" element={<Auctions />} />
          <Route path="auctions/:id" element={<AuctionDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="deposit" element={<Deposit />} />
          <Route path="shop/:id" element={<SellerProfile />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="middleman" element={<Middleman />} />
          <Route path="middleman/:id" element={<MiddlemanDeal />} />
          <Route path="blacklist" element={<Blacklist />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="wtb" element={<WantToBuy />} />
          <Route path="wtb/:id" element={<WtbDetail />} />
          <Route path="giveaways" element={<Giveaways />} />
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:id" element={<DMChat />} />
          <Route path="inquiries" element={<Inquiries />} />
          <Route path="inquiries/:id" element={<InquiryChat />} />
        </Route>
        
        {/* Seller Dashboard Routes */}
        <Route path="/seller" element={<SellerLayout />}>
          <Route index element={<SellerDashboard />} />
          <Route path="messages" element={<SellerMessages />} />
          <Route path="orders" element={<SellerOrders />} />
          <Route path="products" element={<SellerProducts />} />
          <Route path="services" element={<SellerServices />} />
          <Route path="auctions" element={<SellerAuctions />} />
          <Route path="advertising" element={<SellerAdvertising />} />
          <Route path="reviews" element={<SellerReviews />} />
          <Route path="settings" element={<SellerSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
