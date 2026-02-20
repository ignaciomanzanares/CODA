import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
              Algo salió mal
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              La página no pudo cargarse correctamente. Prueba a recargar.
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Recargar página
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
