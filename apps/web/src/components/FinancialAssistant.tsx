import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageCircle, 
  Send, 
  Bot, 
  User, 
  Sparkles,
  X,
  Minimize2,
  Maximize2,
  Loader2,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  actionItems?: { title: string; description: string; link?: string }[];
  timestamp: Date;
}

interface FinancialAssistantProps {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean; // If true, renders as a card instead of floating
}

export default function FinancialAssistant({ 
  isOpen: externalIsOpen, 
  onClose,
  embedded = false 
}: FinancialAssistantProps) {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(externalIsOpen ?? false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external open state
  useEffect(() => {
    if (externalIsOpen !== undefined) {
      setIsOpen(externalIsOpen);
    }
  }, [externalIsOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const { data: insightsData } = useQuery({
    queryKey: ['assistant-insights'],
    queryFn: async () => {
      const token = localStorage.getItem('jwt_token');
      if (!token) return { insights: [] as string[] };
      return await apiFetch('/api/assistant/insights', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isOpen && isAuthenticated,
  });

  const {
    data: bootstrapData,
    isFetching: bootstrapLoading,
    isError: bootstrapError,
  } = useQuery({
    queryKey: ['assistant-bootstrap'],
    queryFn: async () => {
      const token = localStorage.getItem('jwt_token');
      if (!token) throw new Error('no token');
      return apiFetch('/api/assistant/bootstrap', {
        headers: { Authorization: `Bearer ${token}` },
      }) as Promise<{ welcome: string; chips: string[] }>;
    },
    enabled: isOpen && isAuthenticated,
  });

  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (prevAuthRef.current !== isAuthenticated) {
      setMessages([]);
      prevAuthRef.current = isAuthenticated;
    }
  }, [isAuthenticated]);

  // Send message to AI
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => (Array.isArray(prev) ? [...prev, userMessage] : [userMessage]));
    setInputValue("");
    setIsLoading(true);

    try {
      const token = localStorage.getItem('jwt_token');
      const response = await apiFetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          message: content.trim(),
          conversationHistory: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.message,
        suggestions: response.suggestions,
        actionItems: response.actionItems,
        timestamp: new Date(),
      };

      setMessages(prev => (Array.isArray(prev) ? [...prev, assistantMessage] : [assistantMessage]));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      const fallbackMessage: Message = {
        role: 'assistant',
        content: `No se pudo obtener respuesta del servidor (${msg}). Revisa tu conexión o la configuración de la API de IA.`,
        suggestions: [],
        timestamp: new Date(),
      };
      setMessages(prev => (Array.isArray(prev) ? [...prev, fallbackMessage] : [fallbackMessage]));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!isOpen || messages.length > 0) return;
    if (!isAuthenticated) {
      setMessages([
        {
          role: 'assistant',
          content:
            'Inicia sesión para que el asistente use **tus gastos, cartolas y cuentas** cargadas en CODA. Sin sesión no hay datos personales que analizar.',
          suggestions: [],
          timestamp: new Date(),
        },
      ]);
      return;
    }
    if (bootstrapError) {
      setMessages([
        {
          role: 'assistant',
          content:
            'No se pudo cargar tu resumen financiero. Escribe tu pregunta y, si el servidor tiene IA configurada, intentaremos responder con el contexto disponible.',
          suggestions: [],
          timestamp: new Date(),
        },
      ]);
      return;
    }
    if (bootstrapData) {
      setMessages([
        {
          role: 'assistant',
          content: bootstrapData.welcome,
          suggestions: bootstrapData.chips?.length ? bootstrapData.chips : undefined,
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen, isAuthenticated, bootstrapData, bootstrapError, messages.length]);

  // Floating chat button (when not embedded)
  if (!embedded && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-6 z-50 flex items-center gap-2.5 bg-gradient-to-r from-primary to-blue-600 text-primary-foreground rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 transition-all px-4 h-13 py-3"
        style={{ bottom: "max(1.5rem, var(--sab, 0px))" }}
        aria-label="Abrir asistente financiero"
      >
        <div className="relative">
          <MessageCircle className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-primary animate-pulse" />
        </div>
        <span className="text-sm font-semibold whitespace-nowrap">Asistente IA</span>
      </button>
    );
  }

  // Chat content
  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary to-blue-600 text-white rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Asistente Financiero</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <p className="text-xs text-blue-100">Con tecnología de IA · En línea</p>
            </div>
          </div>
        </div>
        {!embedded && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Messages */}
      {!isMinimized && (
        <>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {isAuthenticated && bootstrapLoading && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Cargando tu contexto financiero…</p>
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' && "flex-row-reverse"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    message.role === 'assistant' 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  )}>
                    {message.role === 'assistant' 
                      ? <Sparkles className="h-4 w-4" /> 
                      : <User className="h-4 w-4" />
                    }
                  </div>

                  {/* Message Content */}
                  <div className={cn(
                    "max-w-[80%] space-y-2 min-w-0",
                    message.role === 'user' && "text-right"
                  )}>
                    <div className={cn(
                      "rounded-2xl px-4 py-3 text-sm break-words overflow-hidden",
                      message.role === 'assistant'
                        ? "bg-muted rounded-tl-sm"
                        : "bg-primary text-primary-foreground rounded-tr-sm"
                    )}>
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none [&_*]:break-words"
                        dangerouslySetInnerHTML={{
                          __html: message.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
                            .replace(/•/g, '&bull;')
                        }}
                      />
                    </div>

                    {/* Action Items */}
                    {message.actionItems && message.actionItems.length > 0 && (
                      <div className="space-y-2 mt-2">
                        {message.actionItems.map((item, i) => (
                          <Link key={i} href={item.link || '#'}>
                            <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer">
                              <Lightbulb className="h-4 w-4 text-primary flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{item.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                              </div>
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {message.suggestions.map((suggestion, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleSuggestionClick(suggestion)}
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-xs text-muted-foreground mt-1">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {/* Loading indicator — three dots */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick Insights */}
          {isAuthenticated && insightsData?.insights?.length && messages.length === 1 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground mb-2">Ideas según tus datos:</p>
              <div className="flex flex-wrap gap-2">
                {insightsData.insights.slice(0, 3).map((insight: string, i: number) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="text-xs cursor-pointer hover:bg-secondary/80 max-w-[220px] truncate"
                    onClick={() => handleSuggestionClick(`Amplía: ${insight}`)}
                    title={insight}
                  >
                    {insight.length > 70 ? `${insight.slice(0, 70)}…` : insight}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t bg-muted/30">
            <div className="flex gap-2 items-center bg-background rounded-xl border px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isAuthenticated ? "Pregunta sobre tus finanzas…" : "Escribe tu pregunta…"}
                disabled={isLoading}
                className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 text-sm"
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit(e as any)}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim() || isLoading}
                className="h-8 w-8 shrink-0 rounded-lg"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <Link href={ROUTES.iniciarSesion} className="text-primary hover:underline">Inicia sesión</Link>
                {' '}para consejos personalizados basados en tus datos
              </p>
            )}
          </form>
        </>
      )}
    </>
  );

  // Embedded mode (in a card)
  if (embedded) {
    return (
      <Card className="flex flex-col h-[500px]">
        {chatContent}
      </Card>
    );
  }

  // Floating mode
  return (
    <div
      className={cn(
        "fixed right-4 sm:right-6 z-50 transition-all duration-300",
        isMinimized ? "w-72" : "w-[calc(100vw-2rem)] sm:w-96"
      )}
      style={{ bottom: "max(1.5rem, var(--sab, 0px))" }}
    >
      <Card className={cn(
        "flex flex-col shadow-2xl",
        isMinimized ? "h-auto" : "h-[500px]"
      )}>
        {chatContent}
      </Card>
    </div>
  );
}

// Export a button component that opens the assistant
export function AssistantButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        className="gap-2"
      >
        <Bot className="h-4 w-4" />
        Consultar asistente
      </Button>
      {isOpen && (
        <FinancialAssistant 
          isOpen={isOpen} 
          onClose={() => setIsOpen(false)} 
        />
      )}
    </>
  );
}
