import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import TabsComponent from "@/components/TabsComponent";
import FiltersSection from "@/components/FiltersSection";
import ProductsTable from "@/components/ProductsTable";
import { useAuth } from "@/lib/auth";
import SignInBanner from "@/components/SignInBanner";
import type { FinancialProduct } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, 
  CreditCard, 
  PiggyBank, 
  Shield,
  Sparkles,
  TrendingUp,
  Percent
} from "lucide-react";
import { useSearch } from "wouter";

// Define a type for your filters
type ProductFilters = {
  type?: string;
  rate?: string;
  term?: string;
  minAmount?: number;
  maxAmount?: number;
};

export default function Products() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { getFinancialProducts, getProductRecommendations, trackProductEvent } = useApi();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const categoryFromUrl = urlParams.get("category");
  
  const [activeCategory, setActiveCategory] = useState(() => {
    // Check if category from URL is valid
    const validCategories = ["loans", "credit_cards", "savings", "insurance"];
    if (categoryFromUrl && validCategories.includes(categoryFromUrl)) {
      return categoryFromUrl;
    }
    return "loans";
  });
  const [filters, setFilters] = useState<ProductFilters>({});
  
  // Update active category when URL changes
  useEffect(() => {
    const validCategories = ["loans", "credit_cards", "savings", "insurance"];
    if (categoryFromUrl && validCategories.includes(categoryFromUrl)) {
      setActiveCategory(categoryFromUrl);
    }
  }, [categoryFromUrl]);

  const {
    data: recommendedProducts,
    isLoading: productsLoading,
    error,
  } = useQuery({
    queryKey: ["/api/products/recommendations", activeCategory],
    queryFn: () => getProductRecommendations(activeCategory, 20),
    enabled: isAuthenticated && !authLoading,
  });

  const { data: catalogProducts, isLoading: catalogLoading } = useQuery({
    queryKey: ["/api/financial-products", activeCategory],
    queryFn: () => getFinancialProducts(activeCategory),
    enabled: !isAuthenticated && !authLoading,
  });

  // Track product views when recommendations load
  useEffect(() => {
    if (isAuthenticated && recommendedProducts && recommendedProducts.length > 0) {
      // Track views in background (don't await)
      recommendedProducts.forEach((product: any) => {
        if (product.id && product.matchScore) {
          trackProductEvent(product.id, 'view', product.matchScore, { category: activeCategory })
            .catch(err => console.warn('Failed to track view:', err));
        }
      });
    }
  }, [isAuthenticated, recommendedProducts, activeCategory]);
  
  const products = isAuthenticated ? recommendedProducts : catalogProducts ?? [];

  const handleTabChange = (tabId: string) => {
    setActiveCategory(tabId);
    setFilters({});
  };

  const handleFilterChange = (newFilters: ProductFilters) => {
    setFilters(newFilters);
  };

  // Apply filters to products
  const filterProducts = (products: FinancialProduct[] | Record<string, unknown>[]): FinancialProduct[] => {
    if (!products) return [];
    return products.filter((product: FinancialProduct | Record<string, unknown>) => {
      // Type guard to check if it's a proper FinancialProduct
      const productType = (product as FinancialProduct).productType || (product as Record<string, unknown>).productType as string;
      if (filters.type && filters.type !== "all" && productType?.toLowerCase() !== filters.type) {
        return false;
      }
      if (filters.rate && filters.rate !== "any") {
        const rate = ((product as FinancialProduct).interestRate || (product as Record<string, unknown>).interestRate as number) || 0;
        if (filters.rate === "below_5" && rate >= 5) return false;
        if (filters.rate === "5_to_10" && (rate < 5 || rate > 10)) return false;
        if (filters.rate === "above_10" && rate <= 10) return false;
      }
      if (filters.term && filters.term !== "any") {
        const productTerm = (product as Record<string, unknown>).term as number;
        if (productTerm) {
          const term = parseInt(filters.term);
          if (term && productTerm < term) return false;
        }
      }
      if (filters.minAmount !== undefined) {
        const loanAmount = (product as Record<string, unknown>).loanAmount as number;
        if (loanAmount && loanAmount < filters.minAmount) {
          return false;
        }
      }
      if (filters.maxAmount !== undefined) {
        const loanAmount = (product as Record<string, unknown>).loanAmount as number;
        if (loanAmount && loanAmount > filters.maxAmount) {
          return false;
        }
      }
      return true;
    }) as FinancialProduct[];
  };

  const filteredProducts = products ? filterProducts(products) : [];

  const tabs = [
    { id: "loans", label: "Créditos" },
    { id: "credit_cards", label: "Tarjetas de crédito" },
    { id: "savings", label: "Ahorro" },
    { id: "insurance", label: "Seguros" },
  ];

  const listLoading = isAuthenticated ? productsLoading : catalogLoading;
  if (authLoading || listLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="h-10 bg-muted rounded animate-pulse w-64"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
          <div className="h-12 bg-muted rounded animate-pulse"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Get stats for current category
  const getCategoryStats = () => {
    const count = filteredProducts.length;
    switch (activeCategory) {
      case 'loans':
        return { icon: Wallet, color: 'bg-blue-500', label: 'Créditos disponibles', count };
      case 'credit_cards':
        return { icon: CreditCard, color: 'bg-purple-500', label: 'Tarjetas de crédito', count };
      case 'savings':
        return { icon: PiggyBank, color: 'bg-green-500', label: 'Cuentas de ahorro', count };
      case 'insurance':
        return { icon: Shield, color: 'bg-orange-500', label: 'Planes de seguro', count };
      default:
        return { icon: Wallet, color: 'bg-gray-500', label: 'Productos', count };
    }
  };

  const stats = getCategoryStats();
  const StatsIcon = stats.icon;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div id="product-section" className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!isAuthenticated && (
          <SignInBanner
            title="Catálogo público de productos"
            description="Inicia sesión para recomendaciones personalizadas según tu perfil y tus datos en CODA."
            actionText="Iniciar sesión"
          />
        )}
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Wallet className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Productos financieros</h1>
                <p className="text-muted-foreground">Recomendaciones personalizadas según tu perfil</p>
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="gap-2 px-4 py-2 text-sm">
            <Sparkles className="h-4 w-4" />
            Coincidencia con IA
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className={activeCategory === 'loans' ? 'ring-2 ring-primary' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500 text-white">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mejor tasa de crédito</p>
                  <p className="text-lg font-bold">3.99% APR</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={activeCategory === 'credit_cards' ? 'ring-2 ring-primary' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500 text-white">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mejores beneficios</p>
                  <p className="text-lg font-bold">5% Cashback</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={activeCategory === 'savings' ? 'ring-2 ring-primary' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500 text-white">
                  <PiggyBank className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mejor APY</p>
                  <p className="text-lg font-bold">5.25% APY</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={activeCategory === 'insurance' ? 'ring-2 ring-primary' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500 text-white">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Coverage From</p>
                  <p className="text-lg font-bold">$9.99/mo</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs and Products */}
        <TabsComponent
          tabs={tabs}
          defaultActiveTab="loans"
          className="mb-6"
          onTabChange={handleTabChange}
        >
        <div id="loans" className="space-y-4">
          <FiltersSection category="loans" onFilterChange={handleFilterChange} />
          <ProductsTable
            products={filteredProducts}
            category="loans"
            isLoading={listLoading}
            error={error}
          />
        </div>
        <div id="credit_cards" className="space-y-4">
          <FiltersSection category="credit_cards" onFilterChange={handleFilterChange} />
          <ProductsTable
            products={filteredProducts}
            category="credit_cards"
            isLoading={listLoading}
            error={error}
          />
        </div>
        <div id="savings" className="space-y-4">
          <FiltersSection category="savings" onFilterChange={handleFilterChange} />
          <ProductsTable
            products={filteredProducts}
            category="savings"
            isLoading={listLoading}
            error={error}
          />
        </div>
        <div id="insurance" className="space-y-4">
          <FiltersSection category="insurance" onFilterChange={handleFilterChange} />
          <ProductsTable
            products={filteredProducts}
            category="insurance"
            isLoading={listLoading}
            error={error}
          />
        </div>
      </TabsComponent>
      </div>
    </div>
  );
}