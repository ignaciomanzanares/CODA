import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import TabsComponent from "@/components/TabsComponent";
import FiltersSection from "@/components/FiltersSection";
import ProductsTable from "@/components/ProductsTable";
import { useAuth } from "@/lib/auth";
import { getDemoFinancialProductsByCategory } from "@/lib/demoData";
import SignInBanner from "@/components/SignInBanner";
import type { FinancialProduct } from "@/types";

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
  const [activeCategory, setActiveCategory] = useState("loans");
  const [filters, setFilters] = useState<ProductFilters>({});

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
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div id="product-section" className="mb-12">
      {!isAuthenticated && (
        <SignInBanner 
          title="Viewing Demo Financial Products"
          description="You're exploring sample financial products including loans, credit cards, savings accounts, and insurance. Sign in to get personalized product recommendations based on your financial profile."
          actionText="Sign In for Personal Recommendations"
        />
      )}
      <h2 className="text-2xl font-bold text-gray-800 mb-6 font-sans">Recommended Financial Products</h2>
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
  );
}