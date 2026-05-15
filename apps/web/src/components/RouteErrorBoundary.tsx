import { type ReactNode } from "react";
import { useLocation } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";

/**
 * Wraps ErrorBoundary with the current route as key so any caught error
 * is automatically cleared when the user navigates to a different page.
 */
export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location} pageLevel>
      {children}
    </ErrorBoundary>
  );
}
