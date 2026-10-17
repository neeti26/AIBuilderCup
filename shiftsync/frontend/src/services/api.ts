import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// For Firebase Hosting, API is proxied via /api → Cloud Functions
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let requestCount = 0;
const onRequestStart = () => { requestCount++; };
const onRequestEnd = () => { requestCount = Math.max(0, requestCount - 1); };

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('shiftsync_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Request-ID'] = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  onRequestStart();
  return config;
}, (error) => {
  onRequestEnd();
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => {
    onRequestEnd();
    return response;
  },
  (error: AxiosError) => {
    onRequestEnd();
    if (error.response?.status === 401) {
      localStorage.removeItem('shiftsync_token');
      localStorage.removeItem('shiftsync_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    if (error.response?.status === 429) {
      return Promise.reject(error);
    }
    if (error.response?.status && error.response.status >= 500) {
      console.error('[ShiftSync API] Server error:', error.response.status, error.message);
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  register: (data: object) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const shiftsApi = {
  create: (data: object) => api.post('/shifts/', data),
  getActive: (line?: string) => api.get('/shifts/active', { params: { line } }),
  getByDate: (date: string, line?: string) =>
    api.get(`/shifts/date/${date}`, { params: { line } }),
  getById: (id: string) => api.get(`/shifts/${id}`),
  complete: (id: string, productionActual: number) =>
    api.post(`/shifts/${id}/complete`, null, { params: { production_actual: productionActual } }),
};

export const logsApi = {
  submit: (data: object) => api.post('/logs/', data),
  getForShift: (shiftId: string, limit = 100, offset = 0) =>
    api.get(`/logs/shift/${shiftId}`, { params: { limit, offset } }),
  getCritical: (shiftId: string) => api.get(`/logs/shift/${shiftId}/critical`),
  getRecent: (limit = 50) => api.get('/logs/recent', { params: { limit } }),
};

export const handoverApi = {
  generate: (shiftId: string) =>
    api.post('/handover/generate', { shift_id: shiftId }),
  getStatus: (shiftId: string) => api.get(`/handover/status/${shiftId}`),
  getForShift: (shiftId: string) => api.get(`/handover/shift/${shiftId}`),
  getLatest: (line: string) => api.get(`/handover/latest/${line}`),
};

export const machinesApi = {
  getAll: () => api.get('/machines/'),
  getById: (id: string) => api.get(`/machines/${id}`),
  updateStatus: (data: object) => api.post('/machines/status', data),
  getMaintenanceRec: (id: string) => api.get(`/machines/${id}/maintenance-recommendation`),
  bulkUpdate: (updates: object[]) => api.post('/machines/bulk-status', updates),
};

export const aiApi = {
  chat: (message: string, shiftId?: string, history?: object[]) =>
    api.post('/ai/chat', {
      message,
      shift_id: shiftId,
      conversation_history: history || [],
    }),
  getAlerts: () => api.get('/ai/alerts'),
  acknowledgeAlert: (alertId: string) =>
    api.post(`/ai/alerts/${alertId}/acknowledge`),
  getDashboard: () => api.get('/ai/dashboard'),
  analyzeTrend: (line: string, days = 7) =>
    api.post('/ai/analyze-trend', null, { params: { line, days } }),
};

export const seedApi = {
  seedDemo: () => api.post('/seed/demo-data'),
  initUsers: () => api.post('/seed/init-users'),
};

export default api;
export { requestCount };
