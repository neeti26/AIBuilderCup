import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getCsrfToken, sanitizeInput } from '../lib/security';

// Backend API on Render
const BASE_URL = import.meta.env.VITE_API_URL || 'https://aibuildercup.onrender.com/api/v1';

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
  const csrfToken = getCsrfToken();
  config.headers['X-CSRF-Token'] = csrfToken;
  config.headers['X-Request-ID'] = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  onRequestStart();
  return config;
}, (error) => {
  onRequestEnd();
  return Promise.reject(new Error('Network error: Unable to connect to server'));
});

api.interceptors.response.use(
  (response) => {
    onRequestEnd();
    return response;
  },
  (error: AxiosError) => {
    onRequestEnd();
    
    // Network error (no response from server)
    if (!error.response) {
      return Promise.reject(new Error('Network error: Unable to connect to server. Please check your internet connection.'));
    }

    const status = error.response.status;
    const responseData = error.response.data as any;

    // Extract error message from various response formats
    let errorMessage = '';
    if (typeof responseData === 'string') {
      errorMessage = responseData;
    } else if (responseData?.detail) {
      errorMessage = responseData.detail;
    } else if (responseData?.message) {
      errorMessage = responseData.message;
    } else if (responseData?.error) {
      errorMessage = responseData.error;
    } else if (error.message) {
      errorMessage = error.message;
    } else {
      errorMessage = `Request failed with status ${status}`;
    }

    // Handle specific status codes
    if (status === 401) {
      localStorage.removeItem('shiftsync_token');
      localStorage.removeItem('shiftsync_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      errorMessage = 'Invalid credentials. Please check your username and password.';
    } else if (status === 403) {
      errorMessage = 'Access denied. You do not have permission to perform this action.';
    } else if (status === 404) {
      errorMessage = 'Resource not found. Please try again later.';
    } else if (status === 429) {
      errorMessage = 'Too many requests. Please slow down and try again later.';
    } else if (status >= 500) {
      errorMessage = 'Server error. Please try again later.';
    }

    return Promise.reject(new Error(errorMessage));
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username: sanitizeInput(username), password }),
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
      message: sanitizeInput(message),
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
fix: final production deploy
trigger vercel deploy
