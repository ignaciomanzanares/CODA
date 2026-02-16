import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { CurrencyCode } from "@/lib/utils";
import { setExchangeRate } from "@/lib/utils";

const STORAGE_KEY = "coda_currency";
const RATE_URL = "https://api.frankfurter.dev/latest?from=USD&to=CLP";
const RATE_REFRESH_MS = 60 * 60 * 1000; // 1 hora

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  rateUsdToClp: number | null;
  rateLoading: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("CLP");
  const [rateUsdToClp, setRateUsdToClp] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
      if (stored === "CLP" || stored === "USD") setCurrencyState(stored);
    } catch {
      // ignore
    }
  }, []);

  const fetchRate = useCallback(async () => {
    try {
      const res = await fetch(RATE_URL);
      const data = await res.json();
      const rate = data?.rates?.CLP;
      if (typeof rate === "number" && rate > 0) {
        setExchangeRate(rate);
        setRateUsdToClp(rate);
      }
    } catch {
      // mantiene fallback en utils (1000)
    } finally {
      setRateLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRate();
    const interval = setInterval(fetchRate, RATE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchRate]);

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // ignore
    }
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rateUsdToClp, rateLoading }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    return {
      currency: "CLP",
      setCurrency: () => {},
      rateUsdToClp: null,
      rateLoading: false,
    };
  }
  return ctx;
}
