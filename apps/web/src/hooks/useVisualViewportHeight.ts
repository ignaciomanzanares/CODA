import { useEffect } from "react";

/**
 * Ajusta `--visual-viewport-height` para modales en iOS cuando el teclado no redimensiona el viewport.
 */
export function useVisualViewportHeight(): void {
  useEffect(() => {
    const setVar = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--visual-viewport-height", `${Math.round(h)}px`);
    };
    setVar();
    window.visualViewport?.addEventListener("resize", setVar);
    window.visualViewport?.addEventListener("scroll", setVar);
    window.addEventListener("resize", setVar);
    return () => {
      window.visualViewport?.removeEventListener("resize", setVar);
      window.visualViewport?.removeEventListener("scroll", setVar);
      window.removeEventListener("resize", setVar);
    };
  }, []);
}
