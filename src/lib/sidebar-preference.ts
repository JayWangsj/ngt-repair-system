export const SIDEBAR_WIDTH_KEY = "ngt-sidebar-width";
export const SIDEBAR_COLLAPSED_KEY = "ngt-sidebar-collapsed";
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 320;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

export function clampSidebarWidth(value: number) {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
}

export function readSidebarPreference() {
  if (typeof window === "undefined") {
    return { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
  }
  const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const width = storedWidth
    ? clampSidebarWidth(Number(storedWidth))
    : SIDEBAR_DEFAULT_WIDTH;
  return {
    width,
    collapsed: window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
  };
}

export function applySidebarPreference(width: number, collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--sidebar-width",
    `${collapsed ? SIDEBAR_COLLAPSED_WIDTH : clampSidebarWidth(width)}px`,
  );
  document.documentElement.dataset.sidebarCollapsed = String(collapsed);
}

export function writeSidebarPreference(width: number, collapsed: boolean) {
  const safeWidth = clampSidebarWidth(width);
  window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(safeWidth));
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  applySidebarPreference(safeWidth, collapsed);
}
