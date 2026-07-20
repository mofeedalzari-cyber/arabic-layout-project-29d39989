import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Wifi, Package, Upload, Users, Receipt,
  ScrollText, Settings, LogOut, Menu, Moon, Sun, Store, Inbox, CreditCard, Calculator, UserPlus,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface NavItem { to: string; label: string; icon: typeof Wifi; adminOnly?: boolean; agentOnly?: boolean }

const NAV: NavItem[] = [
  { to: "/app", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/app/networks", label: "الشبكات", icon: Wifi },
  { to: "/app/cabin", label: "كبينة البيع", icon: Store, agentOnly: true },
  { to: "/app/requests", label: "الطلبات", icon: Inbox },
  { to: "/app/join-requests", label: "طلبات الانضمام", icon: UserPlus, adminOnly: true },
  { to: "/app/packages", label: "الباقات", icon: Package, adminOnly: true },
  { to: "/app/sales", label: "المبيعات", icon: Receipt },
  { to: "/app/cards", label: "رفع الكروت", icon: Upload, adminOnly: true },
  { to: "/app/manage-cards", label: "إدارة الكروت", icon: CreditCard, adminOnly: true },
  { to: "/app/agents", label: "إدارة المناديب", icon: Users, adminOnly: true },
  { to: "/app/agent-accounts", label: "حسابات المناديب", icon: Calculator, adminOnly: true },
  { to: "/app/logs", label: "السجلات", icon: ScrollText, adminOnly: true },
  { to: "/app/settings", label: "الإعدادات", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const items = NAV.filter((n) => (!n.adminOnly || role === "admin") && (!n.agentOnly || role === "agent"));
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    const saved = localStorage.getItem("theme") === "dark";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);

  // Auto-close sidebars on route change
  useEffect(() => {
    setSidebarOpen(false);
    setMobileOpen(false);
  }, [loc.pathname]);

  function toggleTheme() {
    const next = !dark; setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <div className="h-dvh max-h-dvh flex bg-background w-full max-w-full overflow-hidden" dir="rtl">

      {/* Desktop sidebar (toggleable) */}
      {sidebarOpen && (
        <aside
          className="hidden lg:flex w-64 shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <BrandHeader />
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {items.map((it) => <NavLink key={it.to} item={it} />)}
          </nav>
          <UserFooter username={profile?.username ?? ""} role={role} onSignOut={signOut} dark={dark} onToggleTheme={toggleTheme} />
        </aside>
      )}

      <div className="flex-1 flex h-full min-h-0 flex-col min-w-0 max-w-full overflow-hidden">
        {/* Top bar — يمتد خلف شريط الحالة على أندرويد ويستخدم safe-area-inset-top */}
        <header
          className="sticky top-0 z-40 shrink-0 bg-background/90 backdrop-blur border-b flex items-center justify-between"
          style={{
            paddingTop: "calc(env(safe-area-inset-top) + 12px)",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          <div className="flex w-full items-center justify-between h-14">
          <div className="flex items-center gap-2">
            {/* Desktop toggle */}
            <Button
              variant="ghost" size="icon" className="rounded-xl hidden lg:inline-flex"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="القائمة"
            >
              <Menu className="h-5 w-5" />
            </Button>
            {/* Mobile toggle */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl lg:hidden" aria-label="القائمة"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[85vw] max-w-sm p-0 bg-sidebar text-sidebar-foreground flex flex-col h-dvh"
                style={{
                  paddingTop: "max(env(safe-area-inset-top), 28px)",
                  paddingRight: "env(safe-area-inset-right)",
                }}
              >
                <VisuallyHidden>
                  <SheetTitle>القائمة الجانبية</SheetTitle>
                  <SheetDescription>روابط التنقل الرئيسية في التطبيق</SheetDescription>
                </VisuallyHidden>
                <BrandHeader />
                <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
                  {items.map((it) => <NavLink key={it.to} item={it} />)}
                </nav>
                <div className="shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
                  <UserFooter username={profile?.username ?? ""} role={role} onSignOut={signOut} dark={dark} onToggleTheme={toggleTheme} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="flex items-center gap-2 font-bold">
            <div className="rounded-xl gradient-primary-bg p-1.5"><Wifi className="h-4 w-4" /></div>
            <span className="truncate">كروت الواي فاي</span>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={toggleTheme} aria-label="تبديل الوضع">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          </div>
        </header>

        <main
          className="flex-1 min-h-0 p-3 md:p-4 lg:p-6 max-w-full overflow-x-hidden overflow-y-auto smooth-scroll"
          style={{
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
            paddingBottom: "calc(7rem + env(safe-area-inset-bottom))",
            touchAction: "pan-y",
          }}
        >
          <div className="mx-auto max-w-6xl fade-in">{children}</div>
        </main>

        {/* Mobile bottom nav — يرتفع فوق أزرار النظام (Back / Home / Recents) */}
        <nav
          className="lg:hidden fixed inset-x-2 z-40 border bg-background/95 backdrop-blur rounded-2xl shadow-lg"
          style={{
            bottom: "max(env(safe-area-inset-bottom), 14px)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
            marginBottom: "6px",
          }}
        >
          <div className="grid grid-cols-4 h-16">
            {items.slice(0, 4).map((it) => <BottomLink key={it.to} item={it} />)}
          </div>
        </nav>

      </div>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
      <div className="rounded-2xl gradient-primary-bg p-2.5 shadow-soft">
        <Wifi className="h-5 w-5" />
      </div>
      <div>
        <div className="font-bold text-sm leading-tight">كروت الواي فاي</div>
        <div className="text-[11px] text-muted-foreground">إدارة وبيع</div>
      </div>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const loc = useLocation();
  const active = loc.pathname === item.to || (item.to !== "/app" && loc.pathname.startsWith(item.to));
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  );
}


function BottomLink({ item }: { item: NavItem }) {
  const loc = useLocation();
  const active = loc.pathname === item.to || (item.to !== "/app" && loc.pathname.startsWith(item.to));
  const Icon = item.icon;
  return (
    <Link to={item.to} className={cn(
      "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground"
    )}>
      <Icon className={cn("h-5 w-5", active && "scale-110")} />
      <span>{item.label}</span>
    </Link>
  );
}

function UserFooter({ username, role, onSignOut, dark, onToggleTheme }: {
  username: string; role: string | null; onSignOut: () => void; dark: boolean; onToggleTheme: () => void;
}) {
  return (
    <div className="p-3 border-t border-sidebar-border space-y-2">
      <div className="flex items-center gap-3 p-2 rounded-xl bg-sidebar-accent/40">
        <div className="h-9 w-9 rounded-full gradient-primary-bg flex items-center justify-center font-bold text-sm">
          {username.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{username || "—"}</div>
          <div className="text-[11px] text-muted-foreground">{role === "admin" ? "مدير" : "وكيل"}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={onToggleTheme}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={onSignOut}>
          <LogOut className="h-4 w-4 ml-1" />خروج
        </Button>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div dir="rtl" className="flex items-start justify-between gap-4 mb-6 text-right">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
