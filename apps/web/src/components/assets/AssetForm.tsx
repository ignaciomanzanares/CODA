import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FileUp, Loader2 } from "lucide-react";
import { useApi } from "@/lib/api";

type AssetType = "property" | "vehicle" | "crypto" | "investment" | "other";

interface AssetFormData {
  type: AssetType;
  name: string;
  acquisitionCostClp: number;
  estimatedValueClp: number | null;
  hasLien: boolean;
  lienAmountClp: number | null;
  currency: string;
  notes: string | null;
}

interface AssetFormProps {
  initialData?: Partial<AssetFormData>;
  onSubmit: (data: AssetFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "property", label: "Propiedad (departamento, casa, terreno)" },
  { value: "vehicle", label: "Vehículo (auto, moto, camión)" },
  { value: "crypto", label: "Criptoactivo (Bitcoin, ETH, etc.)" },
  { value: "investment", label: "Inversión (acciones, fondos, bonos)" },
  { value: "other", label: "Otro activo" },
];

function parseMonto(raw: string): number | null {
  const n = parseInt(raw.replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

function formatMonto(n: number | null): string {
  if (n == null) return "";
  return n.toLocaleString("es-CL");
}

export default function AssetForm({ initialData, onSubmit, onCancel, isLoading }: AssetFormProps) {
  const [type, setType] = useState<AssetType>(initialData?.type ?? "property");
  const [name, setName] = useState(initialData?.name ?? "");
  const [acquisitionRaw, setAcquisitionRaw] = useState(
    formatMonto(initialData?.acquisitionCostClp ?? null),
  );
  const [estimatedRaw, setEstimatedRaw] = useState(
    formatMonto(initialData?.estimatedValueClp ?? null),
  );
  const [hasLien, setHasLien] = useState(initialData?.hasLien ?? false);
  const [lienRaw, setLienRaw] = useState(formatMonto(initialData?.lienAmountClp ?? null));
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const { extractInscripcion, getInscripcionJob } = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false); // OCR async (escaneado) en curso
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  // Cancelación del polling (cancelar manualmente o al desmontar el form).
  const pollCancelledRef = useRef(false);
  useEffect(
    () => () => {
      pollCancelledRef.current = true;
    },
    [],
  );

  /** Aplica un prefill leído (capa de texto o OCR) a los campos del form. */
  function applyResult(res: import("@/lib/api").ExtractInscripcionResponse) {
    if (!res.ok || !res.prefill) {
      // Escaneo ilegible / OCR no disponible → ingreso manual.
      setUploadNotice(res.message ?? "No pudimos leer el PDF. Ingresa los datos manualmente.");
      return;
    }
    const p = res.prefill;
    setType(p.type ?? "property");
    if (p.name) setName(p.name);
    setAcquisitionRaw(formatMonto(p.acquisitionCostClp));
    setEstimatedRaw(formatMonto(p.estimatedValueClp));
    setHasLien(p.hasLien);
    setLienRaw(formatMonto(p.lienAmountClp));
    if (p.notes) setNotes(p.notes);
    setUploadNotice(
      p.fxPending
        ? "Inscripción leída. No pudimos resolver el valor de la UF — revisa e ingresa los montos en CLP antes de guardar."
        : `Inscripción leída${res.usedOcr ? " (vía OCR)" : ""}. Revisa los datos y guarda.`,
    );
  }

  /** Polling del job de OCR async: cada 3s, hasta ~5 min. */
  async function pollInscripcionJob(jobId: string) {
    const INTERVAL_MS = 3000;
    const MAX_ATTEMPTS = 100; // ~5 min
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      if (pollCancelledRef.current) return;
      let job;
      try {
        job = await getInscripcionJob(jobId);
      } catch {
        continue; // error transitorio de red → reintentar en el próximo tick
      }
      if (pollCancelledRef.current) return;
      if (job.status === "done") {
        setProcessing(false);
        if (job.result) applyResult(job.result);
        else setUploadNotice("No pudimos leer el PDF. Ingresa los datos manualmente.");
        return;
      }
      if (job.status === "error") {
        setProcessing(false);
        setUploadNotice(
          job.message ?? "No pudimos procesar la inscripción. Ingresa los datos manualmente.",
        );
        return;
      }
      // status 'processing' → seguir esperando
    }
    // Se agotó el tiempo: dejar continuar a mano.
    setProcessing(false);
    setUploadNotice(
      "El procesamiento está tardando más de lo normal. Puedes ingresar los datos manualmente.",
    );
  }

  async function handleInscripcionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-subir el mismo archivo
    if (!file) return;
    setError(null);
    setUploadNotice(null);
    pollCancelledRef.current = false;
    setUploading(true);
    try {
      const res = await extractInscripcion(file);
      // 202 → escaneado: el OCR corre async. Mostrar "Procesando…" y hacer polling.
      if (res.jobId) {
        setProcessing(true);
        setUploadNotice(
          "Procesando inscripción… Esto puede tardar un par de minutos. Puedes cancelar y cargar a mano.",
        );
        void pollInscripcionJob(res.jobId);
        return;
      }
      // 200 → capa de texto: prefill inmediato (como hoy).
      applyResult(res);
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : "No se pudo procesar la inscripción.",
      );
    } finally {
      setUploading(false);
    }
  }

  function cancelProcessing() {
    pollCancelledRef.current = true;
    setProcessing(false);
    setUploadNotice("Procesamiento cancelado. Ingresa los datos de la propiedad manualmente.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const acquisitionCostClp = parseMonto(acquisitionRaw);
    if (!acquisitionCostClp || acquisitionCostClp <= 0) {
      setError("Ingresa un costo de adquisición válido.");
      return;
    }
    if (!name.trim()) {
      setError("Ingresa un nombre para el activo.");
      return;
    }

    try {
      await onSubmit({
        type,
        name: name.trim(),
        acquisitionCostClp,
        estimatedValueClp: parseMonto(estimatedRaw),
        hasLien,
        lienAmountClp: hasLien ? parseMonto(lienRaw) : null,
        currency: "CLP",
        notes: notes.trim() || null,
      });
    } catch (err) {
      // Mostrar el mensaje específico del backend (qué campo, por qué) en vez de uno genérico.
      setError(
        err instanceof Error && err.message
          ? err.message
          : "No se pudo guardar el activo. Inténtalo de nuevo.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Atajo: prefill desde una inscripción CBR (PDF). El usuario revisa y edita antes de guardar. */}
      <div className="rounded-md border border-dashed border-blue-200 bg-blue-50/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-blue-800">
            <span className="font-medium">¿Tienes la inscripción de la propiedad?</span> Súbela y
            completamos los datos por ti.
          </div>
          {processing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 flex-shrink-0 text-blue-700"
              onClick={cancelProcessing}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Procesando… Cancelar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 flex-shrink-0"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileUp className="w-4 h-4" />
              )}
              {uploading ? "Leyendo…" : "Subir inscripción (PDF)"}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleInscripcionFile}
          />
        </div>
        {uploadNotice && <p className="text-xs text-blue-700">{uploadNotice}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Tipo de activo</Label>
        <Select value={type} onValueChange={(v) => setType(v as AssetType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSET_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Descripción</Label>
        <Input
          id="name"
          placeholder="Ej: Departamento Las Condes, 3D/2B"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="acquisition">Costo de adquisición (CLP)</Label>
        <Input
          id="acquisition"
          inputMode="numeric"
          placeholder="Ej: 120.000.000"
          value={acquisitionRaw}
          onChange={(e) => setAcquisitionRaw(e.target.value)}
          required
        />
        <p className="text-xs text-gray-500">Precio de compra original o valor de libros.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="estimated">Valor estimado actual (CLP) — opcional</Label>
        <Input
          id="estimated"
          inputMode="numeric"
          placeholder="Ej: 150.000.000"
          value={estimatedRaw}
          onChange={(e) => setEstimatedRaw(e.target.value)}
        />
        <p className="text-xs text-gray-500">Si no lo ingresas, se usa el costo de adquisición.</p>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="lien" checked={hasLien} onCheckedChange={setHasLien} />
        <Label htmlFor="lien">Este activo tiene una garantía asociada (hipoteca, prenda)</Label>
      </div>

      {hasLien && (
        <div className="space-y-1.5 pl-4 border-l-2 border-orange-200">
          <Label htmlFor="lienAmount">Monto de la garantía (CLP)</Label>
          <Input
            id="lienAmount"
            inputMode="numeric"
            placeholder="Ej: 80.000.000"
            value={lienRaw}
            onChange={(e) => setLienRaw(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          placeholder="Información adicional relevante..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Guardando..." : "Guardar activo"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
