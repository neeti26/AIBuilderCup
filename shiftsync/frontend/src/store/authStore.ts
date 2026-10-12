import { create } from 'zustand';
import { User } from '../types';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: (() => {
    try {
      const stored = localStorage.getItem('shiftsync_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  })(),
  token: localStorage.getItem('shiftsync_token'),
  isAuthenticated: !!localStorage.getItem('shiftsync_token'),

  login: (user, token) => {
    localStorage.setItem('shiftsync_token', token);
    localStorage.setItem('shiftsync_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('shiftsync_token');
    localStorage.removeItem('shiftsync_user');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
