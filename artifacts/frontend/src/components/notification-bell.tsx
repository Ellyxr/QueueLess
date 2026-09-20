import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AUTH_STATE_CHANGED_EVENT,
  getUnreadNotificationCount,
  listNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/features/auth/api";

const POLL_INTERVAL_MS = 15000;

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const refreshCount = () => {
      getUnreadNotificationCount()
        .then((data) => {
          if (!cancelled) setUnreadCount(data.unreadCount);
        })
        .catch(() => {});
    };

    refreshCount();
    const timer = window.setInterval(refreshCount, POLL_INTERVAL_MS);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, refreshCount);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, refreshCount);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      listNotifications()
        .then(setNotifications)
        .catch(() => setNotifications([]));
    }
  };

  const handleSelect = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      try {
        await markNotificationRead(notification.id);
        setUnreadCount((count) => Math.max(0, count - 1));
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, isRead: true } : item,
          ),
        );
      } catch {
        // ignore
      }
    }

    if (notification.relatedEntityType === "GroupOrder") {
      window.location.href = "/cart";
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        className="relative rounded-full border border-border/80 bg-background text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-border bg-card p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Notifications
          </p>
          {notifications.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleSelect(notification)}
                  className={`block w-full rounded-xl p-2 text-left text-xs transition-colors hover:bg-secondary ${
                    notification.isRead ? "opacity-60" : ""
                  }`}
                >
                  <p className="font-semibold text-foreground">{notification.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{notification.body}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
