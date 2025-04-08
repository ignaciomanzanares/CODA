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

interface FiltersSectionProps {
  category: string;
  onFilterChange: (filters: Record<string, any>) => void;
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
    onFilterChange(newFilters);
  };

  const handleAdvancedFilterChange = (key: string, value: any) => {
    const newAdvancedFilters = { ...advancedFilters, [key]: value };
    setAdvancedFilters(newAdvancedFilters);
    onFilterChange({ ...filters, ...newAdvancedFilters });
  };

  // Generate filter options based on category
  const getTypeOptions = () => {
    switch (category) {
      case "loans":
        return [
          { value: "all", label: "All Loan Types" },
          { value: "personal", label: "Personal Loans" },
          { value: "auto", label: "Auto Loans" },
          { value: "mortgage", label: "Mortgages" },
          { value: "student", label: "Student Loans" },
        ];
      case "credit_cards":
        return [
          { value: "all", label: "All Card Types" },
          { value: "cashback", label: "Cash Back" },
          { value: "travel", label: "Travel Rewards" },
          { value: "balance_transfer", label: "Balance Transfer" },
          { value: "secured", label: "Secured Cards" },
        ];
      case "savings":
        return [
          { value: "all", label: "All Account Types" },
          { value: "savings", label: "Savings Accounts" },
          { value: "checking", label: "Checking Accounts" },
          { value: "cd", label: "Certificates of Deposit" },
          { value: "money_market", label: "Money Market Accounts" },
        ];
      case "insurance":
        return [
          { value: "all", label: "All Insurance Types" },
          { value: "auto", label: "Auto Insurance" },
          { value: "home", label: "Home Insurance" },
          { value: "life", label: "Life Insurance" },
          { value: "health", label: "Health Insurance" },
        ];
      default:
        return [{ value: "all", label: "All Types" }];
    }
  };

  const getRateOptions = () => {
    if (category === "loans" || category === "credit_cards" || category === "savings") {
      return [
        { value: "any", label: "Any Rate" },
        { value: "below_5", label: "Below 5%" },
        { value: "5_to_10", label: "5% - 10%" },
        { value: "above_10", label: "Above 10%" },
      ];
    }
    return [{ value: "any", label: "Any Rate" }];
  };

  const getTermOptions = () => {
    if (category === "loans" || category === "savings") {
      return [
        { value: "any", label: "Any Term" },
        { value: "12", label: "12 Months" },
        { value: "24", label: "24 Months" },
        { value: "36", label: "36+ Months" },
      ];
    }
    return [{ value: "any", label: "Any Term" }];
  };

  const typeOptions = getTypeOptions();
  const rateOptions = getRateOptions();
  const termOptions = getTermOptions();

  return (
    <div className={cn("bg-gray-50 p-4 rounded-lg mb-6 flex flex-wrap items-center gap-4", className)}>
      <div className="font-medium text-gray-700">Filters:</div>

      <div className="relative">
        <Select value={filters.type} onValueChange={(value) => handleFilterChange("type", value)}>
          <SelectTrigger className="w-40 bg-white">
            <SelectValue placeholder="Select type" />
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
              <SelectValue placeholder="Select rate" />
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
              <SelectValue placeholder="Select term" />
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
            More Filters
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Advanced Filters</SheetTitle>
            <SheetDescription>
              Fine-tune your search to find the perfect financial products
              for your needs.
            </SheetDescription>
          </SheetHeader>

          <div className="py-6 space-y-6">
            {(category === "loans" || category === "insurance") && (
              <div className="space-y-2">
                <Label>Amount Range</Label>
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
                <Label htmlFor="requires-collateral">Requires Collateral</Label>
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
              <Label htmlFor="online-application">Online Application</Label>
              <Switch
                id="online-application"
                checked={advancedFilters.onlineApplication}
                onCheckedChange={(checked) =>
                  handleAdvancedFilterChange("onlineApplication", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="pre-approved">Pre-Approved Only</Label>
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
              <Button variant="outline">Apply Filters</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
