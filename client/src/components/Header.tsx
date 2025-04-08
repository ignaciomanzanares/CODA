import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Wallet } from "lucide-react";
import { useAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export default function Header() {
  const [location] = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!user) return "U";
    if (user.firstName && user.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
    }
    return user.username.charAt(0).toUpperCase();
  };

  const navigation = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Products", href: "/products" },
    { name: "Goals", href: "/goals" },
    { name: "Plan", href: "/plan" },
  ];

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center">
            <Wallet className="text-primary-dark mr-2" />
            <Link href="/">
              <h1 className="text-xl font-bold text-neutral-dark font-sans cursor-pointer">
                FinHealth
              </h1>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            {navigation.map((item) => (
              <Link key={item.name} href={item.href}>
                <a
                  className={`font-medium ${
                    location === item.href
                      ? "text-primary"
                      : "text-neutral-600 hover:text-primary"
                  }`}
                >
                  {item.name}
                </a>
              </Link>
            ))}
          </nav>

          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <Link href="/">
                  <Button variant="outline">Connect Account</Button>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Avatar>
                      <AvatarFallback>{getInitials()}</AvatarFallback>
                    </Avatar>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Link href="/profile">Profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout}>
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Link href="/dashboard">
                <Button>Sign In</Button>
              </Link>
            )}

            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <div className="flex flex-col space-y-4 mt-8">
                  {navigation.map((item) => (
                    <Link key={item.name} href={item.href}>
                      <a
                        className={`font-medium ${
                          location === item.href
                            ? "text-primary"
                            : "text-neutral-600"
                        }`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.name}
                      </a>
                    </Link>
                  ))}
                  {isAuthenticated ? (
                    <>
                      <Link href="/profile">
                        <a
                          className="font-medium text-neutral-600"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Profile
                        </a>
                      </Link>
                      <Button variant="outline" onClick={handleLogout}>
                        Logout
                      </Button>
                    </>
                  ) : (
                    <Link href="/dashboard">
                      <Button 
                        className="w-full" 
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Sign In
                      </Button>
                    </Link>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
