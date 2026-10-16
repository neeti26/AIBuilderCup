import axios, { AxiosInstance } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('shiftsync_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('shiftsync_token');
      localStorage.removeItem('shiftsync_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  register: (data: object) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

// ─── Shifts ───────────────────────────────────────────────────────────────────
export const shiftsApi = {
  create: (data: object) => api.post('/shifts/', data),
  getActive: (line?: string) => api.get('/shifts/active', { params: { line } }),
  getByDate: (date: string, line?: string) =>
    api.get(`/shifts/date/${date}`, { params: { line } }),
  getById: (id: string) => api.get(`/shifts/${id}`),
  complete: (id: string, productionActual: number) =>
    api.post(`/shifts/${id}/complete`, null, { params: { production_actual: productionActual } }),
};

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const logsApi = {
  submit: (data: object) => api.post('/logs/', data),
  getForShift: (shiftId: string) => api.get(`/logs/shift/${shiftId}`),
  getCritical: (shiftId: string) => api.get(`/logs/shift/${shiftId}/critical`),
  getRecent: (limit = 20) => api.get('/logs/recent', { params: { limit } }),
};

// ─── Handover ─────────────────────────────────────────────────────────────────
export const handoverApi = {
  generate: (shiftId: string) =>
    api.post('/handover/generate', { shift_id: shiftId }),
  getStatus: (shiftId: string) => api.get(`/handover/status/${shiftId}`),
  getForShift: (shiftId: string) => api.get(`/handover/shift/${shiftId}`),
  getLatest: (line: string) => api.get(`/handover/latest/${line}`),
};

// ─── Machines ─────────────────────────────────────────────────────────────────
export const machinesApi = {
  getAll: () => api.get('/machines/'),
  getById: (id: string) => api.get(`/machines/${id}`),
  updateStatus: (data: object) => api.post('/machines/status', data),
  getMaintenanceRec: (id: string) => api.get(`/machines/${id}/maintenance-recommendation`),
  bulkUpdate: (updates: object[]) => api.post('/machines/bulk-status', updates),
};

// ─── AI ───────────────────────────────────────────────────────────────────────
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

// ─── Seed ─────────────────────────────────────────────────────────────────────
export const seedApi = {
  seedDemo: () => api.post('/seed/demo-data'),
};

export default api;
