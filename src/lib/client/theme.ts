"use client";
import { useSyncExternalStore } from "react";

// Тема и токены читаются из <html data-theme> — внешнего по отношению к React состояния
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}

export function setTheme(t: "light" | "dark") {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("pulse-theme", t);
  } catch {
    /* приватный режим браузера */
  }
}

/** Значения CSS-переменных для SVG-атрибутов (они не понимают var()) */
export function useCssTokens(names: string[]): Record<string, string> {
  const theme = useTheme();
  const key = useSyncExternalStore(
    subscribe,
    () => {
      const cs = getComputedStyle(document.documentElement);
      return names.map((n) => cs.getPropertyValue(n).trim()).join("|");
    },
    () => "",
  );
  void theme;
  const vals = key.split("|");
  return Object.fromEntries(names.map((n, i) => [n, vals[i] || undefined])) as Record<string, string>;
}
