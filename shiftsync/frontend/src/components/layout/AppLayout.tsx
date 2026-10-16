import { useState, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import AlertBanner from '../AlertBanner';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Menu, X } from 'lucide-react';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  const prevPathRef = useRef(location.pathname);
  if (prevPathRef.current !== location.pathname) {
    setSidebarOpen(false);
    prevPathRef.current = location.pathname;
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
        {/* Mobile hamburger */}
        <div className="md:hidden fixed top-4 left-4 z-50">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 bg-blue-600 text-white rounded-lg shadow-lg focus:outline-none focus:ring-2 focus-ring-blue-400"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Sidebar */}
        <aside
          className={clsx(
            'bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0 z-20',
            sidebarOpen ? 'transform translate-x-0' : '-translate-x-full md:translate-x-0',
            'transition-transform duration-300 ease-in-out'
          )}
          aria-label="Main navigation"
        >
          <div className="p-3 border-b border-slate-800">
            {sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>

          <Sidebar />

          <div className="mt-auto p-3 border-t border-slate-800">
            <button
              onClick={() => {
                localStorage.removeItem('shiftsync_token');
                localStorage.removeItem('shiftsync_user');
                window.location.href = '/login';
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label="Sign out"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <AlertBanner />
          <main className="flex-1 overflow-y-auto p-6 md:p-8" id="main-content">
            <Outlet />
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
