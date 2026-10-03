"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";

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
  const navigationTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;
    if (!form.matches(".dashboard-date-filter")) return;
    event.preventDefault();
    const day = String(new FormData(form).get("day") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const navigate = () => router.push(`/?day=${encodeURIComponent(day)}`);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigate();
      return;
    }
    root.current?.classList.add("dashboard-updating");
    navigationTimer.current = setTimeout(navigate, 120);
  }

  useEffect(
    () => () => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    },
    [],
  );

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    element.classList.remove("dashboard-updating");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const storageKey = "ngt-dashboard-animation";
    if (sessionStorage.getItem(storageKey) === fingerprint) return;
    element.classList.add("dashboard-animating");
    let completed = false;
    const counts = Array.from(
      element.querySelectorAll<HTMLElement>("[data-count]"),
    );
    const bars = Array.from(
      element.querySelectorAll<HTMLElement>("[data-bar]"),
    );
    const progress = Array.from(
      element.querySelectorAll<HTMLElement>("[data-progress]"),
    );
    const donutSegments = Array.from(
      element.querySelectorAll<SVGCircleElement>("[data-donut-segment]"),
    );
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
    donutSegments.forEach((node) => {
      node.style.strokeDasharray = "0 100";
      node.style.strokeDashoffset = node.dataset.donutOffset ?? "0";
    });

    void element.offsetHeight;

    let frame = 0;
    const start = performance.now() + 70;
    const duration = 500;
    const animate = (now: number) => {
      const raw = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - Math.pow(1 - raw, 3);
      counts.forEach((node) => {
        const target = Number(node.dataset.count ?? 0);
        const value = Math.round(target * eased);
        node.textContent =
          node.dataset.countType === "money"
            ? moneyFormat.format(value / 100)
            : integerFormat.format(value);
      });
      if (raw < 1) frame = requestAnimationFrame(animate);
      else {
        completed = true;
        sessionStorage.setItem(storageKey, fingerprint);
        element.classList.remove("dashboard-animating");
      }
    };
    const reveal = requestAnimationFrame(() => {
      element.classList.add("dashboard-running");
      bars.forEach((node, index) => {
        node.style.transitionDelay = `${80 + (index % 2) * 55}ms`;
        node.style.height = node.dataset.bar ?? "0%";
      });
      progress.forEach((node) => {
        node.style.width = node.dataset.progress ?? "0%";
      });
      donutSegments.forEach((node, index) => {
        const share = Number(node.dataset.donutSegment ?? 0);
        node.style.transitionDelay = `${100 + index * 55}ms`;
        node.style.strokeDasharray = `${share} ${100 - share}`;
      });
      frame = requestAnimationFrame(animate);
    });
    return () => {
      cancelAnimationFrame(reveal);
      cancelAnimationFrame(frame);
      element.classList.remove("dashboard-animating", "dashboard-running");
      if (!completed && sessionStorage.getItem(storageKey) === fingerprint)
        sessionStorage.removeItem(storageKey);
    };
  }, [fingerprint, locale]);

  return (
    <div ref={root} data-testid="dashboard-motion" onSubmit={handleSubmit}>
      {children}
    </div>
  );
}
