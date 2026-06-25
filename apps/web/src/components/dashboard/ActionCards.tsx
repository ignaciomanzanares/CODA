// ─── Action Cards ─────────────────────────────────────────────────────────────
// Contextual financial recommendations that bridge the dashboard → marketplace.
// Each card is generated from real user data and links to a specific product
// category or action. This is the primary revenue conversion path.

import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  PiggyBank,
  TrendingDown,
  Banknote,
  Shield,
  CreditCard,
  TrendingUp,
  Wallet,
  Repeat2,
  ListChecks,
} from "lucide-react";
import type { DashboardData, CategoryGroup } from "@/types/dashboard";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
	  }).format(n);

const TRANSFER_SUBCATEGORIES = new Set([
  "transferencia_enviada",
  "transferencias_enviadas",
  "Transferencias enviadas",
]);

function transferShare(group: CategoryGroup): number {
  if (group.total <= 0) return 0;
  const transferTotal = group.subcategories
    .filter((subcategory) => TRANSFER_SUBCATEGORIES.has(subcategory.key) || /transferencia/i.test(subcategory.label))
    .reduce((sum, subcategory) => sum + subcategory.total, 0);
  return transferTotal / group.total;
}

// ── Recommendation types ──────────────────────────────────────────────────────

interface ActionRecommendation {
  id: string;
  icon: React.ElementType;
  color: "emerald" | "blue" | "amber" | "purple" | "red" | "orange";
  title: string;
  body: string;
  cta: string;
  /** Route to navigate to (usually /productos?category=X) */
  href: string;
  /** Higher = shown first. Used to sort and limit to top 3 */
  priority: number;
}

// ── Color config ──────────────────────────────────────────────────────────────

const COLOR_STYLES: Record<string, { card: string; icon: string; cta: string }> = {
  emerald: {
    card: "border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-emerald-50/30 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
    cta: "text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300",
  },
  blue: {
    card: "border-blue-200 bg-gradient-to-r from-blue-50/80 to-blue-50/30 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-blue-500/5",
    icon: "text-blue-600 dark:text-blue-400",
    cta: "text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300",
  },
  amber: {
    card: "border-amber-200 bg-gradient-to-r from-amber-50/80 to-amber-50/30 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-amber-500/5",
    icon: "text-amber-600 dark:text-amber-400",
    cta: "text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300",
  },
  purple: {
    card: "border-purple-200 bg-gradient-to-r from-purple-50/80 to-purple-50/30 dark:border-purple-500/20 dark:from-purple-500/10 dark:to-purple-500/5",
    icon: "text-purple-600 dark:text-purple-400",
    cta: "text-purple-700 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300",
  },
  red: {
    card: "border-red-200 bg-gradient-to-r from-red-50/80 to-red-50/30 dark:border-red-500/20 dark:from-red-500/10 dark:to-red-500/5",
    icon: "text-red-600 dark:text-red-400",
    cta: "text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300",
  },
  orange: {
    card: "border-orange-200 bg-gradient-to-r from-orange-50/80 to-orange-50/30 dark:border-orange-500/20 dark:from-orange-500/10 dark:to-orange-500/5",
    icon: "text-orange-600 dark:text-orange-400",
    cta: "text-orange-700 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300",
  },
};

// ── Recommendation engine ─────────────────────────────────────────────────────

