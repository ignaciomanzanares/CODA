/**
 * Formulario Lite: solo Monto y Categoría (botones de iconos).
 * Fecha por defecto: Date.now() (hoy).
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShoppingCart,
  Utensils,
  Car,
  Home,
  Heart,
  Clapperboard,
  ShoppingBag,
  Zap,
  GraduationCap,
  Plane,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const liteFormSchema = z.object({
  amount: z.string().min(1, "El monto es obligatorio"),
  category: z.string().min(1, "Elige una categoría"),
});

export type AddExpenseFormLiteValues = z.infer<typeof liteFormSchema>;

export const categories = [
  "Groceries",
  "Dining",
  "Transportation",
  "Housing",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Utilities",
  "Education",
  "Travel",
  "Other",
];

export const categoryLabels: Record<string, string> = {
  Groceries: "Supermercado",
  Dining: "Restaurantes",
  Transportation: "Transporte",
  Housing: "Vivienda",
  Healthcare: "Salud",
  Entertainment: "Entretenimiento",
  Shopping: "Compras",
  Utilities: "Servicios",
  Education: "Educación",
  Travel: "Viajes",
  Other: "Otros",
};

function getCategoryIcon(category: string) {
  switch (category.toLowerCase()) {
    case "groceries":
      return ShoppingCart;
    case "dining":
      return Utensils;
    case "transportation":
      return Car;
    case "housing":
      return Home;
    case "healthcare":
      return Heart;
    case "entertainment":
      return Clapperboard;
    case "shopping":
      return ShoppingBag;
    case "utilities":
      return Zap;
    case "education":
      return GraduationCap;
    case "travel":
      return Plane;
    default:
      return MoreHorizontal;
  }
}

function getCategoryColor(category: string) {
  switch (category.toLowerCase()) {
    case "groceries":
      return "bg-green-500";
    case "dining":
      return "bg-orange-500";
    case "transportation":
      return "bg-blue-500";
    case "housing":
      return "bg-purple-500";
    case "healthcare":
      return "bg-red-500";
    case "entertainment":
      return "bg-pink-500";
    case "shopping":
      return "bg-yellow-500";
    case "utilities":
      return "bg-cyan-500";
    case "education":
      return "bg-indigo-500";
    case "travel":
      return "bg-teal-500";
    default:
      return "bg-gray-500";
  }
}

export interface AddExpenseFormLiteProps {
  onSubmit: (values: AddExpenseFormLiteValues) => void;
  defaultAmount?: string;
  defaultCategory?: string;
  isPending?: boolean;
}

export function AddExpenseFormLite({
  onSubmit,
  defaultAmount = "",
  defaultCategory = "",
  isPending = false,
}: AddExpenseFormLiteProps) {
  const form = useForm<AddExpenseFormLiteValues>({
    resolver: zodResolver(liteFormSchema),
    defaultValues: {
      amount: defaultAmount,
      category: defaultCategory,
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-5"
    >
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          Monto
        </label>
        <Input
          placeholder="0"
          type="number"
          step="0.01"
          min="0"
          {...form.register("amount")}
          className="text-lg"
        />
        {form.formState.errors.amount && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.amount.message}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          Categoría
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {categories.map((cat) => {
            const Icon = getCategoryIcon(cat);
            const isSelected = form.watch("category") === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => form.setValue("category", cat)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all",
                  isSelected
                    ? `${getCategoryColor(cat)} border-primary text-white`
                    : "border-muted hover:border-muted-foreground/50 bg-muted/30"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] sm:text-xs font-medium truncate w-full text-center">
                  {categoryLabels[cat] || cat}
                </span>
              </button>
            );
          })}
        </div>
        {form.formState.errors.category && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.category.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Añadiendo..." : "Añadir gasto"}
      </Button>
    </form>
  );
}
