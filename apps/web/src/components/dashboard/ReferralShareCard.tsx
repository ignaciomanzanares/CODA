/**
 * ReferralShareCard
 *
 * Shows the user's referral code and provides quick share actions:
 * WhatsApp deep link + copy-to-clipboard for the referral URL.
 * Displayed on the Dashboard to encourage organic growth.
 */

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { generateReferralCode, getReferralUrl, getWhatsAppShareUrl } from "@/lib/referral";
import { Analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Share2, Copy, Check, MessageCircle, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReferralShareCard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      Analytics.referralShared("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select + copy
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      Analytics.referralShared("copy");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    Analytics.referralShared("whatsapp");
    window.open(getWhatsAppShareUrl(code, userName), "_blank", "noopener");
  };

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/80 to-emerald-50/30 dark:from-emerald-500/10 dark:to-emerald-500/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center shrink-0">
          <Gift className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Invita a tus amigos</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Comparte CODA y ayuda a otros a conocer su salud financiera
          </p>
        </div>
      </div>

      {/* Referral code display */}
      <div className="flex items-center gap-2 rounded-xl bg-white/60 dark:bg-white/5 border border-emerald-100 dark:border-emerald-500/10 px-3 py-2.5">
        <Share2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-mono font-semibold text-foreground tracking-wide flex-1 truncate">
          {code}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors",
            copied
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* Share buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleWhatsApp}
          className="flex-1 h-9 bg-[#25D366] hover:bg-[#20BD5A] text-white text-xs font-semibold rounded-xl gap-1.5"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Compartir por WhatsApp
        </Button>
        <Button
          variant="outline"
          onClick={handleCopy}
          className="h-9 text-xs font-medium rounded-xl gap-1.5 px-3"
        >
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Copiar link</span>
        </Button>
      </div>
    </div>
  );
}
