import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface UploadDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Open the drawer AND immediately trigger the file picker */
  openWithFilePicker: () => void;
  /** True when the drawer should auto-open the file picker on mount */
  autoPickFile: boolean;
  /** Called by the drawer after it consumes the auto-pick flag */
  clearAutoPickFile: () => void;
}

const UploadDrawerContext = createContext<UploadDrawerContextValue | undefined>(undefined);

export function UploadDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [autoPickFile, setAutoPickFile] = useState(false);

  const openWithFilePicker = useCallback(() => {
    setAutoPickFile(true);
    setOpen(true);
  }, []);

  const clearAutoPickFile = useCallback(() => {
    setAutoPickFile(false);
  }, []);

  return (
    <UploadDrawerContext.Provider value={{ open, setOpen, openWithFilePicker, autoPickFile, clearAutoPickFile }}>
      {children}
    </UploadDrawerContext.Provider>
  );
}

export function useUploadDrawer() {
  const ctx = useContext(UploadDrawerContext);
  if (!ctx) throw new Error("useUploadDrawer must be used within UploadDrawerProvider");
  return ctx;
}
