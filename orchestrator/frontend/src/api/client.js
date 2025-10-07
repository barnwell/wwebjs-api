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
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error || error.message
    return Promise.reject(new Error(message))
  }
)

// Instances API
export const instancesAPI = {
  getAll: () => api.get('/instances'),
  getById: (id) => api.get(`/instances/${id}`),
  create: (data) => api.post('/instances', data),
  update: (id, data) => api.patch(`/instances/${id}`, data),
  delete: (id) => api.delete(`/instances/${id}`),
  start: (id) => api.post(`/instances/${id}/start`),
  stop: (id) => api.post(`/instances/${id}/stop`),
  restart: (id) => api.post(`/instances/${id}/restart`),
  getStats: (id) => api.get(`/instances/${id}/stats`),
  getLogs: (id, tail = 100) => api.get(`/instances/${id}/logs?tail=${tail}`),
  getQR: (id) => api.get(`/instances/${id}/qr`),
  getSessionStatus: (id) => api.get(`/instances/${id}/session-status`),
  getDefaultConfig: () => api.get('/instances/default-config'),
}

// Templates API
export const templatesAPI = {
  getAll: () => api.get('/templates'),
  getById: (id) => api.get(`/templates/${id}`),
  create: (data) => api.post('/templates', data),
  update: (id, data) => api.patch(`/templates/${id}`, data),
  delete: (id) => api.delete(`/templates/${id}`),
}

// Metrics API
export const metricsAPI = {
  getByInstance: (id, timeRange = '1h') => api.get(`/metrics/instance/${id}?timeRange=${timeRange}`),
  getLatest: () => api.get('/metrics/latest'),
  collect: (id) => api.post(`/metrics/collect/${id}`),
  cleanup: (daysToKeep = 30) => api.delete(`/metrics/cleanup?daysToKeep=${daysToKeep}`),
}

// Settings API
export const settingsAPI = {
  getAll: () => api.get('/settings'),
  getByKey: (key) => api.get(`/settings/${key}`),
  update: (key, value) => api.put(`/settings/${key}`, { value }),
  delete: (key) => api.delete(`/settings/${key}`),
}

export default api

