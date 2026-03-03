import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json'
  }
})

let refreshInFlight = null

const setAccessToken = (token) => {
  if (token) {
    localStorage.setItem('token', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    return
  }
  localStorage.removeItem('token')
  delete api.defaults.headers.common['Authorization']
}

const clearStoredAuth = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  delete api.defaults.headers.common['Authorization']
}

const refreshAccessToken = async () => {
  if (refreshInFlight) return refreshInFlight

  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) throw new Error('No refresh token')

  refreshInFlight = axios
    .post(`${api.defaults.baseURL || ''}/api/auth/refresh`, { refresh_token: refreshToken }, {
      headers: { 'Content-Type': 'application/json' }
    })
    .then((res) => {
      const newAccess = res?.data?.access_token
      const newRefresh = res?.data?.refresh_token
      if (!newAccess) throw new Error('Refresh response missing access token')
      setAccessToken(newAccess)
      if (newRefresh) localStorage.setItem('refresh_token', newRefresh)
      return newAccess
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

// Add token from localStorage
const token = localStorage.getItem('token')
if (token) {
  setAccessToken(token)
}

// Response interceptor for error handling
api.interceptors.response.use(
  response => response,
  async error => {
    const status = error?.response?.status
    const originalRequest = error?.config

    if (status === 401 && originalRequest) {
      const isRefreshCall = String(originalRequest.url || '').includes('/api/auth/refresh')
      const hasRefresh = !!localStorage.getItem('refresh_token')

      if (isRefreshCall || originalRequest._retry || !hasRefresh) {
        clearStoredAuth()
        return Promise.reject(error)
      }

      originalRequest._retry = true
      try {
        const newAccess = await refreshAccessToken()
        originalRequest.headers = {
          ...(originalRequest.headers || {}),
          Authorization: `Bearer ${newAccess}`
        }
        return api(originalRequest)
      } catch (refreshError) {
        clearStoredAuth()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
