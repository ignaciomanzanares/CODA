/**
 * ReferralShareCard
 *
 * Compact, collapsible referral banner. Shows code inline with copy + WhatsApp
 * actions. Starts collapsed to keep the dashboard clean.
 */

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { generateReferralCode, getReferralUrl, getWhatsAppShareUrl } from "@/lib/referral";
import { Analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Copy, Check, MessageCircle, Gift, ChevronDown } from "lucide-react";

export default function ReferralShareCard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const code = useMemo(
    () => (user?.userId ? generateReferralCode(user.userId) : null),
    [user?.userId],
  );

  if (!code) return null;

  const url = getReferralUrl(code);
  const userName = user?.name ?? undefined;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    Analytics.referralShared("copy");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    Analytics.referralShared("whatsapp");
    window.open(getWhatsAppShareUrl(code, userName), "_blank", "noopener");
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/30 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Gift className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Invita a tus amigos</p>
          <p className="text-xs text-muted-foreground">Comparte CODA y gana beneficios</p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Code + copy */}
          <div className="flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2">
            <span className="text-sm font-mono font-semibold text-foreground tracking-wide flex-1 truncate">
              {code}
            </span>
            <button
              onClick={handleCopy}
              className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors",
                copied
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
