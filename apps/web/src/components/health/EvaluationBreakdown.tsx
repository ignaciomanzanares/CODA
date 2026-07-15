import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Ratios {
  deudaFlujo: number;
  deudaActivos: number;
  ahorroIngreso: number;
  moraActiva: boolean;
  diasMora: number;
}

interface EvaluationBreakdownProps {
  ratios: Ratios;
}

type Semaforo = "sano" | "alerta" | "critico";

const SEMAFORO_STYLES: Record<Semaforo, { dot: string; bg: string; text: string; label: string }> =
  {
    sano: {
      dot: "bg-emerald-500",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "Saludable",
    },
    alerta: { dot: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-700", label: "Alerta" },
    critico: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700", label: "Crítico" },
  };

function semaforoDeudaFlujo(ratio: number): Semaforo {
  if (ratio < 0.3) return "sano";
  if (ratio <= 0.5) return "alerta";
  return "critico";
}

function semaforoDeudaActivos(ratio: number): Semaforo {
  if (ratio < 0.4) return "sano";
  if (ratio <= 0.8) return "alerta";
  return "critico";
}

function semaforoAhorro(ratio: number): Semaforo {
  if (ratio >= 0.2) return "sano";
  if (ratio >= 0.1) return "alerta";
  return "critico";
}

function semaforoMora(activa: boolean, dias: number): Semaforo {
  if (!activa) return "sano";
  if (dias <= 30) return "alerta";
  return "critico";
}

interface IndicadorProps {
  label: string;
  valor: string;
  descripcion: string;
  semaforo: Semaforo;
}

function Indicador({ label, valor, descripcion, semaforo }: IndicadorProps) {
  const s = SEMAFORO_STYLES[semaforo];
  return (
    <div className={cn("rounded-lg p-3", s.bg)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2 h-2 rounded-full", s.dot)} />
          <span className={cn("text-xs font-medium", s.text)}>{s.label}</span>
        </div>
      </div>
      <div className="text-lg font-bold text-gray-900">{valor}</div>
      <div className="text-xs text-gray-500 mt-0.5">{descripcion}</div>
    </div>
  );
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export default function EvaluationBreakdown({ ratios }: EvaluationBreakdownProps) {
  // Defensa: aunque el tipo lo marca requerido, una evaluación del backend sin
  // `ratios` haría crashear el destructuring (error boundary). Si falta, no se
  // renderiza el desglose en vez de tumbar toda la página.
  if (!ratios) return null;
  const { deudaFlujo, deudaActivos, ahorroIngreso, moraActiva, diasMora } = ratios;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Detalle de variables financieras</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Indicador
          label="Deuda / Flujo mensual"
          valor={pct(deudaFlujo)}
          descripcion="Cuota mensual de deuda vs ingreso. Saludable: <30%"
          semaforo={semaforoDeudaFlujo(deudaFlujo)}
        />
        <Indicador
          label="Deuda / Activos"
          valor={pct(Math.min(deudaActivos, 1))}
          descripcion="Deuda total vs activos declarados. Saludable: <40%"
          semaforo={semaforoDeudaActivos(deudaActivos)}
        />
        <Indicador
          label="Ahorro / Ingreso"
          valor={ahorroIngreso < 0 ? `−${pct(Math.abs(ahorroIngreso))}` : pct(ahorroIngreso)}
          descripcion="Tasa de ahorro mensual. Saludable: >20%"
          semaforo={semaforoAhorro(ahorroIngreso)}
        />
        <Indicador
          label="Mora activa"
          valor={moraActiva ? `${diasMora} días` : "Sin mora"}
          descripcion="Días de atraso en el informe CMF. Saludable: sin atraso"
          semaforo={semaforoMora(moraActiva, diasMora)}
        />
      </CardContent>
    </Card>
  );
}
