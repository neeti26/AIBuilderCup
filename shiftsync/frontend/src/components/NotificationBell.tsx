import { useEffect, useState } from 'react';
import { BellDot } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';
import clsx from 'clsx';

interface NotificationBellProps {
  className?: string;
}

interface NotificationItemProps {
  notification: any;
  onAcknowledge: (id: string) => void;
}

function NotificationItem({ notification, onAcknowledge }: NotificationItemProps) {
  const severityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
  };

  return (
    <div
      key={notification.id}
      onClick={() => onAcknowledge(notification.id)}
      className={clsx(
        'p-3 border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors',
        !notification.read && 'bg-slate-700/10 border-l-2 border-blue-500'
      )}
    >
      <div className="flex items-start gap-2 mb-1">
        <div className={clsx('w-2 h-2 rounded-full', severityColors[notification.severity || 'low'])} />
        <span className="text-xs font-medium text-slate-200">{notification.title}</span>
        {!notification.read && (
          <span className="ml-auto text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">NEW</span>
        )}
      </div>
      <p className="text-xs text-slate-400 truncate">{notification.message}</p>
      {notification.machine_name && (
        <p className="text-[10px] text-slate-500 mt-1">
          <span className="font-medium">{notification.machine_name}</span>
        </p>
      )}
    </div>
  );
}

export default function NotificationBell({ className }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative" aria-label="Notifications">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'relative p-2 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg transition-colors',
          unreadCount > 0 ? 'text-blue-400' : 'text-slate-400'
        )}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
      >
        <BellDot className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-900" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 animate-fade-in">
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">Notifications</h3>
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-400 hover:text-blue-300 focus:outline-none"
              >
                Mark all as read
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                No notifications
              </div>
            ) : (
              <div>
                {notifications.slice(0, 10).map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onAcknowledge={markAsRead}
                  />
                ))}
                {notifications.length > 10 && (
                  <div className="p-3 text-center text-xs text-slate-500">
                    Showing 10 of {notifications.length} notifications
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
