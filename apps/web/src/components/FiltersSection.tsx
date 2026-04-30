import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sliders } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AllFilters, FilterValue } from "@/types";

interface FiltersSectionProps {
  category: string;
  onFilterChange: (filters: AllFilters) => void;
  className?: string;
}

export default function FiltersSection({
  category,
  onFilterChange,
  className,
}: FiltersSectionProps) {
  // State for each filter type
  const [filters, setFilters] = useState({
    type: "all",
    rate: "any",
    term: "any",
  });
  
  // State for advanced filters
  const [advancedFilters, setAdvancedFilters] = useState({
    minAmount: 0,
    maxAmount: 50000,
    requiresCollateral: false,
    onlineApplication: true,
    preApproved: false,
  });

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange({ ...newFilters, ...advancedFilters });
  };

  const handleAdvancedFilterChange = (key: string, value: FilterValue) => {
    const newAdvancedFilters = { ...advancedFilters, [key]: value };
    setAdvancedFilters(newAdvancedFilters);
    onFilterChange({ ...filters, ...newAdvancedFilters });
  };

  // Generate filter options based on category
  const getTypeOptions = () => {
    switch (category) {
      case "loans":
        return [
          { value: "all", label: "Todos los tipos" },
          { value: "personal", label: "Créditos de consumo" },
          { value: "auto", label: "Créditos vehiculares" },
          { value: "mortgage", label: "Hipotecarios" },
          { value: "student", label: "Créditos estudiantiles" },
        ];
      case "credit_cards":
        return [
          { value: "all", label: "Todos los tipos" },
          { value: "cashback", label: "Cashback" },
          { value: "travel", label: "Viajes" },
          { value: "balance_transfer", label: "Transferencia de saldo" },
          { value: "secured", label: "Tarjetas aseguradas" },
        ];
      case "savings":
        return [
          { value: "all", label: "Todos los tipos" },
          { value: "savings", label: "Cuentas de ahorro" },
          { value: "checking", label: "Cuentas corrientes" },
          { value: "cd", label: "Depósitos a plazo" },
          { value: "money_market", label: "Cuentas de mercado monetario" },
        ];
      case "insurance":
        return [
          { value: "all", label: "Todos los tipos" },
          { value: "auto", label: "Seguro automotriz" },
          { value: "home", label: "Seguro de hogar" },
          { value: "life", label: "Seguro de vida" },
          { value: "health", label: "Seguro de salud" },
        ];
      default:
        return [{ value: "all", label: "Todos los tipos" }];
    }
  };

  const getRateOptions = () => {
    if (category === "loans" || category === "credit_cards" || category === "savings") {
      return [
        { value: "any", label: "Cualquier tasa" },
        { value: "below_5", label: "Menos de 5%" },
        { value: "5_to_10", label: "5% - 10%" },
        { value: "above_10", label: "Más de 10%" },
      ];
    }
    return [{ value: "any", label: "Cualquier tasa" }];
  };

  const getTermOptions = () => {
    if (category === "loans" || category === "savings") {
      return [
        { value: "any", label: "Cualquier plazo" },
        { value: "12", label: "12 meses" },
        { value: "24", label: "24 meses" },
        { value: "36", label: "36+ meses" },
      ];
    }
    return [{ value: "any", label: "Cualquier plazo" }];
  };

  const typeOptions = getTypeOptions();
  const rateOptions = getRateOptions();
  const termOptions = getTermOptions();

  return (
    <div className={cn("bg-muted/50 p-4 rounded-lg mb-6 flex flex-wrap items-center gap-4", className)}>
      <div className="font-medium text-foreground">Filtros:</div>

      <div className="relative">
        <Select value={filters.type} onValueChange={(value) => handleFilterChange("type", value)}>
          <SelectTrigger className="w-40 bg-white">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(category === "loans" || category === "credit_cards" || category === "savings") && (
        <div className="relative">
          <Select value={filters.rate} onValueChange={(value) => handleFilterChange("rate", value)}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Tasa" />
            </SelectTrigger>
            <SelectContent>
              {rateOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(category === "loans" || category === "savings") && (
        <div className="relative">
          <Select value={filters.term} onValueChange={(value) => handleFilterChange("term", value)}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Plazo" />
            </SelectTrigger>
            <SelectContent>
              {termOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Sheet>
        <SheetTrigger asChild>
          <Button className="ml-auto" variant="default">
            <Sliders className="mr-2 h-4 w-4" />
            Más filtros
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filtros avanzados</SheetTitle>
            <SheetDescription>
              Ajusta la búsqueda para encontrar los productos financieros
              que mejor se adapten a ti.
            </SheetDescription>
          </SheetHeader>

          <div className="py-6 space-y-6">
            {(category === "loans" || category === "insurance") && (
              <div className="space-y-2">
                <Label>Rango de monto</Label>
                <div className="flex items-center justify-between">
                  <span>${advancedFilters.minAmount}</span>
                  <span>${advancedFilters.maxAmount}</span>
                </div>
                <Slider
                  defaultValue={[advancedFilters.minAmount, advancedFilters.maxAmount]}
                  max={50000}
                  step={1000}
                  onValueChange={(value) => {
                    handleAdvancedFilterChange("minAmount", value[0]);
                    handleAdvancedFilterChange("maxAmount", value[1]);
                  }}
                />
              </div>
            )}

            {category === "loans" && (
              <div className="flex items-center justify-between">
                <Label htmlFor="requires-collateral">Requiere garantía</Label>
                <Switch
                  id="requires-collateral"
                  checked={advancedFilters.requiresCollateral}
                  onCheckedChange={(checked) =>
                    handleAdvancedFilterChange("requiresCollateral", checked)
                  }
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="online-application">Postulación en línea</Label>
              <Switch
                id="online-application"
                checked={advancedFilters.onlineApplication}
                onCheckedChange={(checked) =>
                  handleAdvancedFilterChange("onlineApplication", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="pre-approved">Solo preaprobados</Label>
              <Switch
                id="pre-approved"
                checked={advancedFilters.preApproved}
                onCheckedChange={(checked) =>
                  handleAdvancedFilterChange("preApproved", checked)
                }
              />
            </div>
          </div>

          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">Aplicar filtros</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
