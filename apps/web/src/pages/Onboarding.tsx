import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import ProgressIndicator from "@/components/ProgressIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DemoOpenBanking from "@/components/DemoOpenBanking";
import PDOverview from "@/components/PDOverview";
import CreditScoreCard from "@/components/CreditScoreCard";
import InsuranceRiskCard from "@/components/InsuranceRiskCard";
import FinancialGoalsCard from "@/components/FinancialGoalsCard";
import Products from "@/pages/Products";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const [active, setActive] = useState<1 | 2 | 3 | 4>(1);
  const [demoConnected, setDemoConnected] = useState(false);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const isConnected = demoConnected;

  useEffect(() => {
    if (isConnected && active === 1) setActive(2);
  }, [isConnected, active]);

  const steps = [
    { id: 1, label: "Conectar", state: isConnected ? "done" : active === 1 ? "active" : "active" as const },
    { id: 2, label: "Analizar", state: active >= 2 ? "active" : "locked" as const },
    { id: 3, label: "Comparar", state: active >= 3 ? "active" : "locked" as const },
    { id: 4, label: "Planificar", state: active >= 4 ? "active" : "locked" as const },
  ];

  return (
    <div id="onboarding-section" className="mb-12">
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2 font-sans">Bienvenido a CODA</h2>
        <p className="text-gray-600 mb-6">
          Conecta tus cuentas, analiza tu riesgo de impago, compara productos y planifica tus metas.
        </p>

        <ProgressIndicator steps={steps as any} onSelect={(id) => setActive(id as any)} />

        {active === 1 && (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="md:col-span-2 lg:col-span-2">
              <CardContent className="p-6">
                <DemoOpenBanking onConnected={() => setDemoConnected(true)} />
              </CardContent>
            </Card>
            <Card className="opacity-60 pointer-events-none">
              <CardContent className="p-6">
                <div className="font-semibold">Otros bancos</div>
                <div className="text-sm text-muted-foreground">Conectores en sandbox próximamente.</div>
              </CardContent>
            </Card>
          </div>
        )}

        {active === 2 && (
          <div className="mt-6 space-y-6">
            <PDOverview />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CreditScoreCard />
              <InsuranceRiskCard />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setActive(1)}>Atrás</Button>
              <Button onClick={() => setActive(3)}>Siguiente: Comparar</Button>
            </div>
          </div>
        )}

        {active === 3 && (
          <div className="mt-6 space-y-6">
            <Products />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setActive(2)}>Atrás</Button>
              <Button onClick={() => setActive(4)}>Siguiente: Planificar</Button>
            </div>
          </div>
        )}

        {active === 4 && (
          <div className="mt-6 space-y-6">
            <FinancialGoalsCard />
            <div className="flex justify-start">
              <Button variant="outline" onClick={() => setActive(3)}>Atrás</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
