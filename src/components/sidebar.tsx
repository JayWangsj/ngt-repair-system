"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Wrench,
  Package,
  ShoppingBag,
  Users,
  Tags,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  CircleArrowUp,
  CircleAlert,
  LoaderCircle,
} from "lucide-react";
import { useMessages } from "./language";
import { BrandLogo } from "./brand-logo";
import { useUpdateState } from "./update-state";
import {
  applySidebarPreference,
  clampSidebarWidth,
  readSidebarPreference,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  writeSidebarPreference,
} from "@/lib/sidebar-preference";

export function Sidebar() {
  const it = useMessages();
  const path = usePathname();
  const { currentVersion, check, info, task } = useUpdateState();
  const [width, setWidth] = useState(240);
  const [collapsed, setCollapsed] = useState(false);
  const links = [
    { href: "/", label: it.nav.dashboard, icon: LayoutDashboard },
    { href: "/orders", label: it.nav.orders, icon: Wrench },
    { href: "/retail", label: it.nav.retail, icon: ShoppingBag },
    { href: "/inventory", label: it.nav.inventory, icon: Package },
    { href: "/customers", label: it.nav.customers, icon: Users },
    { href: "/prices", label: it.nav.prices, icon: Tags },
    { href: "/settings", label: it.nav.settings, icon: Settings },
  ];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const preference = readSidebarPreference();
      setWidth(preference.width);
      setCollapsed(preference.collapsed);
      applySidebarPreference(preference.width, preference.collapsed);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writeSidebarPreference(width, next);
  }

  function resize(nextWidth: number) {
    const safeWidth = clampSidebarWidth(nextWidth);
    setWidth(safeWidth);
    writeSidebarPreference(safeWidth, false);
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    if (collapsed || window.matchMedia("(max-width: 900px)").matches) return;
    const startX = event.clientX;
    const startWidth = width;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    document.documentElement.dataset.sidebarResizing = "true";
    const move = (moveEvent: PointerEvent) => {
      applySidebarPreference(startWidth + moveEvent.clientX - startX, false);
    };
    const finish = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      delete document.documentElement.dataset.sidebarResizing;
      resize(startWidth + upEvent.clientX - startX);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  }

  function resizeFromKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      resize(width + (event.key === "ArrowRight" ? 8 : -8));
    } else if (event.key === "Home") {
      event.preventDefault();
      resize(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      resize(SIDEBAR_MAX_WIDTH);
    }
  }

  const updateFailed = [
    "failed",
    "rollback-succeeded",
    "rollback-failed",
    "interrupted",
    "verifying",
  ].includes(task.phase);
  const updateRunning = [
    "starting",
    "queued",
    "running",
    "reconnecting",
    "rolling-back",
  ].includes(task.phase);
  const availableVersion = info?.updateAvailable
    ? info.latestVersion
    : undefined;
  const updateSummary = updateFailed
    ? task.phase === "verifying"
      ? it.updateVerifyingTask
      : task.phase === "interrupted"
        ? it.updateInterrupted
        : task.phase === "rollback-succeeded"
          ? it.updateRollbackSucceeded
          : task.phase === "rollback-failed"
            ? it.updateRollbackFailed
            : it.updateFailed
    : task.phase === "starting" || task.phase === "queued"
      ? it.updateTaskStarting
      : task.phase === "reconnecting"
        ? it.updateReconnecting
        : task.phase === "rolling-back"
          ? it.updateRollingBack
          : task.phase === "running"
            ? it.updateInstalling
            : availableVersion
              ? check.phase === "failed"
                ? it.updateCheckStale.replace("{version}", availableVersion)
                : it.updateAvailable.replace("{version}", availableVersion)
              : it.systemUpdate;
  const updateLabel = `${currentVersion}: ${updateSummary}`;
  const updateHref = "/settings/system-update";
  const UpdateIcon = updateFailed
    ? CircleAlert
    : updateRunning
      ? LoaderCircle
      : CircleArrowUp;

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <BrandLogo className="brand-logo brand-logo-full" priority />
        <BrandLogo variant="mark" className="brand-logo brand-logo-mark" />
      </Link>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={collapsed ? it.sidebarExpand : it.sidebarCollapse}
        title={collapsed ? it.sidebarExpand : it.sidebarCollapse}
        onClick={toggleCollapsed}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      <div className="sidebar-navigation">
        <div className="nav-label">{it.navigation}</div>
        <nav aria-label={it.navigation}>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                (href === "/" ? path === href : path.startsWith(href))
                  ? "nav-item active"
                  : "nav-item"
              }
              data-tooltip={label}
              aria-label={label}
            >
              <Icon size={19} />
              <span className="nav-item-label">{label}</span>
            </Link>
          ))}
        </nav>
        <Link
          href={updateHref}
          className={`sidebar-update-entry${path.startsWith(updateHref) ? " active" : ""}`}
          aria-label={updateLabel}
          aria-current={path.startsWith(updateHref) ? "page" : undefined}
          title={updateLabel}
        >
          <span className="sidebar-update-icon" aria-hidden="true">
            <UpdateIcon
              size={19}
              className={updateRunning ? "spin" : undefined}
            />
            {availableVersion && !updateRunning && !updateFailed && (
              <span className="sidebar-update-dot" />
            )}
            {updateFailed && (
              <span className="sidebar-update-alert-mark">!</span>
            )}
          </span>
          <span className="sidebar-update-copy">
            <strong>v{currentVersion}</strong>
            <small>{updateSummary}</small>
          </span>
        </Link>
      </div>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label={it.sidebarResize}
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={collapsed ? -1 : 0}
        onPointerDown={beginResize}
        onKeyDown={resizeFromKeyboard}
      />
    </aside>
  );
}
