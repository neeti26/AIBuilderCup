import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, ClipboardList, Cpu, AlertTriangle,
  FileText, MessageSquare, LogOut, Settings, TrendingUp, User
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const navItems: Array<{ to: string; icon: React.ComponentType<{ className?: string }>; label: string; exact?: boolean }> = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/shift', icon: ClipboardList, label: 'Active Shift' },
  { to: '/machines', icon: Cpu, label: 'Machines' },
  { to: '/alerts', icon: AlertTriangle, label: 'Alerts' },
  { to: '/handover', icon: FileText, label: 'Handover' },
  { to: '/assistant', icon: MessageSquare, label: 'AI Assistant' },
  { to: '/analytics', icon: TrendingUp, label: 'Analytics' },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0" aria-label="Main navigation">
      {/* Logo */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center" aria-hidden="true">
            <span className="text-white font-bold text-sm">SS</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">ShiftSync AI</h1>
            <p className="text-slate-500 text-xs">Intelligent Operations</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5" aria-label="Site navigation">
        {navItems.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              isActive
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            )}
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                <Icon className={clsx('w-4 h-4', isActive ? 'text-blue-400' : 'text-slate-500')} aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      <div className="p-3 border-t border-slate-800 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800">
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center" aria-hidden="true">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-200 text-xs font-medium truncate">{user?.full_name}</p>
            <p className="text-slate-500 text-xs capitalize truncate">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
