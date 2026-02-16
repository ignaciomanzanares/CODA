import { Link, useLocation } from "wouter";
import { Building2, LayoutDashboard, Building, Receipt, GitMerge, FileText, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/empresas/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/empresas/companies", label: "Empresas", icon: Building },
  { href: "/empresas/transactions", label: "Transacciones", icon: Receipt },
  { href: "/empresas/reconciliation", label: "Reconciliación", icon: GitMerge },
  { href: "/empresas/statements", label: "Estados financieros", icon: FileText },
  { href: "/empresas/risk", label: "Riesgo", icon: Shield },
];

export default function EmpresasLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">CODA Empresas</h1>
          <p className="text-sm text-muted-foreground">Gestión financiera para empresas</p>
        </div>
      </div>
      <nav className="flex flex-wrap gap-2">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <a
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                location.startsWith(href)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </a>
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}
