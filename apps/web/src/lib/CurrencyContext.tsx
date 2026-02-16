import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { CurrencyCode } from "@/lib/utils";
import { setExchangeRate } from "@/lib/utils";

const STORAGE_KEY = "coda_currency";
const RATE_REFRESH_MS = 60 * 60 * 1000; // 1 hora

// Fuentes de tasa USD → CLP (primera que responda gana)
const RATE_SOURCES: { url: string; getRate: (data: any) => number | null }[] = [
  {
    url: "https://api.frankfurter.dev/v1/latest?from=USD&to=CLP",
    getRate: (data) => (data?.rates?.CLP != null ? Number(data.rates.CLP) : null),
  },
  {
    url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CLP",
    getRate: (data) => (data?.rates?.CLP != null ? Number(data.rates.CLP) : null),
  },
  {
    url: "https://open.er-api.com/v6/latest/USD",
    getRate: (data) => (data?.conversion_rates?.CLP != null ? Number(data.conversion_rates.CLP) : null),
  },
];

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
    for (const { url, getRate } of RATE_SOURCES) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) continue;
        const data = await res.json();
        const rate = getRate(data);
        if (typeof rate === "number" && rate > 0) {
          setExchangeRate(rate);
          setRateUsdToClp(rate);
          break;
        }
      } catch {
        clearTimeout(timeoutId);
        continue;
      }
    }
    setRateLoading(false);
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
