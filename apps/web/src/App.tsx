import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { ROUTES } from "@/lib/routes";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { CurrencyProvider } from "./lib/CurrencyContext";
import { UploadDrawerProvider, useUploadDrawer } from "./contexts/UploadDrawerContext";
import UniversalUploadDrawer from "./components/UniversalUploadDrawer";

import Header from "./components/Header";
import Footer from "./components/Footer";
import PWAInstallBanner from "./components/PWAInstallBanner";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import PageLoader from "./components/PageLoader";
import { Toaster } from "@/components/ui/toaster";
import Login from "@/pages/Login";
import SignUp from "@/pages/SignUp";
import Landing from "@/pages/Landing";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import SessionExpiryGuard from "@/components/SessionExpiryGuard";
import SeoHelmet from "@/components/SeoHelmet";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useKeepAlive } from "@/hooks/useKeepAlive";
import { FEATURES } from "@/config/features";

function VisualViewportRootSync() {
  useVisualViewportHeight();
  return null;
}

function BrowserNotificationsInit() {
  useBrowserNotifications();
  return null;
}

function KeepAliveInit() {
  useKeepAlive();
  return null;
}

const About = lazy(() => import("@/pages/About"));
const CreditScoreInfo = lazy(() => import("@/pages/CreditScoreInfo"));
const FinancialGoalsInfo = lazy(() => import("@/pages/FinancialGoalsInfo"));
const ProductComparisonInfo = lazy(() => import("@/pages/ProductComparisonInfo"));
const PrivacyPolicy = lazy(() => import("@/pages/legal/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("@/pages/legal/TermsAndConditions"));
const Empresas = lazy(() => import("@/pages/Empresas"));
const EmpresasLayout = lazy(() => import("@/pages/empresas/EmpresasLayout"));
const EmpresasDashboard = lazy(() => import("@/pages/empresas/EmpresasDashboard"));
const EmpresasCompanies = lazy(() => import("@/pages/empresas/EmpresasCompanies"));
const EmpresasTransactions = lazy(() => import("@/pages/empresas/EmpresasTransactions"));
const EmpresasReconciliation = lazy(() => import("@/pages/empresas/EmpresasReconciliation"));
const EmpresasStatements = lazy(() => import("@/pages/empresas/EmpresasStatements"));
const EmpresasRisk = lazy(() => import("@/pages/empresas/EmpresasRisk"));
const EmpresasDocuments = lazy(() => import("@/pages/empresas/EmpresasDocuments"));
const EmpresasProducts = lazy(() => import("@/pages/empresas/EmpresasProducts"));
const EmpresasPurchaseOrders = lazy(() => import("@/pages/empresas/EmpresasPurchaseOrders"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const OnboardingFlow = lazy(() => import("@/pages/OnboardingFlow"));
const Products = lazy(() => import("@/pages/Products"));
const Goals = lazy(() => import("@/pages/Goals"));
const Plan = lazy(() => import("@/pages/Plan"));
const Profile = lazy(() => import("@/pages/Profile"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Movimientos = lazy(() => import("@/pages/Movimientos"));
const ConsentConnections = lazy(() => import("@/pages/ConsentConnections"));
const EmailInviteHandler = lazy(() => import("@/pages/EmailInviteHandler"));
const ShareBillSplit = lazy(() => import("@/pages/ShareBillSplit"));
const AuditDashboard = lazy(() => import("@/pages/AuditDashboard"));
const ProductMetrics = lazy(() => import("@/pages/ProductMetrics"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const FinancialAssistant = lazy(() => import("@/components/FinancialAssistant"));
const LegacySplitRedirect = lazy(() => import("@/components/LegacySplitRedirect"));
const NotFound = lazy(() => import("@/pages/not-found"));
const BillSplit = lazy(() => import("@/pages/BillSplit"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const SaludFinanciera = lazy(() => import("@/pages/SaludFinanciera"));
const MisActivos = lazy(() => import("@/pages/MisActivos"));

function UploadDrawerGlobal() {
  const { open, setOpen } = useUploadDrawer();
  return <UniversalUploadDrawer open={open} onOpenChange={setOpen} />;
}

function App() {
  return (
    <ErrorBoundary pageLevel>
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
      <UploadDrawerProvider>
      <SessionExpiryGuard />
      <VisualViewportRootSync />
      <BrowserNotificationsInit />
      <KeepAliveInit />
      <SeoHelmet />
      <Suspense fallback={<PageLoader />}>
        <Switch>
        {/* Landing page - custom layout */}
        <Route path="/">
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <PWAInstallBanner />
            <main className="flex-1">
              <Landing />
            </main>
            <Footer />
          </div>
        </Route>

        {/* Public routes (español + alias en inglés) */}
        <Route path={ROUTES.iniciarSesion} component={Login} />
        <Route path="/login" component={Login} />
        {FEATURES.codaEmpresas && <Route path="/empresas/login" component={Login} />}
        <Route path={ROUTES.restablecerContrasena} component={ResetPassword} />
        {/* Con el flag de onboarding, el registro es el wizard paso-a-paso
            (Términos → Identidad → 2FA → Crear cuenta). Sin flag, el signup normal. */}
        <Route path={ROUTES.registro} component={FEATURES.onboarding ? OnboardingFlow : SignUp} />
        <Route path="/signup" component={FEATURES.onboarding ? OnboardingFlow : SignUp} />
        <Route path={ROUTES.acerca} component={About} />
        <Route path="/about">
          <Redirect to={ROUTES.acerca} />
        </Route>
        <Route path="/nosotros">
          <Redirect to={ROUTES.acerca} />
        </Route>
        {FEATURES.codaEmpresas && <Route path="/empresas" component={Empresas} />}
        <Route path={ROUTES.infoScoreCredito} component={CreditScoreInfo} />
        <Route path="/info/credit-score">
          <Redirect to={ROUTES.infoScoreCredito} />
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

        {/* Onboarding de primer ingreso (flag): full-screen, sin header/footer.
            skipOnboardingGate evita que el propio flujo se redirija a sí mismo. */}
        {FEATURES.onboarding && (
          <Route path={ROUTES.verificacion}>
            <ProtectedRoute skipOnboardingGate>
              <div className="min-h-screen">
                <OnboardingFlow />
                <Toaster />
              </div>
            </ProtectedRoute>
          </Route>
        )}

        {/* All other routes with header/footer and protection */}
        <Route>
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <PWAInstallBanner />
            <main className="flex-1">
              <RouteErrorBoundary>
                <Switch>
                  <Route path={ROUTES.bienvenida} component={Onboarding} />
                  <Route path="/onboarding">
                    <Redirect to={ROUTES.bienvenida} />
                  </Route>
                  {/* CODA Empresas: sesión independiente de Personal — gated by flag,
                      requires separate CMF authorization aligned to giro exclusivo (Ley 21.521) */}
                  {FEATURES.codaEmpresas && (
                    <>
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
                    </>
                  )}
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
                    <Redirect to={ROUTES.movimientos} />
                  </Route>
                  <Route path="/expenses">
                    <Redirect to={ROUTES.movimientos} />
                  </Route>
                  <Route path={ROUTES.dividirCuenta}>
                    <Redirect to={`${ROUTES.movimientos}?tab=dividir`} />
                  </Route>
                  <Route path="/bill-split">
                    <Redirect to={`${ROUTES.movimientos}?tab=dividir`} />
                  </Route>
                  <Route path={ROUTES.admin}>
                    <AdminRoute>
                      <AdminDashboard />
                    </AdminRoute>
                  </Route>
                  <Route path={ROUTES.auditoria}>
                    <AdminRoute>
                      <AuditDashboard />
                    </AdminRoute>
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
                    <AdminRoute>
                      <ProductMetrics />
                    </AdminRoute>
                  </Route>
                  <Route path="/products/metrics">
                    <Redirect to={ROUTES.productosMetricas} />
                  </Route>
                  <Route path={ROUTES.metas}>
                    <Redirect to={ROUTES.plan} />
                  </Route>
                  <Route path="/goals">
                    <Redirect to={ROUTES.plan} />
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
                  <Route path={ROUTES.saludFinanciera}>
                    <ProtectedRoute>
                      <SaludFinanciera />
                    </ProtectedRoute>
                  </Route>
                  <Route path={ROUTES.misActivos}>
                    <ProtectedRoute>
                      <MisActivos />
                    </ProtectedRoute>
                  </Route>
                  <Route component={NotFound} />
                </Switch>
              </RouteErrorBoundary>
            </main>
            <Footer />
          </div>
        </Route>
      </Switch>
      </Suspense>
      <Toaster />
      <PWAUpdatePrompt />
      <Suspense fallback={null}>
        <FinancialAssistant />
      </Suspense>
      <UploadDrawerGlobal />
      </UploadDrawerProvider>
      </CurrencyProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
