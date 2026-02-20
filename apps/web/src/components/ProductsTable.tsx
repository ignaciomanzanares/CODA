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
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";

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

  const { currency } = useCurrency();
  const formatCurrencyFn = (amount: number) => formatCurrency(amount, currency);

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
          { key: "provider", label: "Proveedor" },
          { key: "productType", label: "Tipo de crédito" },
          { key: "interestRate", label: "Tasa de interés" },
          { key: "monthlyPayment", label: "Cuota mensual" },
          { key: "term", label: "Plazo" },
          { key: "action", label: "Acción" },
        ];
      case "credit_cards":
        return [
          { key: "provider", label: "Proveedor" },
          { key: "productType", label: "Tipo de tarjeta" },
          { key: "interestRate", label: "APR" },
          { key: "rewardsRate", label: "Beneficios" },
          { key: "annualFee", label: "Anualidad" },
          { key: "action", label: "Acción" },
        ];
      case "savings":
        return [
          { key: "provider", label: "Proveedor" },
          { key: "productType", label: "Tipo de cuenta" },
          { key: "interestRate", label: "APY" },
          { key: "minimumBalance", label: "Saldo mínimo" },
          { key: "features", label: "Características" },
          { key: "action", label: "Acción" },
        ];
      case "insurance":
        return [
          { key: "provider", label: "Proveedor" },
          { key: "productType", label: "Tipo de seguro" },
          { key: "coverage", label: "Cobertura" },
          { key: "premium", label: "Prima" },
          { key: "features", label: "Características" },
          { key: "action", label: "Acción" },
        ];
      default:
        return [
          { key: "provider", label: "Proveedor" },
          { key: "productType", label: "Tipo" },
          { key: "details", label: "Detalles" },
          { key: "action", label: "Acción" },
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
              {category === "loans" ? "Fija" : "Variable"}
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
                Por {formatCurrencyFn(product.loanAmount)}
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
            {features.rewardsRate ? `${features.rewardsRate}% reembolso` : "Ninguno"}
          </div>
        );
      }
      case "annualFee": {
        const fee = (product.features?.annualFee as number) || 0;
        return (
          <div className="text-sm text-gray-900">
            {fee > 0 ? formatCurrencyFn(fee) : "Sin costo"}
          </div>
        );
      }
      case "minimumBalance": {
        const minBalance = (product.features?.minimumBalance as number) || 0;
        return (
          <div className="text-sm text-gray-900">
            {minBalance > 0 ? formatCurrencyFn(minBalance) : "Sin mínimo"}
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
            {featuresList.length > 0 ? featuresList.slice(0, 2).join(", ") : "Estándar"}
            {featuresList.length > 2 && "..."}
          </div>
        );
      }
      case "coverage":
        return (
          <div className="text-sm text-gray-900">
            {product.features?.replacementCost ? "Reemplazo total" : "Estándar"}
          </div>
        );
      case "premium":
        return (
          <div className="text-sm text-gray-900">
            Varía según perfil
          </div>
        );
      case "action":
        return (
          <Button variant="link" className="text-primary hover:text-primary-dark font-medium">
            Solicitar
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
            : "No se pudieron cargar los productos financieros"}
        </p>
        <Button className="mt-4">Reintentar</Button>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-gray-500">No hay productos que coincidan con tus criterios. Prueba a ajustar los filtros.</p>
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
            Mostrando {indexOfFirstProduct + 1} a {Math.min(indexOfLastProduct, products.length)} de {products.length} productos
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
