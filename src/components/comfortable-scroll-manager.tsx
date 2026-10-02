"use client";

import { useEffect } from "react";
import { ensureComfortableInteractionSpace } from "@/lib/comfortable-scroll";

export function ComfortableScrollManager() {
  useEffect(() => {
    function focus(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        !target.matches(
          'input:not([type="hidden"]), textarea, select, [contenteditable="true"]',
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
        ensureComfortableInteractionSpace(target, { spaceBelow }),
      );
    }
    document.addEventListener("focusin", focus, true);
    return () => document.removeEventListener("focusin", focus, true);
  }, []);
  return null;
}
