import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFinancialProducts } from "@/lib/api";
import TabsComponent from "@/components/TabsComponent";
import FiltersSection from "@/components/FiltersSection";
import ProductsTable from "@/components/ProductsTable";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth0 } from "@auth0/auth0-react";

// Define a type for your filters
type ProductFilters = {
  type?: string;
  rate?: string;
  term?: string;
  minAmount?: number;
  maxAmount?: number;
};

export default function Products() {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();
  const [activeCategory, setActiveCategory] = useState("loans");
  const [filters, setFilters] = useState<ProductFilters>({});

  // Only fetch products if authenticated and not loading
  const {
    data: products,
    isLoading: productsLoading,
    error,
  } = useQuery({
    queryKey: ["/api/financial-products", activeCategory],
    queryFn: () => getFinancialProducts(activeCategory),
    enabled: isAuthenticated && !authLoading,
  });

  const handleTabChange = (tabId: string) => {
    setActiveCategory(tabId);
    setFilters({});
  };

  const handleFilterChange = (newFilters: ProductFilters) => {
    setFilters(newFilters);
  };

  // Apply filters to products
  const filterProducts = (products: any[]) => {
    if (!products) return [];
    return products.filter((product) => {
      if (filters.type && filters.type !== "all" && product.productType?.toLowerCase() !== filters.type) {
        return false;
      }
      if (filters.rate && filters.rate !== "any") {
        const rate = product.interestRate || 0;
        if (filters.rate === "below_5" && rate >= 5) return false;
        if (filters.rate === "5_to_10" && (rate < 5 || rate > 10)) return false;
        if (filters.rate === "above_10" && rate <= 10) return false;
      }
      if (filters.term && filters.term !== "any" && product.term) {
        const term = parseInt(filters.term);
        if (term && product.term < term) return false;
      }
      if (filters.minAmount !== undefined && product.loanAmount && product.loanAmount < filters.minAmount) {
        return false;
      }
      if (filters.maxAmount !== undefined && product.loanAmount && product.loanAmount > filters.maxAmount) {
        return false;
      }
      return true;
    });
  };

  const filteredProducts = products ? filterProducts(products) : [];

  const tabs = [
    { id: "loans", label: "Loans" },
    { id: "credit_cards", label: "Credit Cards" },
    { id: "savings", label: "Savings" },
    { id: "insurance", label: "Insurance" },
  ];

  if (authLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please sign in to view products.</div>;

  return (
    <div id="product-section" className="mb-12">
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