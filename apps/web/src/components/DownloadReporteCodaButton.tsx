import { useRef, useCallback } from "react";
import { useApi } from "@/lib/api";
import { useReportData } from "@/contexts/ReportDataContext";
import { useUserDocuments } from "@/hooks/useUserDocuments";
import { generateCodaReportPdf } from "@/lib/codaReportPdf";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileDown } from "lucide-react";

export default function DownloadReporteCodaButton() {
  const { reportData, setCreditScore, setReportIdentity } = useReportData();
  const { getCreditScore, getUserProfile } = useApi();
  const { hasDocuments, isLoading } = useUserDocuments();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleDownload = useCallback(async () => {
    let data = { ...reportData };
    if (data.creditScore == null) {
      try {
        const credit = await getCreditScore();
        const score = (credit as { score?: number })?.score;
        if (score != null) {
          setCreditScore(score);
          data = { ...data, creditScore: score };
        }
      } catch {
        // keep data without credit score
      }
    }
    if (data.userName == null) {
      try {
        const profile = await getUserProfile();
        const name = profile?.displayName ?? profile?.firstName ?? profile?.name;
        if (name) {
          const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || name;
          setReportIdentity({ userName: fullName });
          data = { ...data, userName: fullName };
        }
      } catch {
        // keep without name
      }
    }
    generateCodaReportPdf(data);
  }, [reportData, getCreditScore, getUserProfile, setCreditScore, setReportIdentity]);

  if (isLoading) return null;

  if (!hasDocuments) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 opacity-50 cursor-not-allowed"
                disabled
              >
                <FileDown className="h-4 w-4" />
                Descargar Reporte de Salud Financiera
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Sube tus documentos para generar tu reporte</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={handleDownload}
    >
      <FileDown className="h-4 w-4" />
      Descargar Reporte de Salud Financiera
    </Button>
  );
}
