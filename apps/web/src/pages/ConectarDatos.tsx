/**
 * "Conecta tus datos" (Fase 5): conectores AFP / SII / Tesorería por flujo guiado.
 * El usuario descarga el certificado oficial con su Clave Única en el sitio de cada fuente y lo
 * sube aquí — CODA no maneja su Clave Única. Los datos extraídos enriquecen su salud financiera.
 */
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ExternalLink, Upload, Landmark, FileText, Receipt } from "lucide-react";

interface SourceStatus {
  source: string;
  verifiedMonthlyIncomeClp: number | null;
  fiscalDebtClp: number | null;
  contributionMonths: number | null;
  extractedAt: string;
}

interface SourceConfig {
  id: "afp" | "sii" | "tgr";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  officialUrl: string;
  officialLabel: string;
  instructions: string;
}

const SOURCES: SourceConfig[] = [
  {
    id: "sii",
    title: "SII — Renta",
    icon: FileText,
    description:
      "Verifica tus ingresos con tu carpeta tributaria del Servicio de Impuestos Internos.",
    officialUrl: "https://www.sii.cl",
    officialLabel: "Ir a sii.cl",
    instructions:
      "En sii.cl: Servicios online → Situación tributaria → Carpeta tributaria → «Para acreditar renta». Descarga el PDF y súbelo aquí.",
  },
  {
    id: "afp",
    title: "AFP — Cotizaciones",
    icon: Landmark,
    description: "Confirma la estabilidad de tus ingresos con tu certificado de cotizaciones.",
    officialUrl: "https://www.spensiones.cl",
    officialLabel: "Ir a tu AFP",
    instructions:
      "En el sitio de tu AFP (con Clave Única): Certificados → Certificado de cotizaciones. Descarga el PDF de los últimos 12 meses y súbelo aquí.",
  },
  {
    id: "tgr",
    title: "Tesorería — Deuda fiscal",
    icon: Receipt,
    description: "Incorpora tu deuda fiscal vigente a tu diagnóstico de salud financiera.",
    officialUrl: "https://www.tgr.cl",
    officialLabel: "Ir a tgr.cl",
    instructions:
      "En tgr.cl (con Clave Única): Certificados → Certificado de deuda. Descarga el PDF y súbelo aquí.",
  },
];

export default function ConectarDatos() {
  const { data, refetch } = useQuery<{ sources: SourceStatus[] }>({
    queryKey: ["/api/data-sources"],
    queryFn: () => apiFetch("/api/data-sources"),
  });
  const statuses = data?.sources ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conecta tus datos</h1>
        <p className="text-muted-foreground">
          Sube los certificados oficiales que descargas con tu Clave Única. Nunca te pedimos tu
          clave: tú los descargas en el sitio de cada institución y los subes aquí.
        </p>
      </div>
      {SOURCES.map((cfg) => (
        <SourceCard
          key={cfg.id}
          config={cfg}
          status={statuses.find((s) => s.source === cfg.id)}
          onDone={refetch}
        />
      ))}
    </div>
  );
}

function SourceCard({
  config,
  status,
  onDone,
}: {
  config: SourceConfig;
  status?: SourceStatus;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = config.icon;
  const connected = !!status;

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/api/data-sources/${config.id}`, { method: "POST", body: fd });
      if (res?.ok) {
        toast({ title: "Documento procesado", description: "Tus datos se actualizaron." });
        onDone();
      } else {
        toast({
          title: "No se pudo procesar",
          description: res?.message ?? "Revisa el archivo.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message ?? "No se pudo subir el documento.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-muted p-2">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{config.title}</p>
              <p className="text-sm text-muted-foreground">{config.description}</p>
            </div>
          </div>
          {connected && (
            <Badge variant="default" className="shrink-0 gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
            </Badge>
          )}
        </div>

        {connected && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            {status!.verifiedMonthlyIncomeClp != null && (
              <p>
                Ingreso verificado:{" "}
                <span className="font-medium">
                  {formatCurrency(status!.verifiedMonthlyIncomeClp, "CLP")}/mes
                </span>
              </p>
            )}
            {status!.fiscalDebtClp != null && (
              <p>
                Deuda fiscal:{" "}
                <span className="font-medium">{formatCurrency(status!.fiscalDebtClp, "CLP")}</span>
              </p>
            )}
            {status!.contributionMonths != null && (
              <p>
                Meses cotizados detectados:{" "}
                <span className="font-medium">{status!.contributionMonths}</span>
              </p>
            )}
          </div>
        )}

        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{config.instructions}</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={config.officialUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> {config.officialLabel}
            </a>
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />{" "}
            {busy ? "Procesando…" : connected ? "Actualizar PDF" : "Subir PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
