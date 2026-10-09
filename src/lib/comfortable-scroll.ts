import { prefersReducedMotion } from "./motion-preference";

export type ComfortableScrollPlan = {
  top: number;
  behavior: ScrollBehavior;
};

export function planComfortableScroll({
  top,
  bottom,
  viewportTop = 0,
  viewportHeight,
  scrollTop,
  scrollHeight,
  spaceBelow = 0,
  margin = 24,
  targetRatio = 0.38,
  repositionBelowRatio,
  reducedMotion = false,
}: {
  top: number;
  bottom: number;
  viewportTop?: number;
  viewportHeight: number;
  scrollTop: number;
  scrollHeight: number;
  spaceBelow?: number;
  margin?: number;
  targetRatio?: number;
  repositionBelowRatio?: number;
  reducedMotion?: boolean;
}): ComfortableScrollPlan | null {
  const viewportBottom = viewportTop + viewportHeight;
  const belowComfortablePosition =
    repositionBelowRatio !== undefined &&
    (top + bottom) / 2 > viewportTop + viewportHeight * repositionBelowRatio;
  if (
    !belowComfortablePosition &&
    top >= viewportTop + margin &&
    bottom + spaceBelow <= viewportBottom - margin
  )
    return null;
  const targetTop = viewportTop + viewportHeight * targetRatio;
  const next = Math.min(
    Math.max(0, scrollHeight - viewportHeight),
    Math.max(0, scrollTop + top - targetTop),
  );
  if (Math.abs(next - scrollTop) < 1) return null;
  return { top: next, behavior: reducedMotion ? "auto" : "smooth" };
}

function scrollContainer(element: HTMLElement) {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const overflow = window.getComputedStyle(parent).overflowY;
    if (
      /(auto|scroll|overlay)/.test(overflow) &&
      parent.scrollHeight > parent.clientHeight
    )
      return parent;
  }
  return null;
}

export function ensureComfortableInteractionSpace(
  element: HTMLElement,
  {
    spaceBelow = 0,
    repositionBelowRatio,
  }: { spaceBelow?: number; repositionBelowRatio?: number } = {},
) {
  const rect = element.getBoundingClientRect();
  const container = scrollContainer(element);
  const reducedMotion = prefersReducedMotion();
  if (container) {
    const viewport = container.getBoundingClientRect();
    const plan = planComfortableScroll({
      top: rect.top,
      bottom: rect.bottom,
      viewportTop: viewport.top,
      viewportHeight: container.clientHeight,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      spaceBelow,
      repositionBelowRatio,
      reducedMotion,
    });
    if (plan) container.scrollTo(plan);
    return Boolean(plan);
  }
  const viewport = window.visualViewport;
  const plan = planComfortableScroll({
    top: rect.top,
    bottom: rect.bottom,
    viewportTop: viewport?.offsetTop ?? 0,
    viewportHeight: viewport?.height ?? window.innerHeight,
    scrollTop: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    spaceBelow,
    repositionBelowRatio,
    reducedMotion,
  });
  if (plan) window.scrollTo(plan);
  return Boolean(plan);
}

export function focusComfortably(
  element: HTMLElement | null,
  options?: { spaceBelow?: number; select?: boolean },
) {
  if (!element) return;
  element.focus({ preventScroll: true });
  if (options?.select && element instanceof HTMLInputElement) element.select();
  requestAnimationFrame(() =>
    ensureComfortableInteractionSpace(element, options),
  );
}

export function focusWithoutScrolling(element: HTMLElement | null) {
  if (!element) return;
  element.dataset.skipComfortableScrollOnce = "true";
  element.focus({ preventScroll: true });
}
