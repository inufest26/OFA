import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({ baseURL: API_URL });

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 → redirect to login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const login = (u, p) => api.post('/api/auth/login', { username: u, password: p }).then((r) => r.data);
export const getMetrics          = ()  => api.get('/api/metrics').then((r) => r.data);
export const getAcquirers        = ()  => api.get('/api/metrics/acquirers').then((r) => r.data);
export const getTimeline         = (id)=> api.get(`/api/metrics/timeline?acquirerId=${id}`).then((r) => r.data);
export const getAllTimelines      = ()  => api.get('/api/metrics/timeline').then((r) => r.data);
export const getTransactions     = (p) => api.get('/api/transactions', { params: p }).then((r) => r.data);
export const getTransaction      = (id)=> api.get(`/api/transactions/${id}`).then((r) => r.data);
export const getLogs             = (p) => api.get('/api/admin/logs', { params: p }).then((r) => r.data);
export const getIncidents        = (p) => api.get('/api/agent/incidents', { params: p }).then((r) => r.data);
export const getIncident         = (id)=> api.get(`/api/agent/incidents/${id}`).then((r) => r.data);
export const acknowledgeIncident = (id)=> api.post(`/api/agent/incidents/${id}/acknowledge`).then((r) => r.data);
export const getEscalations      = (p) => api.get('/api/agent/escalations', { params: p }).then((r) => r.data);
export const acknowledgeEscalation=(id)=> api.post(`/api/agent/escalations/${id}/acknowledge`).then((r) => r.data);
export const askAgent            = (q) => api.post('/api/agent/ask', { question: q }).then((r) => r.data);
export const triggerAcquirerFault = () => api.post('/api/agent/trigger/acquirer-fault').then((r) => r.data);
export const triggerMerchantFault = () => api.post('/api/agent/trigger/merchant-fault').then((r) => r.data);

export const getTrafficStatus       = () => api.get('/api/admin/traffic/status').then((r) => r.data);
export const toggleTraffic          = (action) => api.post('/api/admin/traffic/toggle', { action }).then((r) => r.data);
export const toggleAcquirer         = (id, action) => api.post(`/api/admin/acquirers/${id}/toggle`, { action }).then(r => r.data);
export const updateAcquirerSettings = (id, routingWeight) => api.post(`/api/admin/acquirers/${id}/settings`, { routingWeight }).then(r => r.data);

export default api;