function generateRecommendations(data: DashboardData): ActionRecommendation[] {
  const recs: ActionRecommendation[] = [];
  const {
    totalIncome,
    totalExpenses,
    savingsRate,
    savingsNet,
    score,
    creditScore,
    categoryGroups,
    pendingReviewCount,
  } = data;

  // Tarea pendiente (no crítica): revisar categorías ambiguas. Prioridad media-baja
  // para que NUNCA tape alertas críticas (déficit, deuda alta) en el top-3.
  if (pendingReviewCount > 0) {
    recs.push({
      id: "pending-review",
      icon: ListChecks,
      color: "amber",
      title: `Tienes ${pendingReviewCount} movimiento${pendingReviewCount === 1 ? "" : "s"} por categorizar`,
      body: "Revisa y corrige las categorías marcadas para afinar tu diagnóstico y tu score.",
      cta: "Revisar movimientos",
      href: "/movimientos?revisar=1",
      priority: 58,
    });
  }

  if (totalIncome === 0) return recs;

  const expenseRatio = totalIncome > 0 ? totalExpenses / totalIncome : 0;
  const findGroup = (key: string) => categoryGroups.find((g) => g.key === key);

	  // 1. Low savings rate or deficit.
	  if (savingsNet < 0 && totalIncome > 0) {
	    recs.push({
	      id: "period-deficit",
	      icon: TrendingDown,
	      color: "red",
	      title: `Tus egresos superan ingresos por ${fmtCLP(Math.abs(savingsNet))}`,
	      body: `Este periodo gastaste ${Math.round(expenseRatio * 100)}% de tus ingresos. Prioriza reducir la brecha antes de invertir o tomar productos de ahorro.`,
	      cta: "Revisar movimientos",
	      href: "/movimientos",
	      priority: 95,
	    });
	  } else if (savingsRate < 10 && totalIncome > 0) {
	    const potential = Math.round(totalIncome * 0.10);
	    recs.push({
	      id: "low-savings",
      icon: PiggyBank,
      color: "amber",
      title: "Tu ahorro está por debajo del 10%",
      body: `Ahorrando ${fmtCLP(potential)}/mes en un depósito a plazo podrías generar intereses automáticamente.`,
      cta: "Ver depósitos a plazo",
      href: "/productos?tab=depositos_plazo",
      priority: 85,
    });
  } else if (savingsRate >= 10 && savingsNet > 300000) {
    // Good savings but idle cash → suggest investments
    recs.push({
      id: "idle-cash",
      icon: TrendingUp,
      color: "emerald",
      title: `Tienes ${fmtCLP(savingsNet)} de excedente este mes`,
      body: "Un fondo mutuo o APV podría rentabilizar tu ahorro y darte beneficios tributarios.",
      cta: "Explorar fondos mutuos y APV",
      href: "/productos?tab=fondos_mutuos",
      priority: 70,
    });
  }

	  // 2. High financial expenses (deudas) → suggest portabilidad or consolidation
	  const financieros = findGroup("financieros");
	  if (financieros && financieros.total > 0 && financieros.pctOfIncome > 25) {
	    if (transferShare(financieros) >= 0.5) {
	      recs.push({
	        id: "high-transfers",
	        icon: Repeat2,
	        color: "amber",
	        title: `${financieros.pctOfIncome}% de tu ingreso va a transferencias y pagos`,
	        body: "Revisa si corresponden a compromisos recurrentes, pagos de tarjeta o gastos que conviene reclasificar.",
	        cta: "Ver detalle",
	        href: "/movimientos?categoria=transferencia_enviada",
	        priority: 86,
	      });
	    } else {
	      recs.push({
	        id: "high-debt",
	        icon: Repeat2,
	        color: "red",
	        title: `Revisa tu carga financiera (~${financieros.pctOfIncome}% de tu ingreso)`,
	        body: "La categoría Gastos Financieros puede incluir pagos o transferencias entre tus cuentas. Si es deuda real, consolidar o portar a una tasa menor puede ayudar.",
	        cta: "Ver opciones de portabilidad",
	        href: "/productos?tab=portabilidad",
	        priority: 90,
	      });
	    }
	  }

  // 3. High essential expenses → suggest switching accounts to lower costs
  const esenciales = findGroup("esenciales");
  if (esenciales && esenciales.pctOfIncome > 60) {
    recs.push({
      id: "high-essentials",
      icon: Wallet,
      color: "blue",
      title: "Tus gastos esenciales superan el 60% del ingreso",
      body: "Revisa si tu cuenta corriente tiene comisiones altas. Hay cuentas sin costo de mantención.",
      cta: "Comparar cuentas",
      href: "/productos?tab=cuentas_ahorro",
      priority: 75,
    });
  }

  // 4. No credit score → suggest uploading CMF report
  if (creditScore === null && score !== null) {
    recs.push({
      id: "no-credit-score",
      icon: Shield,
      color: "purple",
      title: "Desbloquea tu score crediticio",
      body: "Sube tu informe de deudas CMF para obtener tu score crediticio y acceder a recomendaciones de crédito personalizadas.",
      cta: "Subir informe CMF",
      href: "/panel", // triggers upload drawer
      priority: 80,
    });
  }

  // 5. Good score → eligible for better products
  if (score !== null && score >= 65 && creditScore !== null && creditScore >= 650) {
    recs.push({
      id: "good-score",
      icon: CreditCard,
      color: "emerald",
      title: "Tu perfil financiero es bueno",
      body: `Con score ${score}/100 y crediticio ${creditScore}/850, eres elegible para productos con mejores condiciones.`,
      cta: "Ver productos recomendados",
      href: "/productos",
      priority: 60,
    });
  }

  // 6. Low score → improvement tips linked to specific actions
  if (score !== null && score < 45) {
    recs.push({
      id: "low-score",
      icon: TrendingDown,
      color: "red",
      title: "Tu score necesita atención",
      body: "Reducir gastos discrecionales y mantener un saldo mínimo de emergencia podría mejorar tu score significativamente.",
      cta: "Ver cómo mejorar",
      href: "/plan",
      priority: 88,
    });
  }

  // 7. High leisure spending spike (vs previous month)
  const ocio = findGroup("ocio");
  if (
    ocio &&
    ocio.prevMonthTotal !== null &&
    ocio.prevMonthTotal > 0 &&
    ocio.total > ocio.prevMonthTotal * 1.5 &&
    ocio.total > 50000
  ) {
    const delta = Math.round(((ocio.total - ocio.prevMonthTotal) / ocio.prevMonthTotal) * 100);
    recs.push({
      id: "leisure-spike",
      icon: Banknote,
      color: "orange",
      title: `Ocio subió ${delta}% vs mes anterior`,
      body: `Gastaste ${fmtCLP(ocio.total)} en entretenimiento. Redirigir parte a ahorro podría mejorar tu score.`,
      cta: "Ver detalle",
      href: "/movimientos?categoria=entretenimiento",
      priority: 55,
    });
  }

  // Sort by priority (desc) and take top 3
  return recs.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ActionCardsProps {
  data: DashboardData;
}

export default function ActionCards({ data }: ActionCardsProps) {
  const [, navigate] = useLocation();
  const recommendations = generateRecommendations(data);

  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Oportunidades para ti
      </p>
      {recommendations.map((rec) => {
        const styles = COLOR_STYLES[rec.color] ?? COLOR_STYLES.blue;
        const Icon = rec.icon;
        return (
          <button
            key={rec.id}
            onClick={() => navigate(rec.href)}
            className={cn(
              "w-full text-left rounded-2xl border p-4 transition-all hover:shadow-md group",
              styles.card,
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "rounded-xl p-2 bg-white/60 dark:bg-white/10 shrink-0",
              )}>
                <Icon className={cn("h-5 w-5", styles.icon)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug">
                  {rec.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {rec.body}
                </p>
                <span className={cn(
                  "inline-flex items-center gap-1 mt-2 text-xs font-medium transition-colors",
                  styles.cta,
                )}>
                  {rec.cta}
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
