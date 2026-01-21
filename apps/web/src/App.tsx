import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import Products from "@/pages/Products";
import Goals from "@/pages/Goals";
import Plan from "@/pages/Plan";
import Profile from "@/pages/Profile";
import Expenses from "@/pages/Expenses";
import BillSplit from "@/pages/BillSplit";
import EmailInviteHandler from "@/pages/EmailInviteHandler";
import ShareBillSplit from "@/pages/ShareBillSplit";


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        {/* Public routes */}
        <Route path="/login" component={Login} />
        
        {/* Special route for email invitations - no header/footer */}
        <Route path="/invite">
          <div className="min-h-screen">
            <EmailInviteHandler />
            <Toaster />
          </div>
        </Route>
        
        {/* Public route for shared bill splits - no auth required */}
        <Route path="/split/:code">
          {(params) => (
            <div className="min-h-screen">
              <ShareBillSplit code={params.code} />
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
                  <Route path="/" component={Onboarding} />
                  <Route path="/dashboard">
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/expenses">
                    <ProtectedRoute>
                      <Expenses />
                    </ProtectedRoute>
                  </Route>
                  <Route path="/bill-split">
                    <ProtectedRoute>
                      <BillSplit />
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
    </QueryClientProvider>
  );
}

export default App;
