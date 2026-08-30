import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { checkIsAdmin } from "@/lib/admin.functions";
import { adminDashboard } from "@/lib/admin-dashboard.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Receipt,
  Package,
  Boxes,
  Palette,
  Bell,
  Search,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ScrollText,
  ExternalLink,
  RotateCcw,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
  head: () => ({
    meta: [
      { title: "Admin · RIOTOUS" },
      { name: "description", content: "RIOTOUS store administration." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const NAV: Array<{
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}> = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Orders", icon: Receipt },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/inventory", label: "Inventory", icon: Boxes },
  { to: "/admin/returns", label: "Returns", icon: RotateCcw },
  { to: "/admin/reviews", label: "Reviews", icon: Star },
  { to: "/admin/designs", label: "Custom designs", icon: Palette },
  { to: "/admin/activity", label: "Activity log", icon: ScrollText },
];

function AdminLayout() {
  const { user } = useRouteContext({ from: "/_authenticated" }) as {
    user: { id: string; email: string; role?: string };
  };
  const isAdminFn = useServerFn(checkIsAdmin);
  const dashFn = useServerFn(adminDashboard);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [term, setTerm] = useState("");

  const roleQ = useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: () => isAdminFn(),
    staleTime: 0,
    retry: 1,
  });
  const dashQ = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => dashFn(),
    enabled: !!roleQ.data,
    refetchInterval: 60_000,
  });

  const { signOut: authSignOut } = useAuth();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await authSignOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  if (roleQ.isLoading) {
    return (
      <div className="container py-32 text-center text-muted-foreground">Checking access…</div>
    );
  }
  if (roleQ.isError) {
    return (
      <div className="container py-32 text-center">
        <h1 className="text-3xl font-bold">Could not verify access</h1>
        <p className="mt-2 text-muted-foreground">
          Your administrator access could not be checked. Please try again.
        </p>
        <Button className="mt-6" onClick={() => roleQ.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (roleQ.data === false) {
    return (
      <div className="container py-32 text-center">
        <h1 className="text-3xl font-bold">Access denied</h1>
        <p className="mt-2 text-muted-foreground">
          You must be an administrator to view this area.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Back to store</Link>
        </Button>
      </div>
    );
  }

  const notifications = dashQ.data?.notifications ?? [];

  const sidebar = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to as "/admin"}
          activeOptions={item.exact ? { exact: true } : undefined}
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          activeProps={{ className: "bg-brand-red text-white hover:bg-brand-red hover:text-white" }}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
      <Link
        to="/"
        className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <ExternalLink className="h-4 w-4" /> View storefront
      </Link>
    </nav>
  );

  return (
    <div className="min-h-screen pt-16 md:pt-20">
      <div className="mx-auto flex max-w-[1600px]">
        {/* Sidebar */}
        <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-60 shrink-0 overflow-y-auto border-r bg-card/40 md:block">
          <div className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-brand-red" /> Admin
          </div>
          {sidebar}
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-[70] md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-background">
              <div className="flex items-center justify-between px-4 py-4">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-brand-red" /> Admin
                </span>
                <button aria-label="Close" onClick={() => setSidebarOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              {sidebar}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <div className="sticky top-16 z-40 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur md:top-20">
            <button className="md:hidden" aria-label="Menu" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <form
              className="relative flex-1 max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                if (!term.trim()) return;
                navigate({ to: "/admin/orders", search: { q: term.trim() } });
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search orders, customers…"
                className="h-9 pl-9"
              />
            </form>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-semibold text-white">
                      {notifications.length}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    Nothing needs your attention.
                  </div>
                ) : (
                  notifications.slice(0, 12).map((n, i) => (
                    <DropdownMenuItem key={i} className="flex-col items-start gap-0.5">
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.detail}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white"
                  aria-label="Admin profile"
                >
                  A
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Administrator</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/account/orders" })}>
                  My account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <main className="px-4 py-6 md:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
