export type OrderMotionSettings = {
  lift: number;
  rise: number;
  hold: number;
  glide: number;
  land: number;
  shadowY: number;
  shadowBlur: number;
  shadowSpread: number;
  shadowOpacity: number;
};

export const defaultOrderMotionSettings: OrderMotionSettings = {
  lift: 32,
  rise: 320,
  hold: 130,
  glide: 600,
  land: 240,
  shadowY: 20,
  shadowBlur: 32,
  shadowSpread: -12,
  shadowOpacity: 48,
};

export const orderMotionStorageKey = "ngt-order-motion";
export const orderMotionChangeEvent = "ngt-order-motion-change";
export const orderViewportFollowStorageKey = "ngt-order-motion-follow-viewport";
export const orderViewportFollowChangeEvent =
  "ngt-order-motion-follow-viewport-change";

const limits: Record<
  keyof OrderMotionSettings,
  { minimum: number; maximum: number }
> = {
  lift: { minimum: 8, maximum: 40 },
  rise: { minimum: 80, maximum: 400 },
  hold: { minimum: 0, maximum: 500 },
  glide: { minimum: 200, maximum: 1200 },
  land: { minimum: 80, maximum: 400 },
  shadowY: { minimum: 4, maximum: 30 },
  shadowBlur: { minimum: 6, maximum: 40 },
  shadowSpread: { minimum: -20, maximum: 0 },
  shadowOpacity: { minimum: 10, maximum: 70 },
};

export function normalizeOrderMotionSettings(
  value: Partial<OrderMotionSettings> | null | undefined,
): OrderMotionSettings {
  return Object.fromEntries(
    Object.entries(defaultOrderMotionSettings).map(([key, fallback]) => {
      const name = key as keyof OrderMotionSettings;
      const candidate = Number(value?.[name]);
      const number = Number.isFinite(candidate) ? candidate : fallback;
      return [
        name,
        Math.min(limits[name].maximum, Math.max(limits[name].minimum, number)),
      ];
    }),
  ) as OrderMotionSettings;
}

export function readOrderMotionSettings(): OrderMotionSettings {
  if (typeof window === "undefined") return defaultOrderMotionSettings;
  try {
    return normalizeOrderMotionSettings(
      JSON.parse(window.localStorage.getItem(orderMotionStorageKey) || "null"),
    );
  } catch {
    return defaultOrderMotionSettings;
  }
}

export function writeOrderMotionSettings(value: OrderMotionSettings) {
  const next = normalizeOrderMotionSettings(value);
  window.localStorage.setItem(orderMotionStorageKey, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent(orderMotionChangeEvent, { detail: next }),
  );
}

export function resetOrderMotionSettings() {
  window.localStorage.removeItem(orderMotionStorageKey);
  window.dispatchEvent(
    new CustomEvent(orderMotionChangeEvent, {
      detail: defaultOrderMotionSettings,
    }),
  );
}

export function readOrderViewportFollow() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(orderViewportFollowStorageKey) !== "off";
}

export function writeOrderViewportFollow(enabled: boolean) {
  if (enabled) window.localStorage.removeItem(orderViewportFollowStorageKey);
  else window.localStorage.setItem(orderViewportFollowStorageKey, "off");
  window.dispatchEvent(
    new CustomEvent(orderViewportFollowChangeEvent, { detail: enabled }),
  );
}
