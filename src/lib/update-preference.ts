export const AUTO_UPDATE_CHECK_KEY = "ngt-auto-update-check";
const UPDATE_CHECK_CACHE_PREFIX = "ngt-update-result:";
export const UPDATE_CHECK_CACHE_MAX_AGE = 5 * 60_000;

export type UpdateCheckCache<T> = {
  checkedAt: string;
  info: T;
};

export function readAutoUpdateCheck() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(AUTO_UPDATE_CHECK_KEY) !== "false";
}

export function writeAutoUpdateCheck(enabled: boolean) {
  window.localStorage.setItem(AUTO_UPDATE_CHECK_KEY, String(enabled));
}

function updateCheckCacheKey(installInstanceId: string, version: string) {
  return `${UPDATE_CHECK_CACHE_PREFIX}${installInstanceId}:${version.replace(/^v/i, "")}`;
}

export function readUpdateCheckCache<T>(
  installInstanceId: string | undefined,
  version: string | undefined,
): UpdateCheckCache<T> | null {
  if (!installInstanceId || !version || typeof window === "undefined")
    return null;
  try {
    const raw = window.sessionStorage.getItem(
      updateCheckCacheKey(installInstanceId, version),
    );
    if (!raw) return null;
    const cached = JSON.parse(raw) as UpdateCheckCache<T>;
    const age = Date.now() - Date.parse(cached.checkedAt);
    return Number.isFinite(age) && age >= 0 && age < UPDATE_CHECK_CACHE_MAX_AGE
      ? cached
      : null;
  } catch {
    return null;
  }
}

export function writeUpdateCheckCache<T>(
  installInstanceId: string | undefined,
  version: string | undefined,
  cache: UpdateCheckCache<T>,
) {
  if (!installInstanceId || !version || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      updateCheckCacheKey(installInstanceId, version),
      JSON.stringify(cache),
    );
  } catch {
    // A full or unavailable session store should not make update checks fail.
  }
}
