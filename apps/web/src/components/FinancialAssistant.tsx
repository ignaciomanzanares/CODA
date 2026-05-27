import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Target,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Shield,
  Calculator,
  Wallet,
  BarChart3,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, getPersonalToken } from "@/lib/auth";
import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";

// ── Types ────────────────────────────────────────────────────────────────────

interface ActionItem {
  title: string;
  description: string;
  link?: string;
  icon?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
  actionItems?: ActionItem[];
  timestamp: Date;
  isStreaming?: boolean;
  // Etiqueta visible cuando el modelo está corriendo una tool call.
  toolStatus?: string | null;
  // Proveedor que respondió (groq / gemini / anthropic / openai). Para feedback.
  provider?: string;
  // Pregunta del usuario que provocó esta respuesta. Para feedback.
  userPrompt?: string;
  // Estado del thumbs up/down ya enviado por el usuario.
  feedback?: "up" | "down" | null;
}

// Etiquetas amigables (es-CL) para cada herramienta del backend.
const TOOL_LABELS: Record<string, string> = {
  query_transactions: "Consultando tus transacciones…",
  simulate_loan: "Simulando el crédito…",
};

function toolLabelFor(name: string): string {
  return TOOL_LABELS[name] ?? "Ejecutando herramienta…";
}

interface FinancialAssistantProps {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

// ── Icon map for action items ────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ElementType> = {
  target: Target,
  "piggy-bank": PiggyBank,
  "credit-card": CreditCard,
  "trending-up": TrendingUp,
  shield: Shield,
  calculator: Calculator,
  wallet: Wallet,
  "bar-chart": BarChart3,
};

// ── SSE streaming helper ─────────────────────────────────────────────────────

function getApiBase(): string {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
        ?.VITE_API_URL) ||
    ""
  );
}

interface StreamCallbacks {
  onChunk: (text: string) => void;
  onToolStart: (name: string) => void;
  onToolEnd: (name: string) => void;
  onDone: (data: {
    suggestions?: string[];
    actionItems?: ActionItem[];
    message?: string;
    provider?: string;
  }) => void;
  onError: (msg: string) => void;
}

async function streamChat(
  message: string,
  conversationHistory: { role: string; content: string }[],
  token: string | null,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const apiBase = getApiBase();
  const url = apiBase
    ? `${apiBase.replace(/\/$/, "")}/api/assistant/chat/stream`
    : "/api/assistant/chat/stream";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ message, conversationHistory }),
      signal,
    });

    if (!res.ok) {
      callbacks.onError("Error del servidor. Intenta de nuevo.");
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError("Sin respuesta del servidor.");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "chunk" && parsed.content) {
            callbacks.onChunk(parsed.content);
          } else if (parsed.type === "tool_start" && parsed.name) {
            callbacks.onToolStart(parsed.name);
          } else if (parsed.type === "tool_end" && parsed.name) {
            callbacks.onToolEnd(parsed.name);
          } else if (parsed.type === "done") {
            callbacks.onDone({
              suggestions: parsed.suggestions,
              actionItems: parsed.actionItems,
              message: parsed.message,
              provider: parsed.provider,
            });
          } else if (parsed.type === "error") {
            callbacks.onError(parsed.content || "Error inesperado.");
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    callbacks.onError("No se pudo conectar. Revisa tu conexión.");
  }
}

