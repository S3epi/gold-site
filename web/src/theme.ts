export type Theme = "dark" | "light";

const STORAGE_KEY = "narkhino-theme";
const THEME_COLOR: Record<Theme, string> = { dark: "#0a1020", light: "#f6f1e4" };

export function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[theme];
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private mode: theme still applies for this session
  }
}
