"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DashboardMotion({
  fingerprint,
  locale,
  children,
}: {
  fingerprint: string;
  locale: "it" | "zh";
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const storageKey = "ngt-dashboard-animation";
    if (sessionStorage.getItem(storageKey) === fingerprint) return;
    sessionStorage.setItem(storageKey, fingerprint);
    element.classList.add("dashboard-animating");
    const counts = Array.from(
      element.querySelectorAll<HTMLElement>("[data-count]"),
    );
    const bars = Array.from(
      element.querySelectorAll<HTMLElement>("[data-bar]"),
    );
    const progress = Array.from(
      element.querySelectorAll<HTMLElement>("[data-progress]"),
    );
    const donut = element.querySelector<HTMLElement>("[data-donut]");
    const moneyFormat = new Intl.NumberFormat(
      locale === "zh" ? "zh-CN" : "it-IT",
      { style: "currency", currency: "EUR" },
    );
    const integerFormat = new Intl.NumberFormat(
      locale === "zh" ? "zh-CN" : "it-IT",
    );

    counts.forEach((node) => {
      node.textContent =
        node.dataset.countType === "money" ? moneyFormat.format(0) : "0";
    });
    bars.forEach((node) => (node.style.height = "0%"));
    progress.forEach((node) => (node.style.width = "0%"));

    let frame = 0;
    const start = performance.now();
    const duration = 720;
    const animate = (now: number) => {
      const raw = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      counts.forEach((node) => {
        const target = Number(node.dataset.count ?? 0);
        const value = Math.round(target * eased);
        node.textContent =
          node.dataset.countType === "money"
            ? moneyFormat.format(value / 100)
            : integerFormat.format(value);
      });
      if (donut) {
        const share = Number(donut.dataset.donut ?? 0) * eased;
        donut.style.background = `conic-gradient(var(--accent) 0 ${share}%, #ffe49a 0 100%)`;
      }
      if (raw < 1) frame = requestAnimationFrame(animate);
      else element.classList.remove("dashboard-animating");
    };
    const reveal = requestAnimationFrame(() => {
      element.classList.add("dashboard-running");
      bars.forEach((node, index) => {
        node.style.transitionDelay = `${250 + index * 35}ms`;
        node.style.height = node.dataset.bar ?? "0%";
      });
      progress.forEach((node) => {
        node.style.width = node.dataset.progress ?? "0%";
      });
      frame = requestAnimationFrame(animate);
    });
    return () => {
      cancelAnimationFrame(reveal);
      cancelAnimationFrame(frame);
    };
  }, [fingerprint, locale]);

  return (
    <div ref={root} data-testid="dashboard-motion">
      {children}
    </div>
  );
}
