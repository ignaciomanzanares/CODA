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
  Activity
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import type { CurrencyCode } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

const navItems = [
  { href: ROUTES.panel, label: "Panel", icon: LayoutDashboard },
  { href: ROUTES.movimientos, label: "Movimientos", icon: Receipt },
  { href: ROUTES.conexiones, label: "Conexiones", icon: Link2 },
  { href: ROUTES.gastos, label: "Gastos", icon: Receipt },
  { href: ROUTES.dividirCuenta, label: "Dividir cuenta", icon: Users },
  { href: ROUTES.productos, label: "Productos", icon: Package },
  { href: ROUTES.metas, label: "Metas", icon: Target },
  { href: ROUTES.plan, label: "Plan", icon: FileText },
  // { href: "/audit", label: "Auditoría", icon: Activity }, // Hidden for now - will implement in future
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
  const { currency, setCurrency } = useCurrency();
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
    <header className="app-header sticky sticky-safe-top z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-x">
      <div className="w-full flex h-14 min-h-[3.5rem] flex-nowrap items-center gap-2 pl-2 pr-2 sm:pl-3 sm:pr-3">
        {/* Izquierda: CODA Empresas / CODA — lo más a la izquierda */}
        <div className="flex shrink-0 items-center min-w-0">
          <Link
            href={isEmpresas ? "/empresas/dashboard" : "/"}
            className="flex items-center gap-1.5 sm:gap-2 font-semibold"
          >
            <div className="rounded-lg bg-primary p-1.5 shrink-0">
              <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
            </div>
            <span className="text-base sm:text-lg truncate hidden sm:inline">{isEmpresas ? "CODA Empresas" : "CODA"}</span>
          </Link>
        </div>

        {/* Centro: navegación + moneda — centrado */}
        <div className="flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-2">
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
                      "flex items-center gap-1.5 px-2 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
          {/* Moneda: oculta en la landing (/) para una cabecera más limpia */}
          {location !== "/" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground shrink-0">
                  {currency === "CLP" ? "CLP $" : "USD $"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCurrency("CLP" as CurrencyCode)}>Pesos (CLP)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrency("USD" as CurrencyCode)}>Dólares (USD)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Derecha: CODA Personal/Empresas, notificaciones, usuario — lo más a la derecha */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          {isEmpresas ? (
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
          )}
          {isAuthenticated && user ? (
            <>
              <NotificationCenter />
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-medium">{displayName || user.email}</div>
                </div>
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
            <Button onClick={() => setLocation(isEmpresas ? "/empresas/login" : ROUTES.iniciarSesion)}>Iniciar sesión</Button>
          )}

          {/* Mobile Menu Button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="flex flex-col mt-6">
                {/* Only show nav items when authenticated */}
                {isAuthenticated && (
                  <nav className="flex flex-col gap-1">
                    {(isEmpresas ? empresasNavItems : navItems).map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.href;
                      return (
                        <button
                          key={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-md transition-colors text-left min-h-[44px]",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setLocation(item.href);
                          }}
                        >
                          <Icon className="h-5 w-5" />
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                )}
                
                <div className={isAuthenticated ? "border-t mt-4 pt-4" : ""}>
                  {isAuthenticated ? (
                    <div className="flex flex-col gap-2">
                      <button
                        className="flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground text-left min-h-[44px]"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation(ROUTES.perfil);
                        }}
                      >
                        <User className="h-5 w-5" />
                        Perfil
                      </button>
                      <button
                        className="flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground text-left min-h-[44px]"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleLogout();
                        }}
                      >
                        <LogOut className="h-5 w-5" />
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
