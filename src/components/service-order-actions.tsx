"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteWorkOrderAction } from "@/app/actions";
import { useMessages } from "./language";
import { FormDialog, Field } from "./forms";
import { Button } from "./ui/button";

export function ServiceOrderActions({
  id,
  code,
  blockedReason,
}: {
  id: string;
  code: string;
  blockedReason?: string;
}) {
  const it = useMessages();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <details className="secondary-actions">
        <summary aria-label={it.moreActions}>
          <MoreHorizontal size={18} />
          {it.moreActions}
        </summary>
        <button
          type="button"
          className="danger-text"
          onClick={() => setOpen(true)}
        >
          <Trash2 size={16} /> {it.deleteServiceOrder}
        </button>
      </details>
      {open && (
        <FormDialog
          title={it.deleteServiceOrder}
          subtitle={blockedReason || it.deleteServiceOrderWarning}
          onClose={() => setOpen(false)}
        >
          <form
            className="dialog-form"
            data-form-dialog-body
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await deleteWorkOrderAction(id, { code: value });
                if (!result.ok) return setError(result.error);
                router.push("/orders");
                router.refresh();
              });
            }}
          >
            {!blockedReason && (
              <Field label={it.serviceOrderNumber}>
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={code}
                  autoComplete="off"
                />
              </Field>
            )}
            {error && <p className="message error">{error}</p>}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {it.cancel}
              </Button>
              {!blockedReason && (
                <Button variant="danger" disabled={pending || value !== code}>
                  {it.confirmPermanentDelete}
                </Button>
              )}
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}
