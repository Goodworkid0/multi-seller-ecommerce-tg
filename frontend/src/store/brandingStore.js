import { create } from 'zustand'
import api from '../lib/api'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const makeAbsoluteUrl = (path) => {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  if (API_BASE) return `${API_BASE}${path}`
  return path
}

export const useBrandingStore = create((set, get) => ({
  appName: '',
  logoUrl: null,
  showLogo: true,
  botUsername: '',
  maintenanceMode: false,
  announcementsUrl: null,
  vouchesUrl: null,
  officialGroupUrl: null,
  suggestionGroupUrl: null,
  marketplaceRules: [],
  wtbRules: [],
  loaded: false,
  loadError: false,

  load: async () => {
    try {
      const { data } = await api.get('/api/branding')
      set({
        appName: data.app_name || '',
        logoUrl: makeAbsoluteUrl(data.logo_url),
        showLogo: data.show_logo !== false,
        botUsername: data.bot_username || '',
        maintenanceMode: data.maintenance_mode || false,
        announcementsUrl: data.announcements_url,
        vouchesUrl: data.vouches_url,
        officialGroupUrl: data.official_group_url,
        suggestionGroupUrl: data.suggestion_group_url,
        marketplaceRules: data.marketplace_rules || [],
        wtbRules: data.wtb_rules || [],
        loaded: true,
        loadError: false,
      })
    } catch (e) {
      console.error('Failed to load branding', e)
      set({ loaded: true, loadError: true })
    }
  },

  // update locally after admin changes
  update: (partial) => set(partial),
}))
