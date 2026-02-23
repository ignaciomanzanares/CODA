import { createContext, useCallback, useContext, useState } from "react";

export interface ReportMetrics {
  averageMonthlyBalanceClp?: number;
  monthsWithAbonos?: number;
  monthsWithGap?: number;
  overdraftUsageRatio?: number;
  hasOptimizationOpportunity?: boolean;
}

export interface ReportData {
  creditScore?: number;
  transactionalScore?: number;
  mainInsights?: string[];
  metrics?: ReportMetrics;
}

interface ReportDataContextValue {
  reportData: ReportData;
  setCreditScore: (score: number) => void;
  setTransactionalResult: (data: {
    transactionalScore: number;
    mainInsights: string[];
    metrics?: ReportMetrics;
  }) => void;
  setUploadResult: (data: {
    creditScore?: number;
    transactionalScore?: number;
    mainInsights?: string[];
  }) => void;
}

const defaultContext: ReportDataContextValue = {
  reportData: {},
  setCreditScore: () => {},
  setTransactionalResult: () => {},
  setUploadResult: () => {},
};

const ReportDataContext = createContext<ReportDataContextValue>(defaultContext);

export function ReportDataProvider({ children }: { children: React.ReactNode }) {
  const [reportData, setReportData] = useState<ReportData>({});

  const setCreditScore = useCallback((score: number) => {
    setReportData((prev) => ({ ...prev, creditScore: score }));
  }, []);

  const setTransactionalResult = useCallback(
    (data: {
      transactionalScore: number;
      mainInsights: string[];
      metrics?: ReportMetrics;
    }) => {
      setReportData((prev) => ({
        ...prev,
        transactionalScore: data.transactionalScore,
        mainInsights: data.mainInsights,
        metrics: data.metrics ?? prev.metrics,
      }));
    },
    []
  );

  const setUploadResult = useCallback(
    (data: {
      creditScore?: number;
      transactionalScore?: number;
      mainInsights?: string[];
    }) => {
      setReportData((prev) => ({
        ...prev,
        ...(data.creditScore != null && { creditScore: data.creditScore }),
        ...(data.transactionalScore != null && {
          transactionalScore: data.transactionalScore,
        }),
        ...(data.mainInsights != null && { mainInsights: data.mainInsights }),
      }));
    },
    []
  );

  return (
    <ReportDataContext.Provider
      value={{
        reportData,
        setCreditScore,
        setTransactionalResult,
        setUploadResult,
      }}
    >
      {children}
    </ReportDataContext.Provider>
  );
}

export function useReportData() {
  return useContext(ReportDataContext);
}
