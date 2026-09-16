import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { LayoutDashboard, ReceiptText, Users } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-require-auth";

const TABS = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Refunds", href: "/admin/refunds", icon: ReceiptText },
  { label: "Users", href: "/admin/users", icon: Users },
];

export function AdminShell({ children }: { children: ReactNode }) {
  useRequireAuth(["admin"]);
  const [location, setLocation] = useLocation();

  return (
    <main className="mx-auto w-full max-w-[1300px] px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-600">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] text-foreground sm:text-4xl">
          Control panel
        </h1>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {TABS.map(({ label, href, icon: Icon }) => {
          const active = location === href;
          return (
            <button
              key={href}
              type="button"
              onClick={() => setLocation(href)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      {children}
    </main>
  );
}
