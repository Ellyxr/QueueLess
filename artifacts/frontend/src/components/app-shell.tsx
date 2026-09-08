import { useState, useEffect, useRef, ReactNode } from "react";
import {
  Search,
  ShoppingBag,
  Bell,
  Inbox,
  UserCircle2,
  ShoppingCart,
  Compass,
  Menu,
  X,
  Store,
  Shield,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { User } from "@/types/auth";
import {
  AUTH_STATE_CHANGED_EVENT,
  PORTAL_CHANGED_EVENT,
  logoutUser,
  setActivePortal,
  type Portal,
} from "@/features/auth/api";
import { CART_CHANGED_EVENT, getCartItems } from "@/features/cart/cart";

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
  const [searchVal, setSearchVal] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [activePortal, setActivePortalState] = useState<Portal>("buyer");
  const [isLoginPage, setIsLoginPage] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(() =>
    getCartItems().reduce((sum, item) => sum + item.quantity, 0),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncAuthState = () => {
      setIsLoginPage(window.location.pathname === "/login");
      const storedUser = localStorage.getItem("user");
      try {
        setUser(storedUser ? JSON.parse(storedUser) : null);
      } catch (e) {
        console.error("Failed to parse user session", e);
        setUser(null);
      }

      const storedPortal = localStorage.getItem("active-portal");
      setActivePortalState(storedPortal === "vendor" ? "vendor" : "buyer");

      const params = new URLSearchParams(window.location.search);
      setSearchVal(params.get("search") || "");
    };

    syncAuthState();
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);
    window.addEventListener(PORTAL_CHANGED_EVENT, syncAuthState);
    window.addEventListener("popstate", syncAuthState);
    const syncCart = () =>
      setCartCount(
        getCartItems().reduce((sum, item) => sum + item.quantity, 0),
      );
    window.addEventListener(CART_CHANGED_EVENT, syncCart);
    return () => {
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);
      window.removeEventListener(PORTAL_CHANGED_EVENT, syncAuthState);
      window.removeEventListener("popstate", syncAuthState);
      window.removeEventListener(CART_CHANGED_EVENT, syncCart);
    };
  }, []);

  const isExternalVendor = user?.role === "vendor";
  const isStudentVendor = user?.role === "student_vendor";
  const isVendorPortal =
    isExternalVendor || (isStudentVendor && activePortal === "vendor");
  const showCartBadge =
    !isLoginPage &&
    user !== null &&
    Boolean(localStorage.getItem("token")) &&
    cartCount > 0;

  const switchPortal = (portal: Portal) => {
    setActivePortal(portal);
    window.location.href = portal === "vendor" ? "/vendor" : "/";
  };

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

  // US-011: Handle dynamic URL updates on Search
  const handleSearchChange = (value: string) => {
    setSearchVal(value);
    const url = new URL(window.location.href);
    if (value.trim()) {
      url.searchParams.set("search", value);
    } else {
      url.searchParams.delete("search");
    }
    window.history.replaceState({}, "", url.toString());

    // Trigger custom event so page listens to instant input updates
    window.dispatchEvent(new Event("popstate"));
  };

  return (
    <div className="foundation-noise relative min-h-[100dvh] bg-background">
      <div className="foundation-grid pointer-events-none absolute inset-x-0 top-0 h-[620px] opacity-80" />

      <div
        ref={sentinelRef}
        className="absolute top-0 h-4 w-full pointer-events-none"
      />

      <header
        className={`sticky top-0 z-50 border border-border/80 bg-card/80 px-3 py-3 transition-all duration-300 ease-in-out sm:px-4 ${
          isScrolled
            ? "mx-auto top-2 w-[90%] rounded-[28px] shadow-lg backdrop-blur-md"
            : "w-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => (window.location.href = "/")}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground">
              <img src="/favicon.svg" alt="logo" />
            </div>
            <div className="hidden sm:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                QueueLess
              </p>
            </div>
          </div>

          <nav className="relative hidden items-center justify-center md:flex md:w-[600px]">
            <div
              className={`flex items-center gap-2 transition-all duration-300 ease-in-out ${
                isSearchOpen
                  ? "pointer-events-none w-0 translate-x-4 opacity-0"
                  : "w-auto translate-x-0 opacity-100"
              }`}
            >
              {isVendorPortal ? (
                [
                  {
                    label: "Home",
                    icon: navIcons["Browse"],
                    onClick: () => (window.location.href = "/"),
                  },
                  { label: "Store", icon: <Store className="h-4 w-4" /> },
                  {
                    label: "Transactions",
                    icon: <ShoppingBag className="h-4 w-4" />,
                  },
                  { label: "Inbox", icon: <Inbox className="h-4 w-4" /> },
                  
                  
                  {
                    label: "Profile",
                    icon: <UserCircle2 className="h-4 w-4" />,
                    onClick: () => (window.location.href = "/profile"),
                  },
                ].map(({ label, icon, onClick }) => (
                  <Button
                    key={label}
                    variant="ghost"
                    onClick={onClick}
                    className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-foreground hover:bg-secondary"
                  >
                    <span className="flex w-0 shrink-0 -translate-x-2 items-center overflow-hidden opacity-0 transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100">
                      {icon}
                    </span>
                    <span>{label}</span>
                  </Button>
                ))
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => (window.location.href = "/")}
                    className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-foreground hover:bg-secondary"
                  >
                    <span className="flex w-0 shrink-0 -translate-x-2 items-center overflow-hidden opacity-0 transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100">
                      {navIcons["Browse"]}
                    </span>
                    <span>Browse</span>
                  </Button>

                  <Button
                    data-cart-target
                    variant="ghost"
                    onClick={() => (window.location.href = "/cart")}
                    className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-foreground hover:bg-secondary"
                  >
                    <span className="flex w-0 shrink-0 -translate-x-2 items-center overflow-hidden opacity-0 transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100">
                      {navIcons["Cart"]}
                    </span>
                    <span className="relative">
                      Cart
                      {showCartBadge && (
                        <span className="absolute -right-4 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                          {cartCount > 9 ? "9+" : cartCount}
                        </span>
                      )}
                    </span>
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => setIsSearchOpen(true)}
                    className="group flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-foreground hover:bg-secondary"
                  >
                    <span className="flex w-0 shrink-0 -translate-x-2 items-center overflow-hidden opacity-0 transition-all duration-300 ease-in-out group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100">
                      <Search className="h-4 w-4" />
                    </span>
                    <span>Search</span>
                  </Button>
                </>
              )}
            </div>

            <div
              className={`absolute left-1/2 top-1/2 flex w-[80%] -translate-x-1/2 -translate-y-1/2 items-center transition-all duration-300 ease-out will-change-[transform,opacity] ${
                isSearchOpen
                  ? "pointer-events-auto opacity-100 scale-100"
                  : "pointer-events-none opacity-0 scale-95"
              }`}
            >
              <div className="relative flex w-full items-center">
                <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchVal}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search products..."
                  className="w-full rounded-full border border-border/80 bg-secondary/50 py-2 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => {
                    handleSearchChange("");
                    setIsSearchOpen(false);
                  }}
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

            {isExternalVendor && (
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

            {isStudentVendor && (
              <Button
                variant="ghost"
                onClick={() =>
                  switchPortal(isVendorPortal ? "buyer" : "vendor")
                }
                className="rounded-full px-4 py-2 font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              >
                {isVendorPortal ? "Buyer Portal" : "Vendor Portal"}
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

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              className="rounded-full border border-border/80 bg-background text-foreground md:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="h-4 w-4" />
            </Button>

            <div className="hidden items-center gap-2 md:flex">
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

            <div className="flex items-center gap-2 md:hidden">
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
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="mt-3 space-y-2 border-t border-border/80 pt-3 md:hidden">
            {(isVendorPortal
              ? [
                  { label: "Home", icon: Compass },
                  { label: "Store", icon: Store },
                  { label: "Transactions", icon: ShoppingBag },
                  { label: "Inbox", icon: Inbox },
                  { label: "Profile", icon: UserCircle2 },
                ]
              : [
                  { label: "Browse", icon: Compass },
                  { label: "Cart", icon: ShoppingCart },
                  { label: "Search", icon: Search },
                ]
            ).map(({ label, icon: Icon }) => (
              <Button
                key={label}
                variant="ghost"
                onClick={() => {
                  if (label === "Search") {
                    setIsSearchOpen(true);
                  } else if (label === "Cart") {
                    window.location.href = "/cart";
                  } else if (label === "Browse" || label === "Home") {
                    window.location.href = "/";
                  } else if (label === "Profile") {
                    window.location.href = "/profile";
                  }
                  setIsMobileMenuOpen(false);
                }}
                className="flex w-full items-center justify-start gap-2 rounded-full px-3 py-2 text-left font-medium"
              >
                <Icon className="h-4 w-4" />
                <span className="relative">
                  {label}
                  {label === "Cart" && showCartBadge && (
                    <span className="absolute -right-5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {cartCount > 9 ? "9+" : cartCount}
                    </span>
                  )}
                </span>
              </Button>
            ))}

            {isLoggedIn ? (
              <Button
                variant="secondary"
                onClick={() => (window.location.href = "/profile")}
                className="flex w-full items-center justify-start gap-2 rounded-full px-3 py-2"
              >
                <UserCircle2 className="h-4 w-4" />
                {username}
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={() => (window.location.href = "/login")}
                className="w-full rounded-full px-4 py-2"
              >
                Log In
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="relative z-10 mt-4">{children}</div>
    </div>
  );
}
