import type { WeightUnit } from "./units";

export type ThemePreference = "light" | "dark" | "system";

export type AppSettings = {
  unit: WeightUnit;
  restSeconds: number;
  theme: ThemePreference;
  installHintDismissed: boolean;
};

export const SETTINGS_KEY = "reps-settings";

export const DEFAULT_SETTINGS: AppSettings = {
  unit: "lb",
  restSeconds: 90,
  theme: "system",
  installHintDismissed: false,
};

export function parseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const o = raw as Partial<AppSettings>;
  const unit: WeightUnit = o.unit === "kg" ? "kg" : "lb";
  const rest = Number(o.restSeconds);
  const theme: ThemePreference =
    o.theme === "dark" || o.theme === "light" || o.theme === "system"
      ? o.theme
      : "system";
  return {
    unit,
    restSeconds: Number.isFinite(rest)
      ? Math.min(300, Math.max(15, Math.round(rest)))
      : DEFAULT_SETTINGS.restSeconds,
    theme,
    installHintDismissed: Boolean(o.installHintDismissed),
  };
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function resolveDark(theme: ThemePreference, prefersDark: boolean) {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return prefersDark;
}

export function applyTheme(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = resolveDark(theme, prefersDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const color = dark ? "#0c1210" : "#d6ff3f";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
}
