"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "./forms";

export function DashboardStatsDialog({
  title,
  description,
  triggerLabel,
  defaultOpen,
  closeHref,
  children,
}: {
  title: string;
  description: string;
  triggerLabel: string;
  defaultOpen: boolean;
  closeHref: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();

  function close() {
    setOpen(false);
    if (defaultOpen) router.replace(closeHref, { scroll: false });
  }

  return (
    <>
      <button
        type="button"
        className="dashboard-detail-link dashboard-action-link dashboard-stats-trigger"
        onClick={() => setOpen(true)}
      >
        <span className="dashboard-link-label">{triggerLabel}</span>
        <span className="dashboard-link-chevron" aria-hidden="true">
          &gt;
        </span>
      </button>
      {open && (
        <FormDialog title={title} subtitle={description} onClose={close}>
          {children}
        </FormDialog>
      )}
    </>
  );
}
