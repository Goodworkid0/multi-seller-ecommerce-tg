import { create } from 'zustand'
import axios from 'axios'
import api from '../lib/api'
import { globalConfirm } from '../components/ConfirmModal'

const normalizeRole = (role) => String(role || 'buyer').toLowerCase()

const readViewRole = () => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('view_role')
}

const persistTokens = (authData) => {
  localStorage.setItem('token', authData.access_token)
  if (authData.refresh_token) {
    localStorage.setItem('refresh_token', authData.refresh_token)
  }
}

const clearPersistedTokens = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
}

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  viewRole: readViewRole(),
  isLoading: false,
  isInitialized: false,
  isTelegram: false,
  tg: null,
  _balanceInterval: null,

  initTelegram: async () => {
    const tg = window.Telegram?.WebApp
    
    if (tg && tg.initDataUnsafe?.user) {
      // Telegram Mini App mode
      tg.ready()
      tg.expand()
      tg.enableClosingConfirmation()
      
      // Set theme
      document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams?.bg_color || '#0f172a')
      
      set({ isTelegram: true, tg })

      // If admin is impersonating a user, restore that session instead of
      // re-authenticating with the real Telegram user (which would overwrite
      // the impersonation token).
      if (localStorage.getItem('admin_token')) {
        const restored = await get().restoreSession()
        if (restored) return
        // Token expired / invalid – clean up and fall through to normal auth
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_refresh')
      }

      // Try to restore existing session first (refresh token) to avoid
      // stale auth_date rejection from Telegram re-auth
      const restored = await get().restoreSession()
      if (restored) {
        // Session restored but Telegram name may have changed — sync it
        const tgUser = tg.initDataUnsafe?.user
        if (tgUser) {
          try {
            const { data: syncResult } = await api.post('/api/auth/sync-telegram', {
              first_name: tgUser.first_name || '',
              last_name: tgUser.last_name || '',
              username: tgUser.username || '',
              photo_url: tgUser.photo_url || '',
            })
            // If name changed, refresh user data in store so UI reflects it
            if (syncResult?.synced) {
              try {
                const userRes = await api.get('/api/auth/me')
                set({ user: userRes.data })
              } catch {}
            }
          } catch {
            // sync-telegram failed — fall back to full re-login so name
            // is updated via the normal auth flow
            try {
              await get().loginWithTelegram(tg.initData, tg.initDataUnsafe)
            } catch {}
          }
        }
        return
      }
      
      await get().loginWithTelegram(tg.initData, tg.initDataUnsafe)
    } else {
      if (tg?.initData) {
        try {
          const params = new URLSearchParams(tg.initData)
          const userRaw = params.get('user')
          const authDate = params.get('auth_date')
          const hash = params.get('hash')
          if (userRaw && authDate && hash) {
            const parsedUser = JSON.parse(userRaw)
            const fallback = {
              user: parsedUser,
              auth_date: parseInt(authDate),
              hash
            }
            console.warn('Telegram initDataUnsafe missing; using initData fallback.')
            await get().loginWithTelegram(tg.initData, fallback)
            return
          }
        } catch (error) {
          console.warn('Failed to parse Telegram initData:', error)
        }
      }
      // Non-Telegram context: try to restore existing session first
      const restored = await get().restoreSession()
      if (restored) return

      // Check for URL params auth (browser mode from bot)
      const urlParams = new URLSearchParams(window.location.search)
      const telegramId = urlParams.get('id')
      const authHash = urlParams.get('hash')
      
      if (telegramId && authHash) {
        await get().loginWithUrlParams(urlParams)
        // Clean URL after auth
        window.history.replaceState({}, '', window.location.pathname)
      } else {
        // Development mode - no Telegram
        set({ isInitialized: true })
      }
    }
  },

  loginWithUrlParams: async (urlParams) => {
    set({ isLoading: true })
    try {
      const userData = {
        id: parseInt(urlParams.get('id')),
        first_name: urlParams.get('first_name') || '',
        last_name: urlParams.get('last_name') || '',
        username: urlParams.get('username') || '',
        auth_date: parseInt(urlParams.get('auth_date')),
        hash: urlParams.get('hash')
      }
      
      const { data } = await api.post('/api/auth/telegram', {
        ...userData,
        photo_url: '',
        init_data: ''
      })
      
      persistTokens(data)
      api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
      
      const userRes = await api.get('/api/auth/me')
      const baseRole = normalizeRole(userRes.data?.role)
      const nextState = { user: userRes.data, token: data.access_token, isInitialized: true }
      if (!['admin', 'seller'].includes(baseRole)) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('view_role')
        }
        nextState.viewRole = null
      } else if (baseRole === 'seller' && !['buyer', 'seller'].includes(normalizeRole(nextState.viewRole))) {
        nextState.viewRole = 'seller'
      }
      set(nextState)
      get().startBalancePoll()
      
    } catch (error) {
      console.error('URL params login error:', error)
      set({ isInitialized: true })
    } finally {
      set({ isLoading: false })
    }
  },

  loginWithTelegram: async (initData, initDataUnsafe) => {
    set({ isLoading: true })
    try {
      const user = initDataUnsafe.user
      
      const { data } = await api.post('/api/auth/telegram', {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name || '',
        username: user.username || '',
        photo_url: user.photo_url || '',
        auth_date: initDataUnsafe.auth_date,
        hash: initDataUnsafe.hash || 'dev',
        init_data: initData // Full init data for verification
      })
      
      persistTokens(data)
      api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
      
      const userRes = await api.get('/api/auth/me')
      const baseRole = normalizeRole(userRes.data?.role)
      const nextState = { user: userRes.data, token: data.access_token, isInitialized: true }
      if (!['admin', 'seller'].includes(baseRole)) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('view_role')
        }
        nextState.viewRole = null
      } else if (baseRole === 'seller' && !['buyer', 'seller'].includes(normalizeRole(nextState.viewRole))) {
        nextState.viewRole = 'seller'
      }
      set(nextState)
      
      // Haptic feedback on successful login
      get().haptic('success')
      get().startBalancePoll()
      
    } catch (error) {
      console.error('Telegram login error:', error)
      set({ isInitialized: true })
    } finally {
      set({ isLoading: false })
    }
  },

  // Dev login for testing without Telegram
  devLogin: async (telegramId = '123456789') => {
    set({ isLoading: true })
    try {
      const { data } = await api.post(`/api/auth/dev-login?telegram_id=${telegramId}`)
      
      persistTokens(data)
      api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
      
      const userRes = await api.get('/api/auth/me')
      const baseRole = normalizeRole(userRes.data?.role)
      const nextState = { user: userRes.data, token: data.access_token, isInitialized: true }
      if (!['admin', 'seller'].includes(baseRole)) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('view_role')
        }
        nextState.viewRole = null
      } else if (baseRole === 'seller' && !['buyer', 'seller'].includes(normalizeRole(nextState.viewRole))) {
        nextState.viewRole = 'seller'
      }
      set(nextState)
      get().startBalancePoll()
    } catch (error) {
      console.error('Dev login error:', error)
      set({ isInitialized: true })
    } finally {
      set({ isLoading: false })
    }
  },

  // Restore session from localStorage
  restoreSession: async () => {
    const token = localStorage.getItem('token')
    const refreshToken = localStorage.getItem('refresh_token')
    const isImpersonating = !!localStorage.getItem('admin_token')
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      try {
        // When impersonating, skip the auto-refresh interceptor so a failed
        // impersonation token doesn't silently refresh into the admin's session.
        const userRes = isImpersonating
          ? await axios.get(`${api.defaults.baseURL || ''}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}` }
            })
          : await api.get('/api/auth/me')
        const baseRole = normalizeRole(userRes.data?.role)
        const nextState = { user: userRes.data, token, isInitialized: true }
        if (!['admin', 'seller'].includes(baseRole)) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('view_role')
          }
          nextState.viewRole = null
        } else if (baseRole === 'seller' && !['buyer', 'seller'].includes(normalizeRole(nextState.viewRole))) {
          nextState.viewRole = 'seller'
        }
        set(nextState)
        get().startBalancePoll()
        return true
      } catch {
        // Don't try refresh for impersonation tokens — the refresh token
        // belongs to the admin and would create a wrong session.
        if (!isImpersonating && refreshToken) {
          try {
            const { data: refreshed } = await api.post('/api/auth/refresh', { refresh_token: refreshToken })
            persistTokens(refreshed)
            api.defaults.headers.common['Authorization'] = `Bearer ${refreshed.access_token}`

            const userRes = await api.get('/api/auth/me')
            const baseRole = normalizeRole(userRes.data?.role)
            const nextState = { user: userRes.data, token: refreshed.access_token, isInitialized: true }
            if (!['admin', 'seller'].includes(baseRole)) {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('view_role')
              }
              nextState.viewRole = null
            } else if (baseRole === 'seller' && !['buyer', 'seller'].includes(normalizeRole(nextState.viewRole))) {
              nextState.viewRole = 'seller'
            }
            set(nextState)
            get().startBalancePoll()
            return true
          } catch {
            clearPersistedTokens()
            delete api.defaults.headers.common['Authorization']
          }
        } else {
          clearPersistedTokens()
          delete api.defaults.headers.common['Authorization']
        }
      }
    }
    set({ isInitialized: true })
    return false
  },

  // Impersonate a user without page reload (avoids Telegram re-auth)
  startImpersonation: async (accessToken) => {
    try {
      // Save admin session
      const adminToken = localStorage.getItem('token')
      const adminRefresh = localStorage.getItem('refresh_token')
      localStorage.setItem('admin_token', adminToken)
      if (adminRefresh) localStorage.setItem('admin_refresh', adminRefresh)

      // Remove admin refresh token so the api.js 401 interceptor cannot
      // silently refresh back into the admin session when the short-lived
      // impersonation token expires.  The refresh token is safe in
      // 'admin_refresh' and will be restored by stopImpersonation().
      localStorage.removeItem('refresh_token')

      // Switch to impersonation token
      localStorage.setItem('token', accessToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`

      // Fetch impersonated user profile
      const { data: userData } = await axios.get(
        `${api.defaults.baseURL || ''}/api/auth/me`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      const baseRole = normalizeRole(userData?.role)
      let viewRole = baseRole === 'seller' ? 'seller' : null
      if (viewRole) localStorage.setItem('view_role', viewRole)

      set({ user: userData, token: accessToken, viewRole })
      return true
    } catch {
      // Restore admin session on failure
      const adminToken = localStorage.getItem('admin_token')
      if (adminToken) {
        localStorage.setItem('token', adminToken)
        api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`
      }
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_refresh')
      return false
    }
  },

  // Return from impersonation to admin session without page reload
  stopImpersonation: async () => {
    const adminToken = localStorage.getItem('admin_token')
    const adminRefresh = localStorage.getItem('admin_refresh')
    if (!adminToken) return false

    // Restore admin tokens
    localStorage.setItem('token', adminToken)
    if (adminRefresh) localStorage.setItem('refresh_token', adminRefresh)
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_refresh')
    api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`

    try {
      const { data: userData } = await api.get('/api/auth/me')
      const baseRole = normalizeRole(userData?.role)
      const viewRole = baseRole === 'admin' ? 'admin' : baseRole
      if (typeof window !== 'undefined') localStorage.setItem('view_role', viewRole)
      set({ user: userData, token: adminToken, viewRole })
      return true
    } catch {
      // Admin token expired — try refresh
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const { data: refreshed } = await api.post('/api/auth/refresh', { refresh_token: refreshToken })
          persistTokens(refreshed)
          api.defaults.headers.common['Authorization'] = `Bearer ${refreshed.access_token}`
          const { data: userData } = await api.get('/api/auth/me')
          const baseRole = normalizeRole(userData?.role)
          const viewRole = baseRole === 'admin' ? 'admin' : baseRole
          if (typeof window !== 'undefined') localStorage.setItem('view_role', viewRole)
          set({ user: userData, token: refreshed.access_token, viewRole })
          return true
        } catch {
          // Full failure — force re-login
          clearPersistedTokens()
          delete api.defaults.headers.common['Authorization']
          set({ user: null, token: null, viewRole: null })
          return false
        }
      }
      return false
    }
  },

  logout: () => {
    get().stopBalancePoll()
    api.post('/api/auth/logout').catch(() => {})
    clearPersistedTokens()
    localStorage.removeItem('view_role')
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_refresh')
    sessionStorage.removeItem('pin_verified')
    delete api.defaults.headers.common['Authorization']
    set({ user: null, token: null, viewRole: null })
    
    // Close Mini App if in Telegram
    const { tg } = get()
    if (tg) {
      tg.close()
    }
  },

  // Update buyer balance (called after deposit/purchase)
  updateBalance: (newBalance) => {
    set(state => ({
      user: state.user ? { ...state.user, balance: newBalance } : null
    }))
  },

  // Start polling balance every 30s
  startBalancePoll: () => {
    const existing = get()._balanceInterval
    if (existing) clearInterval(existing)

    const poll = async () => {
      const { token, user } = get()
      if (!token || !user) return
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const { data } = await api.get('/api/auth/balance')
        if (data.balance !== undefined && data.balance !== user.balance) {
          set(state => ({
            user: state.user ? { ...state.user, balance: data.balance } : null
          }))
        }
      } catch { /* ignore */ }
    }

    const id = setInterval(poll, 30000)
    set({ _balanceInterval: id })
  },

  stopBalancePoll: () => {
    const id = get()._balanceInterval
    if (id) {
      clearInterval(id)
      set({ _balanceInterval: null })
    }
  },

  setUser: (user) => {
    const baseRole = normalizeRole(user?.role)
    const nextState = { user }
    // If role changed to non-seller/admin, clear viewRole
    if (!['admin', 'seller'].includes(baseRole)) {
      if (typeof window !== 'undefined') localStorage.removeItem('view_role')
      nextState.viewRole = null
    } else if (baseRole === 'seller' && !get().viewRole) {
      // New seller — set viewRole to seller
      nextState.viewRole = 'seller'
      if (typeof window !== 'undefined') localStorage.setItem('view_role', 'seller')
    }
    set(nextState)
  },

  setViewRole: (role) => {
    const normalized = normalizeRole(role)
    if (typeof window !== 'undefined') {
      localStorage.setItem('view_role', normalized)
    }
    set({ viewRole: normalized })
  },

  clearViewRole: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('view_role')
    }
    set({ viewRole: null })
  },

  getEffectiveRole: () => {
    const { user, viewRole } = get()
    const baseRole = normalizeRole(user?.role)
    if (baseRole === 'admin') return normalizeRole(viewRole || baseRole)
    if (baseRole === 'seller') return normalizeRole(viewRole || baseRole)
    return baseRole
  },

  haptic: (type = 'light') => {
    const { tg } = get()
    if (tg?.HapticFeedback) {
      if (type === 'light') tg.HapticFeedback.impactOccurred('light')
      else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium')
      else if (type === 'heavy') tg.HapticFeedback.impactOccurred('heavy')
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success')
      else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning')
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error')
    }
  },

  // Send data back to Telegram bot
  sendToBot: (data) => {
    const { tg } = get()
    if (tg) {
      tg.sendData(JSON.stringify(data))
    }
  },

  // Show popup in Telegram
  showPopup: (params) => {
    const { tg } = get()
    if (tg) {
      tg.showPopup(params)
    }
  },

  // Custom confirm modal (promise-based)
  tgConfirm: (message) => globalConfirm(message)
}))
