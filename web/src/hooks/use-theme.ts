import { useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "tunnelbox-theme";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";

    document.documentElement.dataset.theme = next;
    setTheme(next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private windows can block storage; the theme still applies for this visit.
    }
  }

  return { theme, toggleTheme };
}
