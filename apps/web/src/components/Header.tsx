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
  Shield
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import type { CurrencyCode } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/movimientos", label: "Movimientos", icon: Receipt },
  { href: "/expenses", label: "Gastos", icon: Receipt },
  { href: "/bill-split", label: "Dividir cuenta", icon: Users },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/plan", label: "Plan", icon: FileText },
];

const empresasNavItems = [
  { href: "/empresas/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/empresas/companies", label: "Empresas", icon: Building },
  { href: "/empresas/transactions", label: "Transacciones", icon: Receipt },
  { href: "/empresas/reconciliation", label: "Reconciliación", icon: GitMerge },
  { href: "/empresas/statements", label: "Estados financieros", icon: FileText },
  { href: "/empresas/documents", label: "DTE", icon: FileText },
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
    setLocation(isEmpresas ? "/empresas/login" : "/login");
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
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full max-w-screen-2xl mx-auto flex h-16 items-center justify-between gap-6 px-4 sm:px-6">
        {/* Izquierda: CODA (logo) siempre igual; en Empresas enlaza al dashboard empresas */}
        <div className="flex shrink-0 items-center">
          <Link
            href={isEmpresas ? "/empresas/dashboard" : "/"}
            className="flex items-center gap-2 font-semibold"
          >
            <div className="rounded-lg bg-primary p-1.5">
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg hidden sm:inline">{isEmpresas ? "CODA Empresas" : "CODA"}</span>
          </Link>
        </div>

        {/* Centro: navegación Personal o Empresas (cuando autenticado) */}
        {isAuthenticated && (
          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center max-w-3xl">
            {(isEmpresas ? empresasNavItems : navItems).map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Derecha: moneda, CODA Empresas, notificaciones, usuario */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Selector de moneda (solo etiqueta CLP $ / USD $, sin conversión) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                {currency === "CLP" ? "CLP $" : "USD $"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setCurrency("CLP" as CurrencyCode)}>Pesos (CLP)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrency("USD" as CurrencyCode)}>Dólares (USD)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* En Empresas: enlace a CODA Personal; en Personal: enlace a CODA Empresas */}
          {isEmpresas ? (
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="hidden md:flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                <span>CODA Personal</span>
              </Button>
            </Link>
          ) : (
            <Link href="/empresas">
              <Button variant="outline" size="sm" className="hidden md:flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>CODA Empresas</span>
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
                    <DropdownMenuItem onClick={() => setLocation('/profile')}>
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
            <Button onClick={() => setLocation(isEmpresas ? "/empresas/login" : "/login")}>Iniciar sesión</Button>
          )}

          {/* Mobile Menu Button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="flex flex-col mt-8">
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
                            "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors text-left",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setLocation(item.href);
                          }}
                        >
                          <Icon className="h-4 w-4" />
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
                        className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground text-left"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation('/profile');
                        }}
                      >
                        <User className="h-4 w-4" />
                        Perfil
                      </button>
                      <button
                        className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground text-left"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleLogout();
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        Cerrar sesión
                      </button>
                    </div>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLocation(isEmpresas ? "/empresas/login" : "/login");
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
