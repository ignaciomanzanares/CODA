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
  Wallet
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/bill-split", label: "Bill Split", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/plan", label: "Plan", icon: FileText },
];

export default function Header() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!user) return "U";
    if (user.name) {
      const parts = user.name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
      }
      return user.name.charAt(0).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-semibold mr-8">
            <div className="rounded-lg bg-primary p-1.5">
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg hidden sm:inline">CODA</span>
          </Link>

          {/* Desktop Navigation - only show when authenticated */}
          {isAuthenticated && (
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || location.startsWith(`${item.href}/`);
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-4">
          {isAuthenticated && user ? (
            <>
              <NotificationCenter />
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-medium">{user.name || user.email}</div>
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
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          ) : (
            <Button onClick={() => setLocation("/login")}>Sign In</Button>
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
                    {navItems.map((item) => {
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
                        Profile
                      </button>
                      <button
                        className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground text-left"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleLogout();
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLocation("/login");
                      }}
                    >
                      Sign In
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
