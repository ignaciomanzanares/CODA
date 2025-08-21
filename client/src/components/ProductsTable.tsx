import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CreditCard, 
  PiggyBank, 
  ShieldCheck, 
  Landmark
} from "lucide-react";
import type { FinancialProduct, LoanProduct } from "@/types";

interface ProductsTableProps {
  products: FinancialProduct[];
  category: string;
  isLoading: boolean;
  error: Error | null;
}

export default function ProductsTable({
  products,
  category,
  isLoading,
  error
}: ProductsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 4;
  
  // Calculate pagination
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = products.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(products.length / productsPerPage);
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Function to get icon based on provider
  const getProviderIcon = (category: string) => {
    switch (category) {
      case "loans":
        return <Landmark className="h-5 w-5 text-gray-500" />;
      case "credit_cards":
        return <CreditCard className="h-5 w-5 text-gray-500" />;
      case "savings":
        return <PiggyBank className="h-5 w-5 text-gray-500" />;
      case "insurance":
        return <ShieldCheck className="h-5 w-5 text-gray-500" />;
      default:
        return <Landmark className="h-5 w-5 text-gray-500" />;
    }
  };

  // Function to get columns based on category
  const getColumns = () => {
    switch (category) {
      case "loans":
        return [
          { key: "provider", label: "Provider" },
          { key: "productType", label: "Loan Type" },
          { key: "interestRate", label: "Interest Rate" },
          { key: "monthlyPayment", label: "Monthly Payment" },
          { key: "term", label: "Term" },
          { key: "action", label: "Action" },
        ];
      case "credit_cards":
        return [
          { key: "provider", label: "Provider" },
          { key: "productType", label: "Card Type" },
          { key: "interestRate", label: "APR" },
          { key: "rewardsRate", label: "Rewards" },
          { key: "annualFee", label: "Annual Fee" },
          { key: "action", label: "Action" },
        ];
      case "savings":
        return [
          { key: "provider", label: "Provider" },
          { key: "productType", label: "Account Type" },
          { key: "interestRate", label: "APY" },
          { key: "minimumBalance", label: "Minimum Balance" },
          { key: "features", label: "Features" },
          { key: "action", label: "Action" },
        ];
      case "insurance":
        return [
          { key: "provider", label: "Provider" },
          { key: "productType", label: "Insurance Type" },
          { key: "coverage", label: "Coverage" },
          { key: "premium", label: "Premium" },
          { key: "features", label: "Features" },
          { key: "action", label: "Action" },
        ];
      default:
        return [
          { key: "provider", label: "Provider" },
          { key: "productType", label: "Type" },
          { key: "details", label: "Details" },
          { key: "action", label: "Action" },
        ];
    }
  };

  // Type guards
  const isLoanProduct = (product: FinancialProduct): product is LoanProduct => {
    return 'monthlyPayment' in product && 'loanAmount' in product;
  };

  // Function to render cell content based on column key and product data
  const renderCellContent = (product: FinancialProduct, columnKey: string) => {
    switch (columnKey) {
      case "provider":
        return (
          <div className="flex items-center">
            <div className="flex-shrink-0 h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center">
              {getProviderIcon(category)}
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-900">{product.provider}</div>
            </div>
          </div>
        );
      case "productType":
        return <div className="text-sm text-gray-900">{product.productType}</div>;
      case "interestRate":
        if (category === "savings") {
          return (
            <>
              <div className={`text-sm font-medium ${(product.interestRate ?? 0) >= 4 ? "text-green-600" : "text-yellow-600"}`}>
                {product.interestRate}%
              </div>
              <div className="text-xs text-gray-500">APY</div>
            </>
          );
        }
        return (
          <>
            <div className={`text-sm font-medium ${(product.interestRate ?? 0) < 8 ? "text-green-600" : "text-yellow-600"}`}>
              {product.interestRate}%
            </div>
            <div className="text-xs text-gray-500">
              {category === "loans" ? "Fixed" : "Variable"}
            </div>
          </>
        );
      case "monthlyPayment":
        if (isLoanProduct(product)) {
          return (
            <>
              <div className="text-sm font-medium text-gray-900">
                ${product.monthlyPayment}
              </div>
              <div className="text-xs text-gray-500">
                For {formatCurrency(product.loanAmount)}
              </div>
            </>
          );
        }
        return null;
      case "term":
        if (isLoanProduct(product)) {
          return (
            <div className="text-sm text-gray-900">
              {product.term} {product.termUnit}
            </div>
          );
        }
        return null;
      case "rewardsRate": {
        const features = product.features || {};
        return (
          <div className="text-sm text-gray-900">
            {features.rewardsRate ? `${features.rewardsRate}% Cash Back` : "None"}
          </div>
        );
      }
      case "annualFee": {
        const fee = (product.features?.annualFee as number) || 0;
        return (
          <div className="text-sm text-gray-900">
            {fee > 0 ? formatCurrency(fee) : "No Fee"}
          </div>
        );
      }
      case "minimumBalance": {
        const minBalance = (product.features?.minimumBalance as number) || 0;
        return (
          <div className="text-sm text-gray-900">
            {minBalance > 0 ? formatCurrency(minBalance) : "No Minimum"}
          </div>
        );
      }
      case "features": {
        const productFeatures = product.features || {};
        const featuresList = Object.entries(productFeatures)
          .filter(([_key, value]) => value === true)
          .map(([key]) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
        
        return (
          <div className="text-sm text-gray-900">
            {featuresList.length > 0 ? featuresList.slice(0, 2).join(", ") : "Standard"}
            {featuresList.length > 2 && "..."}
          </div>
        );
      }
      case "coverage":
        return (
          <div className="text-sm text-gray-900">
            {product.features?.replacementCost ? "Full Replacement" : "Standard"}
          </div>
        );
      case "premium":
        return (
          <div className="text-sm text-gray-900">
            Varies by profile
          </div>
        );
      case "action":
        return (
          <Button variant="link" className="text-primary hover:text-primary-dark font-medium">
            Apply
          </Button>
        );
      default:
        return null;
    }
  };

  const columns = getColumns();

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    {columns.map((column) => (
                      <TableCell key={`${i}-${column.key}`} className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center">
        <p className="text-red-500">
          {error instanceof Error
            ? error.message
            : "Failed to load financial products"}
        </p>
        <Button className="mt-4">Retry</Button>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-gray-500">No products found matching your criteria. Try adjusting your filters.</p>
      </Card>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentProducts.map((product) => (
              <TableRow key={product.id} className="hover:bg-gray-50">
                {columns.map((column) => (
                  <TableCell key={`${product.id}-${column.key}`} className="px-6 py-4 whitespace-nowrap">
                    {renderCellContent(product, column.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <div className="px-6 py-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {indexOfFirstProduct + 1} to {Math.min(indexOfLastProduct, products.length)} of {products.length} products
          </div>
          
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => handlePageChange(page)}
                      isActive={page === currentPage}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>
    </div>
  );
}
