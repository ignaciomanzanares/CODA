import { useEffect, useState } from "react";

// Tema explícito: solo claro u oscuro (sin "system"). Para usuarios nuevos se
// resuelve UNA vez según la preferencia del SO y queda como valor explícito.
type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("coda-theme");
    // Compat: valores antiguos ("system" o null) se resuelven una vez al SO.
    return stored === "light" || stored === "dark" ? stored : getSystemTheme();
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("coda-theme", theme);
  }, [theme]);

  const toggle = () => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  return { theme, resolved: theme, setTheme: setThemeState, toggle };
}
