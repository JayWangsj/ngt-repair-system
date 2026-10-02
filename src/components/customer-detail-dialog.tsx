"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "./forms";

export function CustomerDetailDialog({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <FormDialog title={title} onClose={() => router.back()}>
      <div className="customer-detail-dialog" data-form-dialog-body>
        {children}
      </div>
    </FormDialog>
  );
}
