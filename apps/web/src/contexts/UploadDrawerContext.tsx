import { createContext, useContext, useState, type ReactNode } from "react";

interface UploadDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const UploadDrawerContext = createContext<UploadDrawerContextValue | undefined>(undefined);

export function UploadDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <UploadDrawerContext.Provider value={{ open, setOpen }}>
      {children}
    </UploadDrawerContext.Provider>
  );
}

export function useUploadDrawer() {
  const ctx = useContext(UploadDrawerContext);
  if (!ctx) throw new Error("useUploadDrawer must be used within UploadDrawerProvider");
  return ctx;
}
