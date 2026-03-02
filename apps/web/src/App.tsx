import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { CurrencyProvider } from "./lib/CurrencyContext";

import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import SignUp from "@/pages/SignUp";
import Landing from "@/pages/Landing";
import About from "@/pages/About";
import CreditScoreInfo from "@/pages/CreditScoreInfo";
import InsuranceRiskInfo from "@/pages/InsuranceRiskInfo";
import Empresas from "@/pages/Empresas";
import EmpresasLayout from "@/pages/empresas/EmpresasLayout";
import EmpresasDashboard from "@/pages/empresas/EmpresasDashboard";
import EmpresasCompanies from "@/pages/empresas/EmpresasCompanies";
import EmpresasTransactions from "@/pages/empresas/EmpresasTransactions";
import EmpresasReconciliation from "@/pages/empresas/EmpresasReconciliation";
import EmpresasStatements from "@/pages/empresas/EmpresasStatements";
import EmpresasRisk from "@/pages/empresas/EmpresasRisk";
import EmpresasDocuments from "@/pages/empresas/EmpresasDocuments";
import EmpresasProducts from "@/pages/empresas/EmpresasProducts";
import EmpresasPurchaseOrders from "@/pages/empresas/EmpresasPurchaseOrders";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import Products from "@/pages/Products";
import Goals from "@/pages/Goals";
import Plan from "@/pages/Plan";
import Profile from "@/pages/Profile";
import Expenses from "@/pages/Expenses";
import Movimientos from "@/pages/Movimientos";
import ConsentConnections from "@/pages/ConsentConnections";
import EmailInviteHandler from "@/pages/EmailInviteHandler";
import ShareBillSplit from "@/pages/ShareBillSplit";
import AuditDashboard from "@/pages/AuditDashboard";
import FinancialAssistant from "@/components/FinancialAssistant";
import ErrorBoundary from "@/components/ErrorBoundary";

const BillSplit = lazy(() => import("@/pages/BillSplit"));


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
      <Switch>
        {/* Landing page - custom layout */}
        <Route path="/">
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">
              <Landing />
            </main>
            <Footer />
          </div>
        </Route>

        {/* Public routes */}
        <Route path="/login" component={Login} />
        <Route path="/empresas/login" component={Login} />
        <Route path="/signup" component={SignUp} />
        <Route path="/about" component={About} />
        <Route path="/empresas" component={Empresas} />
        <Route path="/info/credit-score" component={CreditScoreInfo} />
        <Route path="/info/insurance-risk" component={InsuranceRiskInfo} />
        
        {/* Special route for email invitations - no header/footer */}
        <Route path="/invite">
          <div className="min-h-screen">
            <EmailInviteHandler />
            <Toaster />
          </div>
        </Route>
        
        {/* Public route for shared bill splits - no auth required */}
        <Route path="/split/:code">
          {() => (
            <div className="min-h-screen">
              <ShareBillSplit />
              <Toaster />
            </div>
          )}
        </Route>
        
        {/* All other routes with header/footer and protection */}
        <Route>
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">
                <Switch>
                  <Route path="/onboarding" component={Onboarding} />
                  {/* CODA Empresas: sesión independiente de Personal */}
                  <Route path="/empresas/dashboard">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasDashboard /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/companies">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasCompanies /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/transactions">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasTransactions /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/reconciliation">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasReconciliation /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/statements">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasStatements /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/risk">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasRisk /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/documents">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasDocuments /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/products">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasProducts /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/empresas/purchase-orders">
                    <ProtectedRoute context="empresas">
                      <EmpresasLayout><EmpresasPurchaseOrders /></EmpresasLayout>
                    </ProtectedRoute>
                  </Route>
                  <Route path="/dashboard">
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/movimientos">
                    <ProtectedRoute>
                      <Movimientos />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/conexiones">
                    <ProtectedRoute>
                      <ConsentConnections />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/expenses">
                    <ProtectedRoute>
                      <Expenses />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/bill-split">
                    <ErrorBoundary>
                      <Suspense fallback={
                        <div className="container py-8 max-w-5xl mx-auto">
                          <h1 className="text-3xl font-bold tracking-tight">Dividir cuenta</h1>
                          <p className="text-muted-foreground mt-1">Cargando...</p>
                          <div className="mt-6 h-32 bg-muted rounded animate-pulse" />
                        </div>
                      }>
                        <BillSplit />
                      </Suspense>
                    </ErrorBoundary>
                  </Route>
                  <Route path="/audit">
                    <ProtectedRoute>
                      <AuditDashboard />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/products">
                    <ProtectedRoute>
                      <Products />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/goals">
                    <ProtectedRoute>
                      <Goals />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/plan">
                    <ProtectedRoute>
                      <Plan />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/profile">
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  </Route>
                  <Route component={NotFound} />
                </Switch>
            </main>
            <Footer />
          </div>
        </Route>
      </Switch>
      <Toaster />
      {/* Floating AI Assistant - available on all pages */}
      <FinancialAssistant />
      </CurrencyProvider>
    </QueryClientProvider>
  );
}

export default App;
