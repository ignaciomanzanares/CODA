import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Menu,
  X,
  LayoutDashboard,
  Receipt,
  Users,
  Store,
  Package,
  Target,
  FileText,
  LogOut,
  User,
  Wallet,
  Building2,
  Building,
  GitMerge,
  Shield,
  Link2,
  ArrowLeftRight,
  Activity,
  HeartPulse,
  Landmark,
  Sun,
  Moon,
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { useTheme } from "@/lib/useTheme";
import { FEATURES } from "@/config/features";

const navItems = [
  { href: ROUTES.panel, label: "Panel", icon: LayoutDashboard },
  { href: ROUTES.saludFinanciera, label: "Salud financiera", icon: HeartPulse },
  { href: ROUTES.misActivos, label: "Mis activos", icon: Landmark },
  { href: ROUTES.productos, label: "Productos", icon: Store },
  { href: ROUTES.movimientos, label: "Movimientos", icon: ArrowLeftRight },
  { href: ROUTES.plan, label: "Plan", icon: FileText },
  { href: ROUTES.conexiones, label: "Conexiones", icon: Link2 },
];

const empresasNavItems = [
  { href: "/empresas/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/empresas/companies", label: "Empresas", icon: Building },
  { href: "/empresas/transactions", label: "Transacciones", icon: Receipt },
  { href: "/empresas/reconciliation", label: "Reconciliación", icon: GitMerge },
  { href: "/empresas/statements", label: "Estados financieros", icon: FileText },
  { href: "/empresas/documents", label: "DTE", icon: FileText },
  { href: "/empresas/purchase-orders", label: "OC", icon: FileText },
  { href: "/empresas/risk", label: "Riesgo", icon: Shield },
  { href: "/empresas/products", label: "Productos", icon: Package },
];

export default function Header() {
  const [location, setLocation] = useLocation();
  const isEmpresas = location.startsWith("/empresas");
  const authContext = isEmpresas ? 'empresas' : 'personal';
  const { isAuthenticated, user, logout } = useAuth(authContext);
  const { theme, toggle: toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout(authContext);
    setLocation(isEmpresas ? "/empresas/login" : ROUTES.iniciarSesion);
  };

  // Nombre para mostrar (normalizar "Investor" → "Inversor")
  const displayName = user?.name === 'Investor' ? 'Inversor' : (user?.name || user?.email || '');

  const getInitials = () => {
    if (!user) return "U";
    if (displayName) {
      const parts = displayName.split(' ');
      if (parts.length >= 2) {
        return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
      }
      return displayName.charAt(0).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  return (
    <header className="app-header sticky sticky-safe-top z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 safe-x">
      <div className="w-full flex h-14 min-h-[3.5rem] flex-nowrap items-center gap-2 px-3 sm:px-4">
        {/* Izquierda: CODA logo — siempre visible */}
        <div className="flex shrink-0 items-center min-w-0">
          <Link
            href={isEmpresas ? "/empresas/dashboard" : "/"}
            className="flex items-center gap-1.5 sm:gap-2 font-semibold"
          >
            <div className="rounded-lg bg-primary p-1.5 shrink-0">
              <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
            </div>
            <span className="text-base sm:text-lg truncate">{isEmpresas ? "CODA" : "CODA"}</span>
          </Link>
        </div>

        {/* Centro: navegación + moneda — centrado */}
        <div className="flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-2">
          {!isAuthenticated && (
            <nav className="hidden md:flex items-center gap-1 min-w-0 justify-center">
              <a
                href={location === "/" ? "#servicios" : "/#servicios"}
                className="px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors whitespace-nowrap"
              >
                Servicios
              </a>
            </nav>
          )}
          {isAuthenticated && (
            <nav className="hidden lg:flex items-center gap-0.5 min-w-0 justify-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(isEmpresas ? empresasNavItems : navItems).map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || location.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap shrink-0",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20 shadow-sm shadow-primary/5"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
          {/* Toggle claro/oscuro: solo en la app (logueado). La landing es un
              diseño fijo de marketing, así que ahí no se muestra. */}
          {isAuthenticated && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={toggleTheme}
              title={theme === "light" ? "Modo oscuro" : "Modo claro"}
            >
              {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {/* Derecha: CODA Personal/Empresas, notificaciones, usuario — lo más a la derecha */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          {FEATURES.codaEmpresas && (
            isEmpresas ? (
              <Link href={ROUTES.panel}>
                <Button variant="outline" size="sm" className="hidden md:flex items-center gap-1.5 shrink-0">
                  <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="xl:hidden">Personal</span>
                  <span className="hidden xl:inline">CODA Personal</span>
                </Button>
              </Link>
            ) : (
              <Link href="/empresas">
                <Button variant="outline" size="sm" className="hidden md:flex items-center gap-1.5 shrink-0">
                  <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="xl:hidden">Empresas</span>
                  <span className="hidden xl:inline">CODA Empresas</span>
                </Button>
              </Link>
            )
          )}
          {isAuthenticated && user ? (
            <>
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-medium">{displayName || user.email}</div>
                </div>
              </div>
              <NotificationCenter />
              <div className="hidden sm:flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {getInitials()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLocation(ROUTES.perfil)}>
                      <User className="h-4 w-4 mr-2" />
                      Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={() => setLocation(isEmpresas ? "/empresas/login" : ROUTES.iniciarSesion)}>Iniciar sesión</Button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="overflow-y-auto">
              <div className="flex flex-col mt-4">
                {/* User info on mobile */}
                {isAuthenticated && user && (
                  <div className="flex items-center gap-3 px-3 pb-4 mb-3 border-b border-border/60">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{displayName || user.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                )}

                {/* Nav items */}
                {isAuthenticated && (
                  <nav className="flex flex-col gap-0.5">
                    {(isEmpresas ? empresasNavItems : navItems).map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.href || location.startsWith(`${item.href}/`);
                      return (
                        <button
                          key={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl transition-colors text-left",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setLocation(item.href);
                          }}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                )}

                {/* Switch CODA Personal / Empresas */}
                {isAuthenticated && FEATURES.codaEmpresas && (
                  <div className="border-t border-border/60 mt-3 pt-3">
                    <button
                      className="flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground text-left w-full"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLocation(isEmpresas ? ROUTES.panel : "/empresas");
                      }}
                    >
                      {isEmpresas ? <Wallet className="h-5 w-5 shrink-0" /> : <Building2 className="h-5 w-5 shrink-0" />}
                      {isEmpresas ? "CODA Personal" : "CODA Empresas"}
                    </button>
                  </div>
                )}

                {/* Account actions */}
                <div className="border-t border-border/60 mt-3 pt-3">
                  {isAuthenticated ? (
                    <div className="flex flex-col gap-0.5">
                      <button
                        className="flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground text-left"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation(ROUTES.perfil);
                        }}
                      >
                        <User className="h-5 w-5 shrink-0" />
                        Configuración
                      </button>
                      <button
                        className="flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-left"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleLogout();
                        }}
                      >
                        <LogOut className="h-5 w-5 shrink-0" />
                        Cerrar sesión
                      </button>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLocation(isEmpresas ? "/empresas/login" : ROUTES.iniciarSesion);
                      }}
                    >
                      Iniciar sesión
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
