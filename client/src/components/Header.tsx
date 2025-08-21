import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Wallet } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
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
import NotificationCenter from "@/components/NotificationCenter";

export default function Header() {
  const [location] = useLocation();
  const { isAuthenticated, user, loginWithRedirect, logout } = useAuth0();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!user) return "U";
    if (user.given_name && user.family_name) {
      return `${user.given_name.charAt(0)}${user.family_name.charAt(0)}`;
    }
    if (user.name) {
      return user.name.charAt(0).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  const navigation = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Expenses", href: "/expenses" },
    { name: "Bill Split", href: "/bill-split" },
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
                <NotificationCenter />
                <Button variant="outline" onClick={() => window.location.href = '/'}>Connect Account</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Avatar>
                      <AvatarFallback>{getInitials()}</AvatarFallback>
                    </Avatar>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => window.location.href = '/profile'}>
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout}>
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button onClick={() => loginWithRedirect()}>Sign In</Button>
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
                    <button
                      key={item.name}
                      className={`font-medium text-left ${
                        location === item.href
                          ? "text-primary"
                          : "text-neutral-600"
                      }`}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        window.location.href = item.href;
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                  {isAuthenticated ? (
                    <>
                      <button
                        className="font-medium text-neutral-600 text-left"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          window.location.href = '/profile';
                        }}
                      >
                        Profile
                      </button>
                      <Button variant="outline" onClick={handleLogout}>
                        Logout
                      </Button>
                    </>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setMobileMenuOpen(false);
                        loginWithRedirect();
                      }}
                    >
                      Sign In
                    </Button>
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
