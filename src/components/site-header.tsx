import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  Search,
  User,
  X,
  LogOut,
  Package,
  Heart,
  RotateCcw,
  ShieldCheck,
  Star,
} from "lucide-react";
import { CartDrawer } from "./cart-drawer";
import { useCartStore } from "@/stores/cart-store";
import { useAuth } from "@/hooks/use-auth";
import { isAdminEmail } from "@/lib/auth";
import { BrandName } from "@/components/brand-name";
import riotousLogo from "@/assets/riotous-logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const nav = [
  { to: "/shop", label: "Shop" },
  { to: "/design", label: "Design Your Own" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin" || isAdminEmail(user?.email);
  useCartStore((s) => s.items.length); // subscribe so header re-renders

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 30);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  async function handleSignOut() {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  }

  const initials =
    (user?.user_metadata?.full_name as string | undefined)?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "U";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 flex justify-center pointer-events-none transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          scrolled
            ? "pt-3 px-3 sm:px-4 bg-transparent pb-0"
            : "pt-0 px-0 bg-gradient-to-b from-black/90 via-black/60 to-transparent pb-8"
        }`}
      >
        <div
          className={`pointer-events-auto flex items-center justify-between border-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            scrolled
              ? "h-[50px] md:h-12 w-auto max-w-[96vw] md:max-w-5xl rounded-full bg-black/80 px-3 md:px-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150 gap-2 md:gap-6"
              : "h-[72px] md:h-20 w-full max-w-[1400px] rounded-none bg-transparent px-6 md:px-10 gap-4"
          }`}
        >
          <button
            className="flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-brand-red hover:text-white md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/" className="flex shrink-0 items-center" aria-label="RIOTOUS home">
            <img
              src={riotousLogo}
              alt="RIOTOUS"
              className={`shrink-0 object-contain transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                scrolled ? "w-[115px] h-auto md:w-auto md:h-7" : "w-[145px] h-auto md:w-auto md:h-9"
              }`}
              draggable={false}
            />
          </Link>

          <nav
            className={`hidden items-center md:flex transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${scrolled ? "gap-1" : "gap-6"}`}
          >
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-white/90 transition-all duration-300 hover:bg-brand-red hover:text-white"
                activeProps={{ className: "bg-brand-red text-white" }}
              >
                {scrolled && n.label === "Design Your Own" ? "Design" : n.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 transition-all duration-300">
            <Link
              to="/shop"
              className="hidden h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-brand-red hover:text-white md:flex"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </Link>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white transition-opacity duration-200 hover:opacity-90"
                    aria-label="Account"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/account/orders" })}
                    className="cursor-pointer"
                  >
                    <Package className="mr-2 h-4 w-4" />
                    My orders
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/account/favorites" })}
                    className="cursor-pointer"
                  >
                    <Heart className="mr-2 h-4 w-4" />
                    Favorites
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/account/reviews" })}
                    className="cursor-pointer"
                  >
                    <Star className="mr-2 h-4 w-4" />
                    My reviews
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/account/returns" })}
                    className="cursor-pointer"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Returns & support
                  </DropdownMenuItem>

                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => navigate({ to: "/admin" })}
                        className="cursor-pointer"
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Admin panel
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                to="/auth"
                className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-brand-red hover:text-white"
                aria-label="Sign in"
              >
                <User className="h-5 w-5" />
              </Link>
            )}
            <CartDrawer />
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] bg-background md:hidden animate-in fade-in duration-200">
          <div className="flex h-16 items-center justify-between px-6">
            <BrandName className="text-xl font-black tracking-[0.2em]" />
            <button
              onClick={() => setMobileOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-brand-red hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-6 pt-4 overflow-y-auto max-h-[calc(100vh-80px)]">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMobileOpen(false)}
                className="border-b border-border/60 py-4 text-2xl font-semibold tracking-tight transition-colors hover:text-brand-red"
              >
                {n.label}
              </Link>
            ))}

            <div className="pt-6 pb-12 border-t border-border mt-4 flex flex-col gap-3">
              {user ? (
                <>
                  <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5 mb-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white">
                      {initials}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-semibold truncate text-white">{user.email}</p>
                      <p className="text-xs text-white/60">Signed in account</p>
                    </div>
                  </div>
                  <Link
                    to="/account/orders"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 py-3 px-3 rounded-lg text-lg font-medium text-white/90 hover:bg-white/5"
                  >
                    <Package className="h-5 w-5 text-brand-red" />
                    My orders
                  </Link>
                  <Link
                    to="/account/favorites"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 py-3 px-3 rounded-lg text-lg font-medium text-white/90 hover:bg-white/5"
                  >
                    <Heart className="h-5 w-5 text-brand-red" />
                    Favorites
                  </Link>
                  <Link
                    to="/account/reviews"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 py-3 px-3 rounded-lg text-lg font-medium text-white/90 hover:bg-white/5"
                  >
                    <Star className="h-5 w-5 text-brand-red" />
                    My reviews
                  </Link>
                  <Link
                    to="/account/returns"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 py-3 px-3 rounded-lg text-lg font-medium text-white/90 hover:bg-white/5"
                  >
                    <RotateCcw className="h-5 w-5 text-brand-red" />
                    Returns & support
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 py-3 px-3 rounded-lg text-lg font-medium text-white/90 hover:bg-white/5"
                    >
                      <ShieldCheck className="h-5 w-5 text-brand-red" />
                      Admin panel
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      handleSignOut();
                    }}
                    className="mt-4 flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl bg-brand-red text-white font-semibold shadow-lg hover:bg-brand-red/90 transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl bg-brand-red text-white font-semibold shadow-lg hover:bg-brand-red/90 transition-colors text-lg"
                >
                  <User className="h-5 w-5" />
                  Sign In / Register
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