// ── Markdown rendering ───────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  // Strip the trailing "PREGUNTAS:" suggestion line so it never appears in the bubble,
  // even while the response is still streaming and we haven't parsed it yet.
  let cleaned = text.replace(/\n?PREGUNTAS:\s*[^\n]*$/i, "").trim();
  // Si el modelo solo emitió la línea PREGUNTAS (sin cuerpo), no dejamos una
  // burbuja vacía — mostramos un fallback amable.
  if (!cleaned && text.trim().length > 0) {
    cleaned = "¡Hola! ¿En qué te puedo ayudar?";
  }
  return cleaned
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "&bull; $1")
    .replace(/\n/g, "<br/>")
    .replace(/•/g, "&bull;");
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FinancialAssistant({
  isOpen: externalIsOpen,
  onClose,
  embedded = false,
}: FinancialAssistantProps) {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(externalIsOpen ?? false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync external open state
  useEffect(() => {
    if (externalIsOpen !== undefined) setIsOpen(externalIsOpen);
  }, [externalIsOpen]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Insights for badges
  const { data: insightsData } = useQuery({
    queryKey: ["assistant-insights"],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token) return { insights: [] as string[] };
      return await apiFetch("/api/assistant/insights", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isOpen && isAuthenticated,
  });

  // Bootstrap
  const {
    data: bootstrapData,
    isFetching: bootstrapLoading,
    isError: bootstrapError,
  } = useQuery({
    queryKey: ["assistant-bootstrap"],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token) throw new Error("no token");
      return apiFetch("/api/assistant/bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
      }) as Promise<{ welcome: string; chips: string[] }>;
    },
    enabled: isOpen && isAuthenticated,
  });

  // Reset messages on auth change
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (prevAuthRef.current !== isAuthenticated) {
      setMessages([]);
      prevAuthRef.current = isAuthenticated;
    }
  }, [isAuthenticated]);

  // ── Send message via SSE stream ──
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");
      setIsLoading(true);

      // Add placeholder for assistant response
      const streamingMsg: ChatMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        userPrompt: content.trim(),
      };
      setMessages((prev) => [...prev, streamingMsg]);

      const token = getPersonalToken();
      const history = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Abort controller for cancellation
      abortRef.current = new AbortController();

      await streamChat(
        content.trim(),
        history,
        token,
        {
          onChunk: (text) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant" && last.isStreaming) {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + text,
                  // Una vez llega texto, ocultar el indicador de tool — el
                  // modelo ya terminó esa fase y está componiendo respuesta.
                  toolStatus: null,
                };
              }
              return updated;
            });
          },
          onToolStart: (name) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant" && last.isStreaming) {
                updated[updated.length - 1] = {
                  ...last,
                  toolStatus: toolLabelFor(name),
                };
              }
              return updated;
            });
          },
          onToolEnd: () => {
            // No limpiamos aquí — dejamos el indicador visible hasta que
            // empiece a llegar texto (que es cuando el modelo retoma).
          },
          onDone: (data) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  // If the model returned structured JSON, use the clean message
                  content: data.message || last.content,
                  suggestions: data.suggestions,
                  actionItems: data.actionItems,
                  provider: data.provider,
                  isStreaming: false,
                  toolStatus: null,
                };
              }
              return updated;
            });
            setIsLoading(false);
          },
          onError: (msg) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant" && last.isStreaming) {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content || msg,
                  isStreaming: false,
                  toolStatus: null,
                  suggestions: [
                    "Intenta de nuevo",
                    "¿Cómo puedo ahorrar?",
                    "Analiza mis gastos",
                  ],
                };
              }
              return updated;
            });
            setIsLoading(false);
          },
        },
        abortRef.current.signal,
      );

      // If streaming never triggered onDone (edge case), clean up
      setIsLoading(false);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.isStreaming) {
          updated[updated.length - 1] = { ...last, isStreaming: false };
        }
        return updated;
      });
    },
    [isLoading, messages],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const submitFeedback = useCallback(
    async (messageIndex: number, rating: "up" | "down") => {
      const msg = messages[messageIndex];
      if (!msg || msg.role !== "assistant" || msg.feedback || !msg.userPrompt) return;

      // Optimista: actualizar UI antes del fetch.
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[messageIndex]) {
          updated[messageIndex] = { ...updated[messageIndex], feedback: rating };
        }
        return updated;
      });

      const token = getPersonalToken();
      if (!token) return; // sin sesión no se envía; el UI ya quedó marcado

      try {
        await apiFetch("/api/assistant/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rating,
            userMessage: msg.userPrompt,
            assistantMessage: msg.content,
            provider: msg.provider,
          }),
        });
      } catch {
        // Si falla, revertir el feedback local.
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[messageIndex]) {
            updated[messageIndex] = { ...updated[messageIndex], feedback: null };
          }
          return updated;
        });
      }
    },
    [messages],
  );

  const handleClose = () => {
    abortRef.current?.abort();
    setIsOpen(false);
    onClose?.();
  };

  const handleClearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
  };

  // Bootstrap welcome message
  useEffect(() => {
    if (!isOpen || messages.length > 0) return;
    if (!isAuthenticated) {
      setMessages([
        {
          role: "assistant",
          content:
            "¡Hola! 👋 Soy el asistente financiero de CODA.\n\n**Inicia sesión** para que pueda analizar tus gastos, cartolas y cuentas. Sin sesión solo puedo responder preguntas generales sobre finanzas.",
          suggestions: [
            "¿Qué es un score crediticio?",
            "¿Cómo funciona la UF?",
            "Consejos para ahorrar",
          ],
          timestamp: new Date(),
        },
      ]);
      return;
    }
    if (bootstrapError) {
      setMessages([
        {
          role: "assistant",
          content:
            "No se pudo cargar tu resumen financiero. Escribe tu pregunta y haré lo posible con la información disponible.",
          suggestions: [
            "Resume mis finanzas",
            "¿Cómo puedo ahorrar?",
            "¿Qué productos me convienen?",
          ],
          timestamp: new Date(),
        },
      ]);
      return;
    }
    if (bootstrapData) {
      setMessages([
        {
          role: "assistant",
          content: bootstrapData.welcome,
          suggestions: bootstrapData.chips?.length
            ? bootstrapData.chips
            : undefined,
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen, isAuthenticated, bootstrapData, bootstrapError, messages.length]);

  // ── Floating button ──
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
        <span className="text-sm font-semibold whitespace-nowrap">
          Asistente IA
        </span>
      </button>
    );
  }

  // ── Chat content ──
  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary to-blue-600 text-white rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">CODA AI</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <p className="text-xs text-blue-100">
                Asistente financiero · En línea
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/20"
              onClick={handleClearChat}
              title="Limpiar conversación"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {!embedded && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? (
                  <Maximize2 className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      {!isMinimized && (
        <>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {isAuthenticated &&
                bootstrapLoading &&
                messages.length === 0 && (
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
                    message.role === "user" && "flex-row-reverse",
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      message.role === "assistant"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>

                  {/* Message Content */}
                  <div
                    className={cn(
                      "max-w-[80%] space-y-2 min-w-0",
                      message.role === "user" && "text-right",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 text-sm break-words overflow-hidden",
                        message.role === "assistant"
                          ? "bg-muted rounded-tl-sm"
                          : "bg-primary text-primary-foreground rounded-tr-sm",
                      )}
                    >
                      <div
                        className={cn(
                          "prose prose-sm max-w-none [&_*]:break-words",
                          message.role === "user"
                            ? "text-primary-foreground [&_*]:text-primary-foreground prose-headings:text-primary-foreground prose-strong:text-primary-foreground prose-code:text-primary-foreground"
                            : "dark:prose-invert",
                        )}
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(message.content),
                        }}
                      />
                      {/* Tool status chip — visible mientras corre una tool call */}
                      {message.isStreaming && message.toolStatus && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>{message.toolStatus}</span>
                        </div>
                      )}
                      {/* Streaming cursor */}
                      {message.isStreaming && !message.toolStatus && (
                        <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                      )}
                    </div>

                    {/* Action Items */}
                    {message.actionItems &&
                      message.actionItems.length > 0 && (
                        <div className="space-y-2 mt-2">
                          {message.actionItems.map((item, i) => {
                            const IconComp =
                              (item.icon && ACTION_ICONS[item.icon]) ||
                              Lightbulb;
                            return (
                              <Link key={i} href={item.link || "#"}>
                                <div className="flex items-center gap-2 p-2.5 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer border border-primary/10">
                                  <IconComp className="h-4 w-4 text-primary flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">
                                      {item.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {item.description}
                                    </p>
                                  </div>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                    {/* Suggestions */}
                    {message.suggestions &&
                      message.suggestions.length > 0 &&
                      !message.isStreaming && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {message.suggestions.map((suggestion, i) => (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              className="text-xs h-auto py-1.5 px-3 whitespace-normal text-left"
                              onClick={() => handleSuggestionClick(suggestion)}
                              disabled={isLoading}
                            >
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      )}

                    {/* Timestamp + thumbs feedback (solo en respuestas reales del asistente) */}
                    {!message.isStreaming && (
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {message.role === "assistant" && message.userPrompt && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => submitFeedback(index, "up")}
                              disabled={!!message.feedback}
                              className={cn(
                                "p-1 rounded transition-colors",
                                message.feedback === "up"
                                  ? "text-primary"
                                  : "text-muted-foreground/60 hover:text-primary hover:bg-primary/10",
                                message.feedback && message.feedback !== "up" && "opacity-30",
                              )}
                              aria-label="Buena respuesta"
                              title="Buena respuesta"
                            >
                              <ThumbsUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => submitFeedback(index, "down")}
                              disabled={!!message.feedback}
                              className={cn(
                                "p-1 rounded transition-colors",
                                message.feedback === "down"
                                  ? "text-destructive"
                                  : "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10",
                                message.feedback && message.feedback !== "down" && "opacity-30",
                              )}
                              aria-label="Respuesta no útil"
                              title="Respuesta no útil"
                            >
                              <ThumbsDown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick Insights */}
          {isAuthenticated &&
            insightsData?.insights?.length > 0 &&
            messages.length === 1 && (
              <div className="px-4 pb-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Insights rápidos:
                </p>
                <div className="flex flex-wrap gap-2">
                  {insightsData.insights
                    .slice(0, 3)
                    .map((insight: string, i: number) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="text-xs cursor-pointer hover:bg-secondary/80 max-w-[220px] truncate"
                        onClick={() =>
                          handleSuggestionClick(`Amplía: ${insight}`)
                        }
                        title={insight}
                      >
                        {insight.length > 70
                          ? `${insight.slice(0, 70)}…`
                          : insight}
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
                placeholder={
                  isAuthenticated
                    ? "Pregunta sobre tus finanzas…"
                    : "Escribe tu pregunta…"
                }
                disabled={isLoading}
                className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 text-sm"
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  handleSubmit(e as unknown as React.FormEvent)
                }
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim() || isLoading}
                className="h-8 w-8 shrink-0 rounded-lg"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <Link
                  href={ROUTES.iniciarSesion}
                  className="text-primary hover:underline"
                >
                  Inicia sesión
                </Link>{" "}
                para consejos personalizados basados en tus datos
              </p>
            )}
          </form>
        </>
      )}
    </>
  );

  // Embedded mode
  if (embedded) {
    return (
      <Card className="flex flex-col h-[500px]">{chatContent}</Card>
    );
  }

  // Floating mode
  return (
    <div
      className={cn(
        "fixed right-4 sm:right-6 z-50 transition-all duration-300",
        isMinimized ? "w-72" : "w-[calc(100vw-2rem)] sm:w-96",
      )}
      style={{ bottom: "max(1.5rem, var(--sab, 0px))" }}
    >
      <Card
        className={cn(
          "flex flex-col shadow-2xl",
          isMinimized ? "h-auto" : "h-[min(550px,calc(100dvh-6rem))]",
        )}
      >
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
      <Button onClick={() => setIsOpen(true)} variant="outline" className="gap-2">
        <Bot className="h-4 w-4" />
        Consultar asistente
      </Button>
      {isOpen && (
        <FinancialAssistant isOpen={isOpen} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
