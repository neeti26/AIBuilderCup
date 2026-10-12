// ─── Core Types ───────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ShiftType = 'day' | 'evening' | 'night';
export type MachineStatus = 'running' | 'idle' | 'maintenance' | 'fault' | 'offline';
export type LogCategory = 'machine' | 'quality' | 'safety' | 'material' | 'maintenance' | 'production' | 'other';
export type UserRole = 'supervisor' | 'operator' | 'engineer' | 'manager';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  department: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// ─── Shift ────────────────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  shift_type: ShiftType;
  line: string;
  date: string;
  supervisor: string;
  supervisor_name: string;
  team_members: string[];
  status: 'active' | 'completed' | 'upcoming';
  production_target?: number;
  production_actual?: number;
  created_at: string;
  completed_at?: string;
  log_count: number;
  open_actions: number;
}

// ─── Log Entry ────────────────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  shift_id: string;
  raw_text: string;
  machine_id?: string;
  category: LogCategory;
  severity: Severity;
  ai_summary?: string;
  action_items?: string[];
  tags: string[];
  requires_immediate_attention?: boolean;
  root_cause_hint?: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
}

// ─── Machine ──────────────────────────────────────────────────────────────────

export interface Machine {
  id: string;
  machine_id: string;
  name: string;
  line: string;
  status: MachineStatus;
  oee?: number;
  temperature?: number;
  vibration?: number;
  pressure?: number;
  last_updated: string;
  notes?: string;
  active_alerts: number;
}

// ─── Alert ────────────────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  machine_id: string;
  machine_name: string;
  alert_type: string;
  severity: Severity;
  message: string;
  ai_diagnosis?: string;
  recommended_action?: string;
  triggered_at: string;
  acknowledged: boolean;
  acknowledged_by?: string;
}

// ─── Handover Report ──────────────────────────────────────────────────────────

export interface ActionItem {
  id: string;
  description: string;
  priority: Severity;
  category: LogCategory;
  assigned_to?: string;
  machine_id?: string;
  estimated_duration?: string;
  status: 'open' | 'in_progress' | 'done';
}

export interface HandoverReport {
  id: string;
  shift_id: string;
  generated_at: string;
  generated_by_ai: boolean;
  executive_summary: string;
  production_summary: string;
  critical_issues: Array<{
    issue: string;
    machine_id?: string;
    impact: string;
    status: string;
    action_required: string;
  }>;
  machine_health_overview: string;
  quality_incidents: Array<{
    description: string;
    severity: Severity;
    quantity_affected: string;
    disposition: string;
    follow_up: string;
  }>;
  maintenance_completed: string[];
  maintenance_pending: string[];
  material_status: string;
  safety_incidents: Array<{
    description: string;
    severity: Severity;
    persons_involved: string;
    action_taken: string;
    reporting_required: boolean;
  }>;
  action_items: ActionItem[];
  next_shift_recommendations: string;
  shift_performance_score: number;
  performance_breakdown: {
    safety_score: number;
    quality_score: number;
    production_score: number;
    maintenance_score: number;
  };
  total_logs: number;
  critical_count: number;
  high_count: number;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  active_shift?: Shift;
  machines_total: number;
  machines_running: number;
  machines_fault: number;
  machines_maintenance: number;
  open_alerts: number;
  critical_alerts: number;
  logs_today: number;
  oee_average: number;
  production_achievement?: number;
  recent_alerts: Alert[];
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[];
  suggested_actions?: string[];
}
