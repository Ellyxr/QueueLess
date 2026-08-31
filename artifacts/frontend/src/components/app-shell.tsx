import { useState, useEffect, useRef, ReactNode } from "react";
import {
  Search,
  ShoppingBag,
  Bell,
  UserCircle2,
  ShoppingCart,
  Compass,
  X,
  Store,
  Shield,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { User } from "@/types/auth";
import { logoutUser } from "@/features/auth/api";

interface AppShellProps {
  children: ReactNode;
  username?: string;
  isLoggedIn?: boolean;
}

const navIcons: Record<string, React.ReactNode> = {
  Browse: <Compass className="h-4 w-4" />,
  Search: <Search className="h-4 w-4" />,
  Cart: <ShoppingCart className="h-4 w-4" />,
  Vendor: <Store className="h-4 w-4" />,
  Admin: <Shield className="h-4 w-4" />,
};

export function AppShell({
  children,
  username = "Jamie",
  isLoggedIn = true,
}: AppShellProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoginPage, setIsLoginPage] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsLoginPage(window.location.pathname === "/login");
    }

    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user session", e);
      }
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsScrolled(!entry.isIntersecting);
      },
      { threshold: [1] },
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  return (
    <div className="foundation-noise relative min-h-[100dvh] bg-background">
      <div className="foundation-grid pointer-events-none absolute inset-x-0 top-0 h-[620px] opacity-80" />

      <div
        ref={sentinelRef}
        className="absolute top-0 h-4 w-full pointer-events-none"
      />

      <header
        className={`sticky top-0 z-50 flex items-center justify-between gap-3 border border-border/80 bg-card/80 px-8 py-3 transition-all duration-300 ease-in-out sm:px-4 ${
          isScrolled
            ? "mx-auto w-[90%] rounded-[28px] shadow-lg backdrop-blur-md top-2"
            : "w-full"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <span className="h-4 w-4 rounded-full border-[1.5px] border-current" />
          </div>
          <div className="hidden sm:block">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              QueueLess
            </p>
          </div>
        </div>

        {/* Navigation / Expanding Search Bar */}
        <nav className="relative flex items-center justify-center md:w-[600px]">
          <div
            className={`flex items-center gap-2 transition-all duration-300 ease-in-out ${
              isSearchOpen
                ? "w-0 opacity-0 pointer-events-none -translate-x-4"
                : "w-auto opacity-100 translate-x-0"
            }`}
          >
            {["Browse", "Cart"].map((item) => (
              <Button
                key={item}
                variant="ghost"
                className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-foreground hover:bg-secondary"
                onClick={() => {
                  if (item === "Browse") window.location.href = "/";
                  
                }}
              >
                <span className="w-0 -translate-x-2 opacity-0 overflow-hidden transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100 flex items-center shrink-0">
                  {navIcons[item]}
                </span>
                <span>{item}</span>
              </Button>
            ))}

            {/* US-006: Role-Based Navigation */}
            {(user?.role === "vendor" || user?.role === "student_vendor") && (
              <Button
                variant="ghost"
                onClick={() => (window.location.href = "/vendor")}
                className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              >
                <span className="w-0 -translate-x-2 opacity-0 overflow-hidden transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100 flex items-center shrink-0">
                  {navIcons["Vendor"]}
                </span>
                <span>Vendor Portal</span>
              </Button>
            )}

            {user?.role === "admin" && (
              <Button
                variant="ghost"
                onClick={() => (window.location.href = "/admin")}
                className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                <span className="w-0 -translate-x-2 opacity-0 overflow-hidden transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100 flex items-center shrink-0">
                  {navIcons["Admin"]}
                </span>
                <span>Admin Panel</span>
              </Button>
            )}

            {/* Search Trigger Button */}
            <Button
              variant="ghost"
              onClick={() => setIsSearchOpen(true)}
              className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-foreground hover:bg-secondary"
            >
              <span className="w-0 -translate-x-2 opacity-0 overflow-hidden transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100 flex items-center shrink-0">
                <Search className="h-4 w-4" />
              </span>
              <span>Search</span>
            </Button>
          </div>

          <div
            className={`absolute inset-0 flex items-center transition-all duration-300 ease-in-out ${
              isSearchOpen
                ? "w-full opacity-100 translate-x-0"
                : "w-0 opacity-0 pointer-events-none translate-x-4"
            }`}
          >
            <div className="relative flex w-full items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search products..."
                className="w-full rounded-full border border-border/80 bg-secondary/50 py-2 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="rounded-full border border-border/80 bg-background text-foreground md:hidden"
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full border border-border/80 bg-background text-foreground"
          >
            <ShoppingBag className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full border border-border/80 bg-background text-foreground"
          >
            <Bell className="h-4 w-4" />
          </Button>

          {/* Hide user session & logout button entirely when on /login page */}
          {!isLoginPage && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => (window.location.href = "/profile")}
                className="gap-2 rounded-full px-3 py-2 sm:px-4"
              >
                <UserCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {user?.fullName || username}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={logoutUser}
                title="Log out"
                className="rounded-full border border-border/80 text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 mt-4">{children}</div>
    </div>
  );
}