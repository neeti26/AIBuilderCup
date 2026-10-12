"""Pydantic schemas for ShiftSync AI."""
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum


# ─── Enums ───────────────────────────────────────────────────────────────────

class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"

class ShiftType(str, Enum):
    DAY = "day"       # 06:00–14:00
    EVENING = "evening"  # 14:00–22:00
    NIGHT = "night"   # 22:00–06:00

class MachineStatus(str, Enum):
    RUNNING = "running"
    IDLE = "idle"
    MAINTENANCE = "maintenance"
    FAULT = "fault"
    OFFLINE = "offline"

class LogCategory(str, Enum):
    MACHINE = "machine"
    QUALITY = "quality"
    SAFETY = "safety"
    MATERIAL = "material"
    MAINTENANCE = "maintenance"
    PRODUCTION = "production"
    OTHER = "other"


# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class UserCreate(BaseModel):
    username: str
    full_name: str
    role: Literal["supervisor", "operator", "engineer", "manager"]
    department: str
    password: str


# ─── Operator Log Entry ────────────────────────────────────────────────────────

class LogEntryCreate(BaseModel):
    shift_id: str
    raw_text: str = Field(..., min_length=10, max_length=5000,
                          description="Free-text log entry from operator")
    machine_id: Optional[str] = None
    category: Optional[LogCategory] = None
    attachments: Optional[List[str]] = []  # Base64 images or file refs

class LogEntryResponse(BaseModel):
    id: str
    shift_id: str
    raw_text: str
    machine_id: Optional[str]
    category: LogCategory
    severity: Severity
    ai_summary: Optional[str]
    action_items: Optional[List[str]]
    tags: List[str]
    created_at: datetime
    created_by: str
    created_by_name: str


# ─── Machine Status ────────────────────────────────────────────────────────────

class MachineUpdate(BaseModel):
    machine_id: str
    status: MachineStatus
    notes: Optional[str] = None
    oee: Optional[float] = Field(None, ge=0, le=100, description="OEE percentage")
    temperature: Optional[float] = None
    vibration: Optional[float] = None
    pressure: Optional[float] = None

class MachineStatusResponse(BaseModel):
    machine_id: str
    name: str
    line: str
    status: MachineStatus
    oee: Optional[float]
    last_updated: datetime
    notes: Optional[str]
    active_alerts: int


# ─── Shift ────────────────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    shift_type: ShiftType
    line: str
    date: str  # ISO date string YYYY-MM-DD
    supervisor: str
    team_members: List[str]
    production_target: Optional[int] = None
    notes: Optional[str] = None

class ShiftResponse(BaseModel):
    id: str
    shift_type: ShiftType
    line: str
    date: str
    supervisor: str
    supervisor_name: str
    team_members: List[str]
    status: Literal["active", "completed", "upcoming"]
    production_target: Optional[int]
    production_actual: Optional[int]
    created_at: datetime
    completed_at: Optional[datetime]
    log_count: int
    open_actions: int


# ─── Handover Report ──────────────────────────────────────────────────────────

class HandoverReportRequest(BaseModel):
    shift_id: str
    include_recommendations: bool = True
    include_next_shift_prep: bool = True

class ActionItem(BaseModel):
    id: str
    description: str
    priority: Severity
    category: LogCategory
    assigned_to: Optional[str]
    machine_id: Optional[str]
    estimated_duration: Optional[str]
    status: Literal["open", "in_progress", "done"] = "open"

class HandoverReportResponse(BaseModel):
    id: str
    shift_id: str
    generated_at: datetime
    generated_by_ai: bool = True

    # AI-generated sections
    executive_summary: str
    production_summary: str
    critical_issues: List[dict]
    machine_health_overview: str
    quality_incidents: List[dict]
    maintenance_completed: List[str]
    maintenance_pending: List[str]
    material_status: str
    safety_incidents: List[dict]
    action_items: List[ActionItem]
    next_shift_recommendations: str
    shift_performance_score: float  # 0–100

    # Raw metrics
    total_logs: int
    critical_count: int
    high_count: int


# ─── AI Chat / Ask ────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str
    shift_id: Optional[str] = None
    conversation_history: Optional[List[ChatMessage]] = []

class ChatResponse(BaseModel):
    response: str
    sources: Optional[List[str]] = []
    suggested_actions: Optional[List[str]] = []


# ─── Anomaly / Alert ──────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: str
    machine_id: str
    machine_name: str
    alert_type: str
    severity: Severity
    message: str
    ai_diagnosis: Optional[str]
    recommended_action: Optional[str]
    triggered_at: datetime
    acknowledged: bool
    acknowledged_by: Optional[str]


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    active_shift: Optional[ShiftResponse]
    machines_total: int
    machines_running: int
    machines_fault: int
    machines_maintenance: int
    open_alerts: int
    critical_alerts: int
    logs_today: int
    oee_average: float
    production_achievement: float  # percentage of target
    recent_alerts: List[AlertResponse]
