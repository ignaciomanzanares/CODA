import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import TabsComponent from "@/components/TabsComponent";
import FiltersSection from "@/components/FiltersSection";
import ProductsTable from "@/components/ProductsTable";
import { useAuth } from "@/lib/auth";
import { getDemoFinancialProductsByCategory } from "@/lib/demoData";
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
  const { getFinancialProducts } = useApi(); // <-- Add this line
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

  // Use demo data when not authenticated, real data when authenticated
  const demoProducts = getDemoFinancialProductsByCategory(activeCategory);
  
  // Only fetch products if authenticated and not loading
  const {
    data: realProducts,
    isLoading: productsLoading,
    error,
  } = useQuery({
    queryKey: ["/api/financial-products", activeCategory],
    queryFn: () => getFinancialProducts(activeCategory), // <-- Now this works
    enabled: isAuthenticated && !authLoading,
  });
  
  const products = isAuthenticated ? realProducts : demoProducts;

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
    { id: "loans", label: "Loans" },
    { id: "credit_cards", label: "Credit Cards" },
    { id: "savings", label: "Savings" },
    { id: "insurance", label: "Insurance" },
  ];

  if (authLoading || (isAuthenticated && productsLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container py-8 space-y-6">
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
        return { icon: Wallet, color: 'bg-blue-500', label: 'Available Loans', count };
      case 'credit_cards':
        return { icon: CreditCard, color: 'bg-purple-500', label: 'Credit Cards', count };
      case 'savings':
        return { icon: PiggyBank, color: 'bg-green-500', label: 'Savings Accounts', count };
      case 'insurance':
        return { icon: Shield, color: 'bg-orange-500', label: 'Insurance Plans', count };
      default:
        return { icon: Wallet, color: 'bg-gray-500', label: 'Products', count };
    }
  };

  const stats = getCategoryStats();
  const StatsIcon = stats.icon;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div id="product-section" className="container py-8 space-y-6">
        {!isAuthenticated && (
          <SignInBanner 
            title="Viewing Demo Financial Products"
            description="You're exploring sample financial products including loans, credit cards, savings accounts, and insurance. Sign in to get personalized product recommendations based on your financial profile."
            actionText="Sign In for Personal Recommendations"
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
                <h1 className="text-3xl font-bold">Financial Products</h1>
                <p className="text-muted-foreground">Personalized recommendations based on your profile</p>
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="gap-2 px-4 py-2 text-sm">
            <Sparkles className="h-4 w-4" />
            AI-Powered Matching
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
                  <p className="text-sm text-muted-foreground">Best Loan Rate</p>
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
                  <p className="text-sm text-muted-foreground">Top Rewards</p>
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
                  <p className="text-sm text-muted-foreground">Best APY</p>
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
            isLoading={productsLoading}
            error={error}
          />
        </div>
        <div id="credit_cards" className="space-y-4">
          <FiltersSection category="credit_cards" onFilterChange={handleFilterChange} />
          <ProductsTable
            products={filteredProducts}
            category="credit_cards"
            isLoading={productsLoading}
            error={error}
          />
        </div>
        <div id="savings" className="space-y-4">
          <FiltersSection category="savings" onFilterChange={handleFilterChange} />
          <ProductsTable
            products={filteredProducts}
            category="savings"
            isLoading={productsLoading}
            error={error}
          />
        </div>
        <div id="insurance" className="space-y-4">
          <FiltersSection category="insurance" onFilterChange={handleFilterChange} />
          <ProductsTable
            products={filteredProducts}
            category="insurance"
            isLoading={productsLoading}
            error={error}
          />
        </div>
      </TabsComponent>
      </div>
    </div>
  );
}