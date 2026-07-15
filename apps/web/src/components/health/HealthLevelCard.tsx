import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HealthLevel = -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;
type HealthSalida = "ahorro_inversion" | "refinanciamiento" | "reestructuracion" | "concursal";

interface HealthLevelCardProps {
  nivel: HealthLevel;
  nivelNombre: string;
  salida: HealthSalida;
  scoreCompuesto: number;
  descripcionNivel?: string;
}

const SEGMENTOS: { nivel: HealthLevel; label: string; color: string; textColor: string }[] = [
  { nivel: 5, label: "Independencia financiera", color: "bg-emerald-700", textColor: "text-white" },
  { nivel: 4, label: "Inversión diversificada", color: "bg-emerald-600", textColor: "text-white" },
  { nivel: 3, label: "Inversión inicial", color: "bg-emerald-500", textColor: "text-white" },
  { nivel: 2, label: "Fondo consolidado", color: "bg-green-400", textColor: "text-white" },
  { nivel: 1, label: "Fondo básico", color: "bg-yellow-400", textColor: "text-gray-900" },
  { nivel: 0, label: "Sin deudas", color: "bg-orange-400", textColor: "text-white" },
  { nivel: -1, label: "Endeudado", color: "bg-red-400", textColor: "text-white" },
  { nivel: -2, label: "Insolvencia activa", color: "bg-red-700", textColor: "text-white" },
];

const SALIDA_BADGE: Record<HealthSalida, { label: string; className: string }> = {
  ahorro_inversion: { label: "Ahorro e Inversión", className: "bg-emerald-100 text-emerald-800" },
  refinanciamiento: { label: "Refinanciamiento", className: "bg-yellow-100 text-yellow-800" },
  reestructuracion: { label: "Reestructuración", className: "bg-orange-100 text-orange-800" },
  concursal: { label: "Proceso Concursal", className: "bg-red-100 text-red-800" },
};

export default function HealthLevelCard({
  nivel,
  nivelNombre,
  salida,
  scoreCompuesto,
  descripcionNivel,
}: HealthLevelCardProps) {
  const badge = SALIDA_BADGE[salida];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Tu nivel de salud financiera</span>
          <Badge className={badge.className}>{badge.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6 items-start">
          {/* Termómetro vertical */}
          <div className="flex flex-col gap-0.5 w-8 flex-shrink-0">
            {SEGMENTOS.map((seg) => (
              <div
                key={seg.nivel}
                className={cn(
                  "rounded transition-all duration-300",
                  seg.color,
                  seg.nivel === nivel
                    ? "h-10 opacity-100 ring-2 ring-offset-1 ring-gray-400"
                    : "h-6 opacity-40",
                )}
              />
            ))}
          </div>

          {/* Información del nivel activo */}
          <div className="flex-1">
            <div className="mb-1 text-sm text-gray-500">
              Nivel {nivel > 0 ? `+${nivel}` : nivel}
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-2">{nivelNombre}</div>
            {descripcionNivel && (
              <p className="text-sm text-gray-600 leading-relaxed">{descripcionNivel}</p>
            )}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Score compuesto</span>
                <span>{scoreCompuesto}/100</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${scoreCompuesto}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
