export const MOTION_PREFERENCE_KEY = "ngt-motion-preference";

export function isAlwaysMotionEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MOTION_PREFERENCE_KEY) === "always";
  } catch {
    return false;
  }
}

export function prefersReducedMotion() {
  if (typeof window === "undefined" || isAlwaysMotionEnabled()) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setAlwaysMotionEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(MOTION_PREFERENCE_KEY, "always");
    document.documentElement.dataset.motion = "always";
  } else {
    window.localStorage.removeItem(MOTION_PREFERENCE_KEY);
    delete document.documentElement.dataset.motion;
  }
}
