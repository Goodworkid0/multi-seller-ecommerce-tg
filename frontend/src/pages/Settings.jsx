import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Shield, Moon, Sun, Globe, Bell,
  ChevronRight, LogOut, Camera, Check, X,
  Store, Lock, Zap, DollarSign, ArrowUpCircle, AlertTriangle, Clock, Crown,
  Smartphone, History, ShieldCheck, ShieldOff
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBrandingStore } from '../store/brandingStore'
import { useThemeStore } from '../store/themeStore'
import api from '../lib/api'

export default function Settings() {
  const { user, logout, viewRole, setViewRole, clearViewRole, getEffectiveRole, setUser } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')
  const [activeTab, setActiveTab] = useState('profile')
  const [nameForm, setNameForm] = useState({
    first_name: user?.first_name || '',
    username: user?.username || ''
  })
  const [nameStatus, setNameStatus] = useState({ status: 'idle', message: '' })
  const [contactForm, setContactForm] = useState({
    email: user?.email || '',
    other_contact: user?.other_contact || ''
  })
  const [contactStatus, setContactStatus] = useState({ status: 'idle', message: '' })
  const [showContactModal, setShowContactModal] = useState(false)
  const [showNameModal, setShowNameModal] = useState(false)
  const [upgradeForm, setUpgradeForm] = useState({ shop_name: '', shop_description: '' })
  const [upgradeStatus, setUpgradeStatus] = useState({ status: 'idle', message: '' })
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [selectedRank, setSelectedRank] = useState(0)
  const [ranks, setRanks] = useState([
    { rank: 1, name: 'Bronze', price: 50, badge_color: '#CD7F32', featured_days: 0 },
    { rank: 2, name: 'Silver', price: 100, badge_color: '#C0C0C0', featured_days: 14 },
    { rank: 3, name: 'Gold', price: 200, badge_color: '#FFD700', featured_days: 30 },
  ])

  // Security tab state
  const [loginHistory, setLoginHistory] = useState([])
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false)
  const [showLoginHistory, setShowLoginHistory] = useState(false)
  const [terminatingAll, setTerminatingAll] = useState(false)
  const [pinMode, setPinMode] = useState(null) // null | 'set' | 'change' | 'remove'
  const [pinInput, setPinInput] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinOld, setPinOld] = useState('')
  const [pinStep, setPinStep] = useState(1) // 1=enter, 2=confirm
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  // Notification prefs state
  const [notifPrefs, setNotifPrefs] = useState(null)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)

  // Auto-open upgrade modal when ?upgrade=true
  useEffect(() => {
    if (searchParams.get('upgrade') === 'true' && !user?.shop_name) {
      setShowUpgradeModal(true)
      setSearchParams({})  // Clear the param
    }
  }, [searchParams, user?.shop_name, setSearchParams])

  useEffect(() => {
    setNameForm({
      first_name: user?.first_name || '',
      username: user?.username || ''
    })
  }, [user?.first_name, user?.username])

  useEffect(() => {
    setContactForm({
      email: user?.email || '',
      other_contact: user?.other_contact || ''
    })
  }, [user?.email, user?.other_contact])

  useEffect(() => {
    const loadRanks = async () => {
      try {
        const { data } = await api.get('/api/sellers/ranks')
        if (data?.ranks?.length > 0) {
          setRanks(data.ranks)
          setSelectedRank((prev) => (
            data.ranks.some((r) => r.rank === prev) ? prev : data.ranks[0].rank
          ))
        }
      } catch {
      }
    }

    loadRanks()
  }, [])

  const baseRole = (user?.role || 'buyer').toLowerCase()
  const effectiveRole = getEffectiveRole()
  const isSeller = effectiveRole === 'seller'
  const hasShop = !!user?.shop_name
  const isFree = hasShop && (user?.seller_rank || 0) === 0
  const sellerActive = hasShop && !isFree && user?.seller_expires_at && new Date(user.seller_expires_at) > new Date()
  const sellerExpired = hasShop && !isFree && (!user?.seller_expires_at || new Date(user.seller_expires_at) <= new Date())

  const minPrice = 0  // free tier available

  const daysUntilExpiry = sellerActive
    ? Math.ceil((new Date(user.seller_expires_at) - new Date()) / (1000 * 60 * 60 * 24))
    : 0

  const handleUpgrade = async () => {
    if (!upgradeForm.shop_name.trim()) {
      setUpgradeStatus({ status: 'error', message: 'Shop name is required.' })
      return
    }
    const rankInfo = ranks.find(r => r.rank === selectedRank)
    if (!rankInfo) return
    if (rankInfo.price > 0 && (user?.balance || 0) < rankInfo.price) {
      setUpgradeStatus({ status: 'error', message: `Insufficient balance. Need $${rankInfo.price}. Current: $${(user?.balance || 0).toFixed(2)}` })
      return
    }
    setUpgradeStatus({ status: 'loading', message: '' })
    try {
      await api.post(`/api/sellers/become-seller?shop_name=${encodeURIComponent(upgradeForm.shop_name.trim())}&shop_description=${encodeURIComponent(upgradeForm.shop_description.trim())}&rank=${selectedRank}`)
      const { data } = await api.get('/api/auth/me')
      setUser(data)
      setUpgradeStatus({ status: 'success', message: `${rankInfo.name} seller account created!` })
    } catch (error) {
      setUpgradeStatus({ status: 'error', message: error?.response?.data?.detail || 'Upgrade failed.' })
    }
  }

  const handleRenew = async () => {
    const rankInfo = ranks.find(r => r.rank === selectedRank)
    if (!rankInfo) return
    if ((user?.balance || 0) < rankInfo.price) {
      setUpgradeStatus({ status: 'error', message: `Insufficient balance. Need $${rankInfo.price}. Current: $${(user?.balance || 0).toFixed(2)}` })
      return
    }
    setUpgradeStatus({ status: 'loading', message: '' })
    try {
      await api.post(`/api/sellers/rank/buy/${selectedRank}`)
      const { data } = await api.get('/api/auth/me')
      setUser(data)
      setUpgradeStatus({ status: 'success', message: `${rankInfo.name} rank renewed!` })
    } catch (error) {
      setUpgradeStatus({ status: 'error', message: error?.response?.data?.detail || 'Renewal failed.' })
    }
  }

  const roleBadgeClass = (role) => {
    if (role === 'admin') return 'bg-red-500/20 text-red-400'
    if (role === 'seller') return 'bg-primary-500/20 text-primary-400'
    return 'bg-dark-700 text-dark-300'
  }

  const formatDate = (value) => {
    const date = new Date(value)
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const yyyy = date.getFullYear()
    return `${mm}.${dd}.${yyyy}`
  }

  const formatTimeAgo = (date) => {
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return formatDate(date)
  }

  const translations = {
    en: {
      settings: 'Settings',
      manage_prefs: 'Manage your account preferences',
      profile: 'Profile',
      notifications: 'Notifications',
      security: 'Security',
      payments: 'Payment Methods',
      username: 'Username',
      telegram_id: 'Telegram ID',
      email: 'Email',
      other_contact: 'Other Contact',
      member_since: 'Member Since',
      edit_contact: 'Edit Contact Info',
      contact_info: 'Contact Info',
      contact_hint: 'Add a contact method for buyers or support.',
      save_changes: 'Save Changes',
      saving: 'Saving...',
      change: 'Change',
      change_username: 'Change Username',
      privacy_handle: 'Privacy Handle',
      hide_handle: 'Hide your Telegram handle for $50.',
      custom_handle_active: 'Custom handle active. Telegram handle will no longer sync.',
      custom_handle_inactive: 'After purchase, your Telegram handle will no longer sync on login.',
      display_name: 'Display Name',
      handle: 'Handle',
      pay_change: 'Pay $50 and Change',
      processing: 'Processing...',
      language: 'Language',
      dark_mode: 'Dark Mode',
      light_mode: 'Light Mode',
      always_on: 'Always On',
      log_out: 'Log Out',
      order_updates: 'Order Updates',
      promotions: 'Promotions',
      security_alerts: 'Security Alerts',
      order_desc: 'Get notified about order status',
      promo_desc: 'Receive deals and offers',
      security_desc: 'Important account activity',
      two_factor: 'Two-Factor Auth',
      two_factor_value: 'Enabled via Telegram',
      active_sessions: 'Active Sessions',
      login_history: 'Login History',
      device_count: '1 device',
      view_all: 'View all',
      terminate_all: 'Terminate All Sessions',
      terminate_confirm: 'This will log you out from all other devices. Continue?',
      terminate_success: 'All other sessions terminated',
      no_login_history: 'No login history yet',
      current_session: 'Current Session',
      pin_code: 'PIN Code',
      pin_desc: 'Protect your account with a PIN',
      pin_enabled: 'Enabled',
      pin_disabled: 'Not set',
      set_pin: 'Set PIN',
      change_pin: 'Change PIN',
      remove_pin: 'Remove PIN',
      enter_pin: 'Enter PIN',
      confirm_pin: 'Confirm PIN',
      enter_current_pin: 'Enter Current PIN',
      enter_new_pin: 'Enter New PIN',
      confirm_new_pin: 'Confirm New PIN',
      pin_mismatch: 'PINs do not match',
      pin_set_success: 'PIN set successfully',
      pin_changed_success: 'PIN changed successfully',
      pin_removed_success: 'PIN removed',
      pin_digits: '4-6 digits',
      crypto_wallet: 'Crypto Wallet',
      no_wallet: 'No wallet linked',
      transaction_history: 'Transaction History'
    },
    ru: {
      settings: 'Настройки',
      manage_prefs: 'Управляйте настройками аккаунта',
      profile: 'Профиль',
      notifications: 'Уведомления',
      security: 'Безопасность',
      payments: 'Способы оплаты',
      username: 'Имя пользователя',
      telegram_id: 'Telegram ID',
      email: 'Email',
      other_contact: 'Другой контакт',
      member_since: 'Дата регистрации',
      edit_contact: 'Изменить контакты',
      contact_info: 'Контактная информация',
      contact_hint: 'Добавьте контакт для покупателей или поддержки.',
      save_changes: 'Сохранить',
      saving: 'Сохранение...',
      change: 'Изменить',
      change_username: 'Сменить имя',
      privacy_handle: 'Приватный ник',
      hide_handle: 'Скрыть Telegram ник за $50.',
      custom_handle_active: 'Приватный ник активен. Telegram ник больше не синхронизируется.',
      custom_handle_inactive: 'После покупки Telegram ник больше не будет синхронизироваться.',
      display_name: 'Отображаемое имя',
      handle: 'Ник',
      pay_change: 'Оплатить $50 и изменить',
      processing: 'Обработка...',
      language: 'Язык',
      dark_mode: 'Темный режим',
      light_mode: 'Светлый режим',
      always_on: 'Всегда включен',
      log_out: 'Выйти',
      order_updates: 'Обновления заказов',
      promotions: 'Акции',
      security_alerts: 'Оповещения безопасности',
      order_desc: 'Уведомления о статусе заказа',
      promo_desc: 'Получайте скидки и предложения',
      security_desc: 'Важная активность аккаунта',
      two_factor: 'Двухфакторная защита',
      two_factor_value: 'Включено через Telegram',
      active_sessions: 'Активные сессии',
      login_history: 'История входов',
      device_count: '1 устройство',
      view_all: 'Смотреть все',
      terminate_all: 'Завершить все сессии',
      terminate_confirm: 'Это завершит сессии на всех других устройствах. Продолжить?',
      terminate_success: 'Все остальные сессии завершены',
      no_login_history: 'Нет истории входов',
      current_session: 'Текущая сессия',
      pin_code: 'PIN-код',
      pin_desc: 'Защитите аккаунт PIN-кодом',
      pin_enabled: 'Включён',
      pin_disabled: 'Не установлен',
      set_pin: 'Установить PIN',
      change_pin: 'Изменить PIN',
      remove_pin: 'Удалить PIN',
      enter_pin: 'Введите PIN',
      confirm_pin: 'Подтвердите PIN',
      enter_current_pin: 'Текущий PIN',
      enter_new_pin: 'Новый PIN',
      confirm_new_pin: 'Подтвердите новый PIN',
      pin_mismatch: 'PIN-коды не совпадают',
      pin_set_success: 'PIN установлен',
      pin_changed_success: 'PIN изменён',
      pin_removed_success: 'PIN удалён',
      pin_digits: '4-6 цифр',
      crypto_wallet: 'Криптокошелек',
      no_wallet: 'Кошелек не привязан',
      transaction_history: 'История транзакций'
    }
  }

  const t = (key) => translations[lang]?.[key] || translations.en[key] || key

  const handleLanguageChange = (value) => {
    setLang(value)
    localStorage.setItem('lang', value)
  }

  const handlePaidNameChange = async () => {
    if (!nameForm.first_name.trim() || !nameForm.username.trim()) {
      setNameStatus({ status: 'error', message: 'Display name and handle are required.' })
      return
    }
    if ((user?.balance || 0) < 50) {
      setNameStatus({ status: 'error', message: 'Insufficient balance. Need $50.' })
      return
    }

    setNameStatus({ status: 'loading', message: '' })
    try {
      const { data } = await api.post('/api/auth/username', {
        first_name: nameForm.first_name.trim(),
        username: nameForm.username.trim()
      })
      setUser(data)
      setNameForm({
        first_name: data?.first_name || '',
        username: data?.username || ''
      })
      setNameStatus({ status: 'success', message: 'Updated. Changes will persist on next login.' })
    } catch (error) {
      const detail = error?.response?.data?.detail || 'Update failed.'
      setNameStatus({ status: 'error', message: detail })
    }
  }

  const handleContactSave = async () => {
    setContactStatus({ status: 'loading', message: '' })
    const email = contactForm.email.trim()
    const otherContact = contactForm.other_contact.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactStatus({ status: 'error', message: 'Please enter a valid email.' })
      return
    }
    try {
      const { data } = await api.put('/api/auth/profile', {
        email: email || null,
        other_contact: otherContact || null
      })
      setUser(data)
      setContactStatus({ status: 'success', message: 'Contact info saved.' })
      setShowContactModal(false)
    } catch (error) {
      const detail = error?.response?.data?.detail
      const message = Array.isArray(detail)
        ? detail[0]?.msg || 'Save failed.'
        : detail || 'Save failed.'
      setContactStatus({ status: 'error', message })
    }
  }

  const tabs = [
    { id: 'profile', label: t('profile'), icon: User },
    { id: 'notifications', label: t('notifications'), icon: Bell },
    { id: 'security', label: t('security'), icon: Shield },
  ]

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold">{t('settings')}</h1>
        <p className="text-dark-400 text-sm">{t('manage_prefs')}</p>
      </div>

      {/* Profile Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-accent-purple flex items-center justify-center overflow-hidden">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-lg">{user?.first_name || user?.username}</h2>
            <div className="flex items-center gap-2">
              <p className="text-dark-400 text-sm">@{user?.username || 'guest'}</p>
              <button
                onClick={() => {
                  setNameStatus({ status: 'idle', message: '' })
                  setShowNameModal(true)
                }}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                {t('change')}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass(effectiveRole)}`}>
                {effectiveRole}
              </span>
              {(user?.collateral || 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                  ${user.collateral.toFixed(0)} collateral
                </span>
              )}
              {sellerActive && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                  daysUntilExpiry <= 30 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  <Clock size={10} />
                  {daysUntilExpiry}d left
                </span>
              )}
              {sellerExpired && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  Expired
                </span>
              )}
              {!hasShop && (
                <button
                  onClick={() => {
                    setUpgradeStatus({ status: 'idle', message: '' })
                    setShowUpgradeModal(true)
                  }}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors flex items-center gap-1"
                >
                  <ArrowUpCircle size={11} />
                  Start Selling
                </button>
              )}
              {isFree && (
                <button
                  onClick={() => {
                    setUpgradeStatus({ status: 'idle', message: '' })
                    setShowUpgradeModal(true)
                  }}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors flex items-center gap-1"
                >
                  <ArrowUpCircle size={11} />
                  Upgrade
                </button>
              )}
              {baseRole === 'admin' && viewRole && viewRole !== baseRole && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-800 text-dark-300">
                  Admin
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Settings Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-colors ${
                activeTab === tab.id 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {activeTab === 'profile' && (
          <>
            <div className="card divide-y divide-dark-800">
              <SettingRow label={t('username')} value={`@${user?.username || 'guest'}`} />
              <SettingRow label={t('telegram_id')} value={user?.telegram_id || '-'} />
              <SettingRow label={t('email')} value={user?.email || 'Not set'} />
              <SettingRow label={t('other_contact')} value={user?.other_contact || 'Not set'} />
              <SettingRow label={t('member_since')} value={formatDate(user?.created_at || Date.now())} />
            </div>

            <button
              onClick={() => {
                setContactStatus({ status: 'idle', message: '' })
                setShowContactModal(true)
              }}
              className="w-full bg-dark-800 hover:bg-dark-700 text-dark-50 py-2.5 rounded-lg text-sm font-semibold"
            >
              {t('edit_contact')}
            </button>

            {/* Seller Subscription Card */}
            {hasShop && (
              <div className={`card p-4 space-y-3 border ${
                sellerActive
                  ? daysUntilExpiry <= 30
                    ? 'border-yellow-500/30'
                    : 'border-emerald-500/30'
                  : 'border-red-500/30'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown size={16} className={sellerActive ? 'text-primary-400' : 'text-red-400'} />
                    <h3 className="font-semibold">Seller Subscription</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    sellerActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {sellerActive ? 'Active' : 'Expired'}
                  </span>
                </div>
                {sellerActive ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-dark-300">
                      Expires: <span className={`font-medium ${daysUntilExpiry <= 30 ? 'text-yellow-400' : 'text-dark-50'}`}>
                        {formatDate(user.seller_expires_at)}
                      </span>
                    </p>
                    <p className="text-xs text-dark-500">
                      {daysUntilExpiry} days remaining
                      {daysUntilExpiry <= 30 && ' — renew soon to keep your shop active'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-dark-400">Your seller subscription has expired. Renew to reactivate your shop.</p>
                )}
                <button
                  onClick={() => {
                    setUpgradeStatus({ status: 'idle', message: '' })
                    setShowUpgradeModal(true)
                  }}
                  className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                    sellerActive && daysUntilExpiry > 30
                      ? 'bg-dark-800 hover:bg-dark-700 text-dark-50'
                      : 'bg-primary-500 hover:bg-primary-600 text-white'
                  }`}
                >
                  {sellerActive ? 'Extend Subscription' : 'Renew Subscription'}
                </button>
              </div>
            )}

            {!hasShop && (
              <div className="card p-4 space-y-2">
                <h3 className="font-semibold">Seller Upgrade</h3>
                <p className="text-sm text-dark-400">Unlock your shop and start selling digital products.</p>
                <p className="text-xs text-dark-500">Ranks from ${minPrice} — Bronze, Silver, Gold.</p>
                <button
                  onClick={() => {
                    setUpgradeStatus({ status: 'idle', message: '' })
                    setShowUpgradeModal(true)
                  }}
                  className="mt-2 w-full bg-primary-500 hover:bg-primary-600 text-white py-2 rounded-lg text-sm font-semibold"
                >
                  Become a Seller
                </button>
              </div>
            )}

            <div className="card p-4 space-y-2">
              <h3 className="font-semibold">{t('privacy_handle')}</h3>
              <p className="text-sm text-dark-400">{t('hide_handle')}</p>
              <p className="text-xs text-dark-500">
                {user?.uses_custom_handle
                  ? t('custom_handle_active')
                  : t('custom_handle_inactive')}
              </p>
              <button
                onClick={() => {
                  setNameStatus({ status: 'idle', message: '' })
                  setShowNameModal(true)
                }}
                className="mt-2 w-full bg-primary-500 hover:bg-primary-600 text-white py-2 rounded-lg text-sm font-semibold"
              >
                {t('change_username')}
              </button>
            </div>
            
            {baseRole === 'admin' && (
              <div className="card p-4 space-y-3">
                <div>
                  <h3 className="font-semibold">Role Switcher</h3>
                  <p className="text-sm text-dark-400">Preview buyer, seller, or admin views.</p>
                </div>
                <div className="flex gap-2">
                  {['buyer', 'seller', 'admin'].map((role) => (
                    <button
                      key={role}
                      onClick={() => setViewRole(role)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        effectiveRole === role
                          ? 'bg-primary-500 text-white'
                          : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                  <button
                    onClick={clearViewRole}
                    className="px-3 py-1.5 rounded-full text-sm font-medium bg-dark-800 text-dark-400 hover:bg-dark-700"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'notifications' && (
          <NotificationPrefsTab
            notifPrefs={notifPrefs}
            setNotifPrefs={setNotifPrefs}
            notifLoading={notifLoading}
            setNotifLoading={setNotifLoading}
            notifSaving={notifSaving}
            setNotifSaving={setNotifSaving}
          />
        )}

        {activeTab === 'security' && (
          <div className="space-y-4">
            {/* 2FA Status */}
            <div className="card divide-y divide-dark-800">
              <div className="flex items-center justify-between w-full p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={20} className="text-green-400" />
                  <div>
                    <p className="font-medium">{t('two_factor')}</p>
                    <p className="text-xs text-dark-400">{t('two_factor_value')}</p>
                  </div>
                </div>
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">Active</span>
              </div>
            </div>

            {/* PIN Code */}
            <div className="card divide-y divide-dark-800">
              <div className="flex items-center justify-between w-full p-4">
                <div className="flex items-center gap-3">
                  <Lock size={20} className={user?.has_pin ? 'text-green-400' : 'text-dark-400'} />
                  <div>
                    <p className="font-medium">{t('pin_code')}</p>
                    <p className="text-xs text-dark-400">{t('pin_desc')}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${user?.has_pin ? 'bg-green-500/20 text-green-400' : 'bg-dark-700 text-dark-400'}`}>
                  {user?.has_pin ? t('pin_enabled') : t('pin_disabled')}
                </span>
              </div>

              {/* PIN actions */}
              {!pinMode && (
                <div className="flex gap-2 p-4">
                  {!user?.has_pin ? (
                    <button
                      onClick={() => { setPinMode('set'); setPinStep(1); setPinInput(''); setPinConfirm(''); setPinError('') }}
                      className="flex-1 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
                    >
                      {t('set_pin')}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => { setPinMode('change'); setPinStep(1); setPinOld(''); setPinInput(''); setPinConfirm(''); setPinError('') }}
                        className="flex-1 py-2 rounded-lg bg-dark-700 text-dark-200 text-sm font-medium hover:bg-dark-600 transition-colors"
                      >
                        {t('change_pin')}
                      </button>
                      <button
                        onClick={() => { setPinMode('remove'); setPinStep(1); setPinInput(''); setPinError('') }}
                        className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                      >
                        {t('remove_pin')}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* PIN input flow */}
              <AnimatePresence>
                {pinMode && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 space-y-3">
                      {/* SET PIN */}
                      {pinMode === 'set' && pinStep === 1 && (
                        <>
                          <p className="text-sm text-dark-300">{t('enter_pin')} ({t('pin_digits')})</p>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinInput}
                            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError('') }}
                            placeholder="••••"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-primary-500 focus:outline-none"
                            autoFocus
                          />
                        </>
                      )}
                      {pinMode === 'set' && pinStep === 2 && (
                        <>
                          <p className="text-sm text-dark-300">{t('confirm_pin')}</p>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinConfirm}
                            onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '')); setPinError('') }}
                            placeholder="••••"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-primary-500 focus:outline-none"
                            autoFocus
                          />
                        </>
                      )}

                      {/* CHANGE PIN */}
                      {pinMode === 'change' && pinStep === 1 && (
                        <>
                          <p className="text-sm text-dark-300">{t('enter_current_pin')}</p>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinOld}
                            onChange={(e) => { setPinOld(e.target.value.replace(/\D/g, '')); setPinError('') }}
                            placeholder="••••"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-primary-500 focus:outline-none"
                            autoFocus
                          />
                        </>
                      )}
                      {pinMode === 'change' && pinStep === 2 && (
                        <>
                          <p className="text-sm text-dark-300">{t('enter_new_pin')} ({t('pin_digits')})</p>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinInput}
                            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError('') }}
                            placeholder="••••"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-primary-500 focus:outline-none"
                            autoFocus
                          />
                        </>
                      )}
                      {pinMode === 'change' && pinStep === 3 && (
                        <>
                          <p className="text-sm text-dark-300">{t('confirm_new_pin')}</p>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinConfirm}
                            onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '')); setPinError('') }}
                            placeholder="••••"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-primary-500 focus:outline-none"
                            autoFocus
                          />
                        </>
                      )}

                      {/* REMOVE PIN */}
                      {pinMode === 'remove' && (
                        <>
                          <p className="text-sm text-dark-300">{t('enter_current_pin')}</p>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinInput}
                            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError('') }}
                            placeholder="••••"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-primary-500 focus:outline-none"
                            autoFocus
                          />
                        </>
                      )}

                      {pinError && <p className="text-red-400 text-sm text-center">{pinError}</p>}

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setPinMode(null); setPinError('') }}
                          className="flex-1 py-2 rounded-lg bg-dark-700 text-dark-300 text-sm hover:bg-dark-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={pinLoading}
                          onClick={async () => {
                            setPinError('')
                            // SET flow
                            if (pinMode === 'set') {
                              if (pinStep === 1) {
                                if (pinInput.length < 4) { setPinError(t('pin_digits')); return }
                                setPinStep(2)
                                return
                              }
                              if (pinConfirm !== pinInput) { setPinError(t('pin_mismatch')); return }
                              setPinLoading(true)
                              try {
                                await api.post('/api/auth/pin/set', { pin: pinInput })
                                const { data } = await api.get('/api/auth/me')
                                setUser(data)
                                setPinMode(null)
                              } catch (e) {
                                setPinError(e?.response?.data?.detail || 'Failed')
                              }
                              setPinLoading(false)
                              return
                            }
                            // CHANGE flow
                            if (pinMode === 'change') {
                              if (pinStep === 1) {
                                if (pinOld.length < 4) { setPinError(t('pin_digits')); return }
                                setPinStep(2)
                                return
                              }
                              if (pinStep === 2) {
                                if (pinInput.length < 4) { setPinError(t('pin_digits')); return }
                                setPinStep(3)
                                return
                              }
                              if (pinConfirm !== pinInput) { setPinError(t('pin_mismatch')); return }
                              setPinLoading(true)
                              try {
                                await api.post('/api/auth/pin/change', { old_pin: pinOld, new_pin: pinInput })
                                const { data } = await api.get('/api/auth/me')
                                setUser(data)
                                setPinMode(null)
                              } catch (e) {
                                setPinError(e?.response?.data?.detail || 'Failed')
                              }
                              setPinLoading(false)
                              return
                            }
                            // REMOVE flow
                            if (pinMode === 'remove') {
                              if (pinInput.length < 4) { setPinError(t('pin_digits')); return }
                              setPinLoading(true)
                              try {
                                await api.delete('/api/auth/pin/remove', { data: { pin: pinInput } })
                                const { data } = await api.get('/api/auth/me')
                                setUser(data)
                                setPinMode(null)
                              } catch (e) {
                                setPinError(e?.response?.data?.detail || 'Failed')
                              }
                              setPinLoading(false)
                            }
                          }}
                          className="flex-1 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                        >
                          {pinLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                          ) : (
                            pinMode === 'set' && pinStep === 1 ? 'Next' :
                            pinMode === 'change' && pinStep < 3 ? 'Next' :
                            'Confirm'
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Active Session */}
            <div className="card divide-y divide-dark-800">
              <div className="flex items-center justify-between w-full p-4">
                <div className="flex items-center gap-3">
                  <Smartphone size={20} className="text-primary-400" />
                  <div>
                    <p className="font-medium">{t('current_session')}</p>
                    <p className="text-xs text-dark-400">Telegram Mini App</p>
                  </div>
                </div>
                <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-1 rounded-full">{t('device_count')}</span>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(t('terminate_confirm'))) return
                  setTerminatingAll(true)
                  try {
                    const { data } = await api.post('/api/auth/terminate-all')
                    localStorage.setItem('token', data.access_token)
                    localStorage.setItem('refresh_token', data.refresh_token)
                    api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
                  } catch {}
                  setTerminatingAll(false)
                }}
                disabled={terminatingAll}
                className="flex items-center justify-between w-full p-4 hover:bg-dark-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <ShieldOff size={20} className="text-red-400" />
                  <div>
                    <p className="font-medium text-red-400">{t('terminate_all')}</p>
                    <p className="text-xs text-dark-400">{t('terminate_confirm')}</p>
                  </div>
                </div>
                {terminatingAll && (
                  <div className="w-5 h-5 border-2 border-dark-600 border-t-primary-400 rounded-full animate-spin" />
                )}
              </button>
            </div>

            {/* Login History */}
            <div className="card divide-y divide-dark-800">
              <button
                onClick={async () => {
                  setShowLoginHistory(!showLoginHistory)
                  if (!showLoginHistory && loginHistory.length === 0) {
                    setLoginHistoryLoading(true)
                    try {
                      const { data } = await api.get('/api/auth/login-history')
                      setLoginHistory(data)
                    } catch {}
                    setLoginHistoryLoading(false)
                  }
                }}
                className="flex items-center justify-between w-full p-4 hover:bg-dark-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <History size={20} className="text-dark-400" />
                  <p className="font-medium">{t('login_history')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-dark-400 text-sm">{t('view_all')}</span>
                  <ChevronRight size={18} className={`text-dark-500 transition-transform ${showLoginHistory ? 'rotate-90' : ''}`} />
                </div>
              </button>

              <AnimatePresence>
                {showLoginHistory && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {loginHistoryLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="w-6 h-6 border-2 border-dark-600 border-t-primary-400 rounded-full animate-spin" />
                      </div>
                    ) : loginHistory.length === 0 ? (
                      <p className="text-dark-400 text-sm text-center py-6">{t('no_login_history')}</p>
                    ) : (
                      <div className="max-h-[300px] overflow-y-auto">
                        {loginHistory.map((entry, i) => {
                          const date = new Date(entry.created_at)
                          const timeAgo = formatTimeAgo(date)
                          const isMobile = /mobile|android|iphone/i.test(entry.user_agent || '')
                          return (
                            <div key={entry.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-dark-800/50' : ''}`}>
                              <div className="flex items-center gap-3 min-w-0">
                                <Smartphone size={16} className="text-dark-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm truncate">{isMobile ? 'Mobile' : 'Desktop'} · {entry.method === 'dev' ? 'Dev' : 'Telegram'}</p>
                                  <p className="text-xs text-dark-500 truncate">{entry.ip_address || 'Unknown IP'}</p>
                                </div>
                              </div>
                              <span className="text-xs text-dark-500 shrink-0 ml-2">{timeAgo}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>

      {/* Other Options */}
      <div className="card divide-y divide-dark-800">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex items-center justify-between w-full p-4 hover:bg-dark-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon size={20} className="text-dark-400" /> : <Sun size={20} className="text-yellow-500" />}
            <span>{theme === 'dark' ? t('dark_mode') : t('light_mode')}</span>
          </div>
          <div className="relative w-11 h-6 rounded-full transition-colors duration-200" style={{ backgroundColor: theme === 'dark' ? 'var(--color-dark-700)' : '#22c55e' }}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${theme === 'light' ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </div>
        </button>
        <button className="flex items-center justify-between w-full p-4 hover:bg-dark-800/50 transition-colors">
          <div className="flex items-center gap-3">
            <Globe size={20} className="text-dark-400" />
            <span>{t('language')}</span>
          </div>
          <div className="flex items-center gap-2 text-dark-400">
            <select
              value={lang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-sm"
            >
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </div>
        </button>
      </div>

      {/* Logout */}
      <button 
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 p-4 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
      >
        <LogOut size={20} />
        <span>{t('log_out')}</span>
      </button>

      {/* Version */}
      <p className="text-center text-dark-600 text-xs">
        {useBrandingStore.getState().appName} v1.0.0
      </p>
    </div>
      <AnimatePresence>
        {showNameModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowNameModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold">{t('change_username')}</h3>
                  <p className="text-sm text-dark-400">{t('hide_handle')}</p>
                </div>
                <button
                  onClick={() => setShowNameModal(false)}
                  className="p-2 hover:bg-dark-800 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-sm text-dark-400">{t('display_name')}</label>
                  <input
                    value={nameForm.first_name}
                    onChange={(e) => setNameForm({ ...nameForm, first_name: e.target.value })}
                    className="input px-3 py-2 text-sm"
                    placeholder="Display name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm text-dark-400">{t('handle')}</label>
                  <input
                    value={nameForm.username}
                    onChange={(e) => setNameForm({ ...nameForm, username: e.target.value })}
                    className="input px-3 py-2 text-sm"
                    placeholder="handle"
                  />
                </div>
                <button
                  onClick={handlePaidNameChange}
                  disabled={nameStatus.status === 'loading'}
                  className="w-full mt-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-semibold"
                >
                  {nameStatus.status === 'loading' ? t('processing') : t('pay_change')}
                </button>
                {nameStatus.message && (
                  <p className={`text-sm ${nameStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                    {nameStatus.message}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        {showContactModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowContactModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-xl p-6 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-bold">{t('edit_contact')}</h3>
                <button
                  onClick={() => setShowContactModal(false)}
                  className="p-2 hover:bg-dark-800 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-sm text-dark-400">{t('email')}</label>
                  <input
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="input px-3 py-2 text-sm"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm text-dark-400">{t('other_contact')}</label>
                  <input
                    value={contactForm.other_contact}
                    onChange={(e) => setContactForm({ ...contactForm, other_contact: e.target.value })}
                    className="input px-3 py-2 text-sm"
                    placeholder="Discord, Signal, etc."
                  />
                </div>
                <button
                  onClick={handleContactSave}
                  disabled={contactStatus.status === 'loading'}
                  className="w-full mt-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-semibold"
                >
                  {contactStatus.status === 'loading' ? t('saving') : t('save_changes')}
                </button>
                {contactStatus.message && (
                  <p className={`text-sm ${contactStatus.status === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                    {contactStatus.message}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowUpgradeModal(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-dark-900 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Crown size={20} className="text-primary-400" />
                    <h3 className="font-display text-lg font-bold">
                      {hasShop ? 'Upgrade Rank' : 'Become a Seller'}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowUpgradeModal(false)}
                    className="p-2 hover:bg-dark-800 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </div>

                <p className="text-sm text-dark-400 mb-4">
                  {hasShop
                    ? 'Upgrade your seller rank for more benefits.'
                    : 'Start selling on the marketplace. Free or go premium.'}
                </p>

                {/* Rank Selection */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {ranks.map((r) => (
                    <button
                      key={r.rank}
                      onClick={() => setSelectedRank(r.rank)}
                      className={`relative p-3 rounded-xl border-2 transition-all text-center ${
                        selectedRank === r.rank
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full mx-auto mb-1" style={{ backgroundColor: r.badge_color }} />
                      <p className="text-sm font-bold">{r.name}</p>
                      <p className="text-lg font-semibold text-primary-400">{r.price > 0 ? `$${r.price}` : 'Free'}</p>
                      <p className="text-[10px] text-dark-500">
                        {r.rank === 0 ? '5 products, 1 service' : r.featured_days > 0 ? `+${r.featured_days}d featured` : 'Unlimited'}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Pricing info */}
                <div className="bg-dark-800/60 rounded-xl p-3 mb-4 space-y-2">
                  {selectedRank === 0 ? (
                    <>
                      <div className="flex items-start gap-2">
                        <Store size={13} className="text-primary-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-dark-400"><span className="text-dark-200 font-medium">Free tier</span> — up to 5 products and 1 service listing</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield size={13} className="text-dark-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-dark-400"><span className="text-dark-200 font-medium">No auctions</span> — upgrade to Bronze+ for auction access</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-dark-400"><span className="text-dark-200 font-medium">No expiry</span> — keep your shop active forever</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <Store size={13} className="text-primary-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-dark-400"><span className="text-dark-200 font-medium">Full seller access</span> — unlimited products, services, and auctions</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-dark-400"><span className="text-dark-200 font-medium">Silver & Gold</span> — featured on homepage for more visibility</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-dark-400"><span className="text-dark-200 font-medium">Monthly subscription</span> — renew to keep premium features</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Balance indicator (hide for free tier) */}
                {(() => {
                  const rankCost = ranks.find(r => r.rank === selectedRank)?.price || 0
                  if (rankCost === 0) return null
                  const hasEnough = (user?.balance || 0) >= rankCost
                  return (
                    <div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${
                      hasEnough ? 'bg-emerald-500/10' : 'bg-red-500/10'
                    }`}>
                      <span className="text-xs text-dark-300">Your balance</span>
                      <span className={`text-sm font-bold ${hasEnough ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${(user?.balance || 0).toFixed(2)}
                        {!hasEnough && (
                          <span className="text-xs font-normal text-dark-500 ml-1">(need ${rankCost})</span>
                        )}
                      </span>
                    </div>
                  )
                })()}

                {/* Shop form (new sellers only) */}
                {!hasShop && (
                  <div className="space-y-3 mb-3">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Shop Name *</label>
                      <input
                        value={upgradeForm.shop_name}
                        onChange={(e) => setUpgradeForm({ ...upgradeForm, shop_name: e.target.value })}
                        placeholder="My Awesome Shop"
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Shop Description</label>
                      <textarea
                        value={upgradeForm.shop_description}
                        onChange={(e) => setUpgradeForm({ ...upgradeForm, shop_description: e.target.value })}
                        placeholder="Tell buyers what you sell..."
                        className="input text-sm min-h-[60px] resize-none"
                        rows={2}
                      />
                    </div>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={hasShop ? handleRenew : handleUpgrade}
                  disabled={upgradeStatus.status === 'loading' || ((ranks.find(r => r.rank === selectedRank)?.price || 0) > 0 && (user?.balance || 0) < (ranks.find(r => r.rank === selectedRank)?.price || 0))}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Store size={14} />
                  {upgradeStatus.status === 'loading'
                    ? 'Processing...'
                    : hasShop
                      ? `Upgrade to ${ranks.find(r => r.rank === selectedRank)?.name || 'Free'} ${(ranks.find(r => r.rank === selectedRank)?.price || 0) > 0 ? `- $${ranks.find(r => r.rank === selectedRank)?.price}` : ''}`
                      : selectedRank === 0
                        ? 'Start Selling for Free'
                        : `Become ${ranks.find(r => r.rank === selectedRank)?.name || 'Bronze'} Seller - $${ranks.find(r => r.rank === selectedRank)?.price || 50}`
                  }
                </button>
                {upgradeStatus.message && (
                  <p className={`text-xs text-center mt-2 ${
                    upgradeStatus.status === 'error' ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {upgradeStatus.message}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

const NOTIF_CATEGORY_META = {
  orders:        { label: 'Order Updates',     desc: 'Order payments, status changes, completions',     icon: '🛒' },
  disputes:      { label: 'Disputes',          desc: 'Dispute activity and resolutions',               icon: '⚠️' },
  wallet:        { label: 'Wallet & Payments', desc: 'Deposits, withdrawals, balance changes',         icon: '💰' },
  auctions:      { label: 'Auctions',          desc: 'Bids, wins, auction outcomes',                   icon: '🔨' },
  escrow:        { label: 'Escrow / Middleman',desc: 'Escrow invites, funds, and completions',         icon: '🤝' },
  wtb:           { label: 'Want to Buy',       desc: 'Replies on your WTB posts',                     icon: '💬' },
  seller:        { label: 'Seller Status',     desc: 'Subscription expiry, feedback',                  icon: '🏪' },
  announcements: { label: 'Announcements',     desc: 'Admin broadcasts, promos, referral rewards',     icon: '📢' },
}

function NotificationPrefsTab({ notifPrefs, setNotifPrefs, notifLoading, setNotifLoading, notifSaving, setNotifSaving }) {
  useEffect(() => {
    if (notifPrefs) return // already loaded
    setNotifLoading(true)
    api.get('/api/notifications/preferences')
      .then(({ data }) => setNotifPrefs(data.preferences))
      .catch(() => {
        // Default all on
        const defaults = {}
        Object.keys(NOTIF_CATEGORY_META).forEach(k => { defaults[k] = { app: true, tg: true } })
        setNotifPrefs(defaults)
      })
      .finally(() => setNotifLoading(false))
  }, [])

  const togglePref = async (category, channel) => {
    if (!notifPrefs) return
    const updated = { ...notifPrefs, [category]: { ...notifPrefs[category], [channel]: !notifPrefs[category]?.[channel] } }
    setNotifPrefs(updated)
    setNotifSaving(true)
    try {
      await api.put('/api/notifications/preferences', { preferences: updated })
    } catch {
      // Revert on failure
      setNotifPrefs(notifPrefs)
    } finally {
      setNotifSaving(false)
    }
  }

  if (notifLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-dark-600 border-t-primary-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Notification Channels</p>
            <div className="flex items-center gap-6 text-[10px] text-dark-500 uppercase tracking-wider font-medium">
              <span className="w-10 text-center">App</span>
              <span className="w-10 text-center">TG</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-dark-800/50">
          {Object.entries(NOTIF_CATEGORY_META).map(([key, meta]) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-lg shrink-0">{meta.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="text-[11px] text-dark-500 leading-tight">{meta.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 shrink-0">
                {/* In-App toggle */}
                <button
                  onClick={() => togglePref(key, 'app')}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    notifPrefs?.[key]?.app ? 'bg-primary-500' : 'bg-dark-700'
                  }`}
                >
                  <motion.div
                    animate={{ x: notifPrefs?.[key]?.app ? 18 : 2 }}
                    className="absolute top-1 w-4 h-4 bg-white rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
                {/* Telegram toggle */}
                <button
                  onClick={() => togglePref(key, 'tg')}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    notifPrefs?.[key]?.tg ? 'bg-[#2AABEE]' : 'bg-dark-700'
                  }`}
                >
                  <motion.div
                    animate={{ x: notifPrefs?.[key]?.tg ? 18 : 2 }}
                    className="absolute top-1 w-4 h-4 bg-white rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Always-on notice */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
        <AlertTriangle size={14} className="text-amber-500/70 shrink-0 mt-0.5" />
        <p className="text-[11px] text-dark-500 leading-relaxed">
          Security alerts and admin warnings are always delivered and cannot be turned off.
        </p>
      </div>

      {notifSaving && (
        <p className="text-xs text-dark-500 text-center animate-pulse">Saving...</p>
      )}
    </div>
  )
}

function SettingRow({ label, value, editable, hasArrow, icon }) {
  return (
    <button className="flex items-center justify-between w-full p-4 hover:bg-dark-800/50 transition-colors text-left">
      <span className="text-dark-400">{label}</span>
      <div className="flex items-center gap-2">
        {icon}
        <span className={editable ? 'text-primary-400' : ''}>{value}</span>
        {(editable || hasArrow) && <ChevronRight size={18} className="text-dark-500" />}
      </div>
    </button>
  )
}

function NotificationToggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-dark-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-7 rounded-full transition-colors relative ${
          checked ? 'bg-primary-500' : 'bg-dark-700'
        }`}
      >
        <motion.div
          animate={{ x: checked ? 22 : 2 }}
          className="absolute top-1 w-5 h-5 bg-white rounded-full"
        />
      </button>
    </div>
  )
}
