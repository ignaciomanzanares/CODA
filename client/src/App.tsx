import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/api";

import Header from "./components/Header";
import Footer from "./components/Footer";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import Products from "@/pages/Products";
import Goals from "@/pages/Goals";
import Plan from "@/pages/Plan";
import Profile from "@/pages/Profile";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Onboarding} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/products" component={Products} />
      <Route path="/goals" component={Goals} />
      <Route path="/plan" component={Plan} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-grow py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <Router />
            </div>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
