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

  // Fetch quick insights for initial suggestions
  const { data: insightsData } = useQuery({
    queryKey: ['assistant-insights'],
    queryFn: async () => {
      const endpoint = isAuthenticated ? '/api/assistant/insights' : '/api/assistant/insights/demo';
      const headers: Record<string, string> = {};
      if (isAuthenticated) {
        const token = localStorage.getItem('jwt_token');
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      return await apiFetch(endpoint, { headers });
    },
    enabled: isOpen,
  });

  // Send message to AI
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
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

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      // Fallback response if API fails
      const fallbackMessage: Message = {
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment, or explore the dashboard for insights about your finances.",
        suggestions: ['Try again', 'View Dashboard'],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMessage]);
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

  // Initial welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm your CODA Financial Assistant. 👋

I can help you:
• **Analyze spending** and find savings opportunities
• **Compare products** like credit cards and loans
• **Track goals** and plan for the future
• **Answer questions** about your finances

What would you like to know?`,
        suggestions: [
          'How can I save more money?',
          'Show me credit card offers',
          'How am I doing financially?',
        ],
        timestamp: new Date(),
      }]);
    }
  }, [isOpen]);

  // Floating chat button (when not embedded)
  if (!embedded && !isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all z-50"
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    );
  }

  // Chat content
  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">Financial Assistant</h3>
            <p className="text-xs text-muted-foreground">Powered by AI</p>
          </div>
        </div>
        {!embedded && (
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
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
                    "max-w-[80%] space-y-2",
                    message.role === 'user' && "text-right"
                  )}>
                    <div className={cn(
                      "rounded-2xl px-4 py-3 text-sm",
                      message.role === 'assistant' 
                        ? "bg-muted rounded-tl-sm" 
                        : "bg-primary text-primary-foreground rounded-tr-sm"
                    )}>
                      <div 
                        className="prose prose-sm dark:prose-invert max-w-none"
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

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick Insights */}
          {insightsData?.insights && messages.length === 1 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground mb-2">Quick Insights:</p>
              <div className="flex flex-wrap gap-2">
                {insightsData.insights.slice(0, 2).map((insight: string, i: number) => (
                  <Badge 
                    key={i} 
                    variant="secondary" 
                    className="text-xs cursor-pointer hover:bg-secondary/80"
                    onClick={() => handleSuggestionClick(`Tell me more about: ${insight}`)}
                  >
                    {insight.substring(0, 50)}...
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me anything about your finances..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={!inputValue.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <Link href="/login" className="text-primary hover:underline">Sign in</Link>
                {' '}for personalized advice
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
    <div className={cn(
      "fixed bottom-6 right-6 z-50 transition-all duration-300",
      isMinimized ? "w-72" : "w-96"
    )}>
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
        Ask Assistant
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
