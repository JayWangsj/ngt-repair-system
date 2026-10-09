"use client";

import { useEffect } from "react";
import { ensureComfortableInteractionSpace } from "@/lib/comfortable-scroll";

export function ComfortableScrollManager() {
  useEffect(() => {
    let pointerTarget: Element | null = null;
    let clearPointerTarget = 0;
    function pointerDown(event: PointerEvent) {
      pointerTarget = event.target instanceof Element ? event.target : null;
      window.clearTimeout(clearPointerTarget);
      clearPointerTarget = window.setTimeout(() => {
        pointerTarget = null;
      });
    }
    function focus(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.skipComfortableScrollOnce === "true") {
        delete target.dataset.skipComfortableScrollOnce;
        return;
      }
      if (
        pointerTarget &&
        (target === pointerTarget ||
          target.contains(pointerTarget) ||
          pointerTarget.contains(target))
      )
        return;
      if (
        !target.matches(
          'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [role="combobox"], [aria-haspopup="listbox"]',
        )
      )
        return;
      const configured = Number(target.dataset.comfortableExpansion);
      const spaceBelow = Number.isFinite(configured)
        ? configured
        : target instanceof HTMLSelectElement
          ? 240
          : 0;
      requestAnimationFrame(() =>
        ensureComfortableInteractionSpace(target, {
          spaceBelow,
          repositionBelowRatio: 0.5,
        }),
      );
    }
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("focusin", focus, true);
    return () => {
      window.clearTimeout(clearPointerTarget);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("focusin", focus, true);
    };
  }, []);
  return null;
}
