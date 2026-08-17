import { Link } from "wouter";
import { ArrowLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LegalTocItem = { id: string; label: string };

type Props = {
  title: string;
  lastUpdated: string;
  toc: LegalTocItem[];
  children: ReactNode;
};

export default function LegalPageShell({ title, lastUpdated, toc, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav aria-label="Índice del documento" className="space-y-1 text-sm">
      {toc.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="block rounded-md px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          onClick={() => setMobileOpen(false)}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 mb-6 -ml-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
          <p className="text-orange-200 text-sm font-medium tracking-wide uppercase mb-2">
            CODA · Documento legal
          </p>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-3">{title}</h1>
          <p className="text-orange-100 text-sm md:text-base">
            Última actualización: {lastUpdated}
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10 xl:gap-14">
          {/* Mobile TOC toggle */}
          <div className="lg:hidden mb-6">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-medium text-slate-800 shadow-sm"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
            >
              <span className="flex items-center gap-2">
                <Menu className="h-5 w-5 text-orange-600" />
                Índice
              </span>
              <span className="text-xs text-slate-500">{mobileOpen ? "Ocultar" : "Mostrar"}</span>
            </button>
            {mobileOpen && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-[#0f172a] p-4 shadow-lg">
                {nav}
              </div>
            )}
          </div>

          {/* Desktop sticky TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 rounded-xl border border-slate-200 bg-[#0f172a] p-5 shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                En esta página
              </p>
              {nav}
            </div>
          </aside>

          <article
            className={cn(
              "prose prose-slate max-w-none",
              "prose-headings:font-bold prose-headings:text-slate-900 prose-headings:scroll-mt-24",
              "prose-p:text-slate-700 prose-p:leading-relaxed",
              "prose-li:text-slate-700",
              "prose-strong:text-slate-900",
              "prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline",
            )}
          >
            {children}
          </article>
        </div>
      </div>
    </div>
  );
}
