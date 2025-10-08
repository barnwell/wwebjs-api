import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if needed
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // If token expired, try to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        try {
          const response = await axios.post('/api/auth/refresh', { refreshToken })
          const { token, refreshToken: newRefreshToken } = response.data
          
          localStorage.setItem('token', token)
          localStorage.setItem('refreshToken', newRefreshToken)
          
          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        } catch (refreshError) {
          // Refresh failed, redirect to login
          localStorage.removeItem('token')
          localStorage.removeItem('refreshToken')
          localStorage.removeItem('user')
          window.location.reload()
        }
      } else {
        // No refresh token, redirect to login
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        window.location.reload()
      }
    }

    return Promise.reject(error)
  }
)

// Instances API
export const instancesAPI = {
  getAll: async () => {
    const response = await api.get('/instances')
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/instances/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/instances', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.patch(`/instances/${id}`, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/instances/${id}`)
    return response.data
  },
  start: async (id) => {
    const response = await api.post(`/instances/${id}/start`)
    return response.data
  },
  stop: async (id) => {
    const response = await api.post(`/instances/${id}/stop`)
    return response.data
  },
  restart: async (id) => {
    const response = await api.post(`/instances/${id}/restart`)
    return response.data
  },
  getStats: async (id) => {
    const response = await api.get(`/instances/${id}/stats`)
    return response.data
  },
  getLogs: async (id, tail = 100) => {
    const response = await api.get(`/instances/${id}/logs?tail=${tail}`)
    return response.data
  },
  getQR: async (id) => {
    const response = await api.get(`/instances/${id}/qr`)
    return response.data
  },
  getSessionStatus: async (id) => {
    const response = await api.get(`/instances/${id}/session-status`)
    return response.data
  },
  getDefaultConfig: async () => {
    const response = await api.get('/instances/default-config')
    return response.data
  },
  // Session management
  getSessions: async (id) => {
    const response = await api.get(`/instances/${id}/sessions`)
    return response.data
  },
  deleteSession: async (id, sessionId) => {
    const response = await api.delete(`/instances/${id}/sessions/${sessionId}`)
    return response.data
  },
  deleteAllSessions: async (id) => {
    const response = await api.delete(`/instances/${id}/sessions`)
    return response.data
  },
  // Session info from wwebjs-api
  getSessionClassInfo: async (instanceId, sessionId) => {
    const response = await api.get(`/instances/${instanceId}/session-class-info/${sessionId}`)
    return response.data
  },
  getSessionQR: async (instanceId, sessionId) => {
    const response = await api.get(`/instances/${instanceId}/session-qr/${sessionId}`)
    return response.data
  },
  getResources: async (id) => {
    const response = await api.get(`/instances/${id}/resources`)
    return response.data
  },
  // Port management
  checkPortAvailability: async (port) => {
    const response = await api.get(`/instances/port-availability/${port}`)
    return response.data
  },
  getPortRange: async () => {
    const response = await api.get('/instances/port-range')
    return response.data
  },
  getAvailablePorts: async () => {
    const response = await api.get('/instances/available-ports')
    return response.data
  },
}

// Templates API
export const templatesAPI = {
  getAll: async () => {
    const response = await api.get('/templates')
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/templates/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/templates', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.patch(`/templates/${id}`, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/templates/${id}`)
    return response.data
  },
}

// Metrics API
export const metricsAPI = {
  getByInstance: async (id, timeRange = '1h') => {
    const response = await api.get(`/metrics/instance/${id}?timeRange=${timeRange}`)
    return response.data
  },
  getLatest: async () => {
    const response = await api.get('/metrics/latest')
    return response.data
  },
  collect: async (id) => {
    const response = await api.post(`/metrics/collect/${id}`)
    return response.data
  },
  cleanup: async (daysToKeep = 30) => {
    const response = await api.delete(`/metrics/cleanup?daysToKeep=${daysToKeep}`)
    return response.data
  },
}

// Settings API
export const settingsAPI = {
  getAll: async () => {
    const response = await api.get('/settings')
    return response.data
  },
  getByKey: async (key) => {
    const response = await api.get(`/settings/${key}`)
    return response.data
  },
  update: async (key, value) => {
    const response = await api.put(`/settings/${key}`, { value })
    return response.data
  },
  delete: async (key) => {
    const response = await api.delete(`/settings/${key}`)
    return response.data
  },
}

// Auth API
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials)
    return response.data
  },
  register: async (userData) => {
    const response = await api.post('/auth/register', userData)
    return response.data
  },
  refresh: async (refreshToken) => {
    const response = await api.post('/auth/refresh', { refreshToken })
    return response.data
  },
  logout: async () => {
    const response = await api.post('/auth/logout')
    return response.data
  },
  getProfile: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },
  updateProfile: async (data) => {
    const response = await api.put('/auth/profile', data)
    return response.data
  },
}

// Users API (admin only)
export const usersAPI = {
  getAll: async () => {
    const response = await api.get('/users')
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/users/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/users', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/users/${id}`, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/users/${id}`)
    return response.data
  },
  getInstances: async (id) => {
    const response = await api.get(`/users/${id}/instances`)
    return response.data
  },
}

// Export the main API client
export const apiClient = api

export default api

