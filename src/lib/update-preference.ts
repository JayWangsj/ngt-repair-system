export const AUTO_UPDATE_CHECK_KEY = "ngt-auto-update-check";
export const UPDATE_CHECKED_SESSION_KEY = "ngt-update-checked-this-session";

export function readAutoUpdateCheck() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(AUTO_UPDATE_CHECK_KEY) !== "false";
}

export function writeAutoUpdateCheck(enabled: boolean) {
  window.localStorage.setItem(AUTO_UPDATE_CHECK_KEY, String(enabled));
}
