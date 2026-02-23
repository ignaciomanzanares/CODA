import { useRef, useCallback } from "react";
import { useApi } from "@/lib/api";
import { useReportData } from "@/contexts/ReportDataContext";
import { generateCodaReportPdf } from "@/lib/codaReportPdf";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

export default function DownloadReporteCodaButton() {
  const { reportData, setCreditScore } = useReportData();
  const { getCreditScore } = useApi();
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
    generateCodaReportPdf(data);
  }, [reportData, getCreditScore, setCreditScore]);

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
      Descargar Reporte CODA
    </Button>
  );
}
