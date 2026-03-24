import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { ROUTES } from "@/lib/routes";
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
import FinancialGoalsInfo from "@/pages/FinancialGoalsInfo";
import ProductComparisonInfo from "@/pages/ProductComparisonInfo";
import PrivacyPolicy from "@/pages/legal/PrivacyPolicy";
import TermsAndConditions from "@/pages/legal/TermsAndConditions";
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
import ProductMetrics from "@/pages/ProductMetrics";
import FinancialAssistant from "@/components/FinancialAssistant";
import ErrorBoundary from "@/components/ErrorBoundary";
import LegacySplitRedirect from "@/components/LegacySplitRedirect";
import SeoHelmet from "@/components/SeoHelmet";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";

const BillSplit = lazy(() => import("@/pages/BillSplit"));


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
      <SeoHelmet />
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

        {/* Public routes (español + alias en inglés) */}
        <Route path={ROUTES.iniciarSesion} component={Login} />
        <Route path="/login" component={Login} />
        <Route path="/empresas/login" component={Login} />
        <Route path={ROUTES.registro} component={SignUp} />
        <Route path="/signup" component={SignUp} />
        <Route path={ROUTES.acerca} component={About} />
        <Route path="/about">
          <Redirect to={ROUTES.acerca} />
        </Route>
        <Route path="/empresas" component={Empresas} />
        <Route path={ROUTES.infoScoreCredito} component={CreditScoreInfo} />
        <Route path="/info/credit-score">
          <Redirect to={ROUTES.infoScoreCredito} />
        </Route>
        <Route path={ROUTES.infoRiesgoSeguros} component={InsuranceRiskInfo} />
        <Route path="/info/insurance-risk">
          <Redirect to={ROUTES.infoRiesgoSeguros} />
        </Route>
        <Route path={ROUTES.infoMetasFinancieras} component={FinancialGoalsInfo} />
        <Route path="/info/financial-goals">
          <Redirect to={ROUTES.infoMetasFinancieras} />
        </Route>
        <Route path={ROUTES.infoComparacionProductos} component={ProductComparisonInfo} />
        <Route path="/info/product-comparison">
          <Redirect to={ROUTES.infoComparacionProductos} />
        </Route>
        <Route path={ROUTES.privacidad} component={PrivacyPolicy} />
        <Route path={ROUTES.terminos} component={TermsAndConditions} />
        <Route path="/privacy">
          <Redirect to={ROUTES.privacidad} />
        </Route>
        <Route path="/terms">
          <Redirect to={ROUTES.terminos} />
        </Route>
        
        {/* Special route for email invitations - no header/footer */}
        <Route path={ROUTES.invitacion}>
          <div className="min-h-screen">
            <EmailInviteHandler />
            <Toaster />
          </div>
        </Route>
        <Route path="/invite">
          <Redirect to={ROUTES.invitacion} />
        </Route>
        
        {/* Compartir dividir cuenta: alias antiguo /split/:code → /dividir/:codigo */}
        <Route path="/split/:code" component={LegacySplitRedirect} />
        <Route path="/dividir/:codigo">
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
                  <Route path={ROUTES.bienvenida} component={Onboarding} />
                  <Route path="/onboarding">
                    <Redirect to={ROUTES.bienvenida} />
                  </Route>
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
                  <Route path={ROUTES.panel}>
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/dashboard">
                    <Redirect to={ROUTES.panel} />
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
                  <Route path={ROUTES.gastos}>
                    <ProtectedRoute>
                      <Expenses />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/expenses">
                    <Redirect to={ROUTES.gastos} />
                  </Route>
                  <Route path={ROUTES.dividirCuenta}>
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
                  <Route path="/bill-split">
                    <Redirect to={ROUTES.dividirCuenta} />
                  </Route>
                  <Route path={ROUTES.auditoria}>
                    <ProtectedRoute>
                      <AuditDashboard />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/audit">
                    <Redirect to={ROUTES.auditoria} />
                  </Route>
                  <Route path={ROUTES.productos}>
                    <ProtectedRoute>
                      <Products />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/products">
                    <Redirect to={ROUTES.productos} />
                  </Route>
                  <Route path={ROUTES.productosMetricas}>
                    <ProtectedRoute>
                      <ProductMetrics />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/products/metrics">
                    <Redirect to={ROUTES.productosMetricas} />
                  </Route>
                  <Route path={ROUTES.metas}>
                    <ProtectedRoute>
                      <Goals />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/goals">
                    <Redirect to={ROUTES.metas} />
                  </Route>
                  <Route path="/plan">
                    <ProtectedRoute>
                      <Plan />
                    </ProtectedRoute>
                  </Route>
                  <Route path={ROUTES.perfil}>
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/profile">
                    <Redirect to={ROUTES.perfil} />
                  </Route>
                  <Route component={NotFound} />
                </Switch>
            </main>
            <Footer />
          </div>
        </Route>
      </Switch>
      <Toaster />
      <PWAUpdatePrompt />
      {/* Floating AI Assistant - available on all pages */}
      <FinancialAssistant />
      </CurrencyProvider>
    </QueryClientProvider>
  );
}

export default App;
