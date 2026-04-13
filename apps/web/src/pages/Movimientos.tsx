import { Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import ParsedTransactionsTable from "@/components/ParsedTransactionsTable";

export default function Movimientos() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="container py-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Movimientos</h2>
            <p className="text-muted-foreground text-sm">
              Inicia sesión para ver todos tus movimientos bancarios de los últimos 90 días.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Receipt className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
            <p className="text-muted-foreground">
              Todos los movimientos de tus cartolas — últimos 90 días
            </p>
          </div>
        </div>

        <ParsedTransactionsTable
          mode="movimientos"
          title="Movimientos"
          subtitle="Ingresos, egresos y saldos de tus cartolas bancarias"
        />
      </div>
    </div>
  );
}
