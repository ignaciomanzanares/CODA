import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, WifiOff } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Full-page centered layout instead of inline card */
  pageLevel?: boolean;
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
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const offline = typeof navigator !== "undefined" && !navigator.onLine;

    if (this.props.pageLevel) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center">
            {offline ? (
              <WifiOff className="h-8 w-8 text-amber-500" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            )}
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-semibold text-foreground">
              {offline ? "Sin conexión" : "Algo salió mal"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {offline
                ? "No se pudo cargar esta vista. Vuelve a intentarlo cuando recuperes internet."
                : "Esta página encontró un error inesperado. Puedes volver al panel o recargar la página."}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                window.location.href = "/panel";
              }}
            >
              <Home className="h-4 w-4" />
              Ir al panel
            </Button>
            <Button className="gap-2" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              Recargar
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-6 space-y-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm font-semibold">Algo salió mal</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Este componente no pudo cargarse correctamente.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => this.setState({ hasError: false, error: null })}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </Button>
      </div>
    );
  }
}
