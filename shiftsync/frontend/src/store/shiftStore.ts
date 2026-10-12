import { create } from 'zustand';
import { Shift, LogEntry, Alert } from '../types';

interface ShiftStore {
  activeShift: Shift | null;
  logs: LogEntry[];
  alerts: Alert[];
  setActiveShift: (shift: Shift | null) => void;
  addLog: (log: LogEntry) => void;
  setLogs: (logs: LogEntry[]) => void;
  addAlert: (alert: Alert) => void;
  setAlerts: (alerts: Alert[]) => void;
  acknowledgeAlert: (alertId: string) => void;
}

export const useShiftStore = create<ShiftStore>((set) => ({
  activeShift: null,
  logs: [],
  alerts: [],

  setActiveShift: (shift) => set({ activeShift: shift }),

  addLog: (log) => set((state) => ({ logs: [log, ...state.logs] })),
  setLogs: (logs) => set({ logs }),

  addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),
  setAlerts: (alerts) => set({ alerts }),

  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ),
    })),
}));
