"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeInspectionAction } from "@/app/actions";
import { romeDay } from "@/lib/domain";
import {
  Field,
  FormDialog,
  ItemsEditor,
  QuoteSummary,
  type RuleView,
} from "./forms";
import { useMessages } from "./language";
import { Button } from "./ui/button";

export function CompleteInspectionButton({
  orderId,
  inspectionFee,
  device,
  rules,
}: {
  orderId: string;
  inspectionFee: string;
  device: { category: string; brand: string; series: string; model: string };
  rules: RuleView[];
}) {
  const it = useMessages();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");
  const [items, setItems] = useState<
    {
      project: string;
      final: string;
      discount?: string;
      adjustmentReason: string;
      saveRule?: boolean;
      discountVisible?: boolean;
    }[]
  >([{ project: "", final: "", discount: "0", adjustmentReason: "" }]);
  const [discount, setDiscount] = useState("0");
  const [includeVat, setIncludeVat] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {it.completeInspection}
      </Button>
      {open && (
        <FormDialog
          title={it.completeInspection}
          onClose={() => setOpen(false)}
        >
          <form
            className="dialog-form inspection-complete-form"
            data-form-dialog-body
            aria-busy={pending}
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending) return;
              setPending(true);
              setError("");
              const response = await completeInspectionAction(orderId, {
                inspectionResult: result,
                items,
                orderDiscount: discount,
                includeVat,
                dueDate,
              });
              setPending(false);
              if (!response.ok) return setError(response.error);
              setOpen(false);
              router.refresh();
            }}
          >
            <div className="inspection-banner">
              <Search size={19} />
              <div>
                <strong>{it.inspectionResult}</strong>
                <p>{it.inspectionResultHelp}</p>
              </div>
            </div>
            <Field label={`${it.inspectionResult} *`}>
              <textarea
                required
                rows={4}
                maxLength={2000}
                value={result}
                onChange={(event) => setResult(event.target.value)}
              />
            </Field>
            <ItemsEditor
              items={items}
              onChange={setItems}
              rules={rules}
              device={device}
              discounts
            />
            <Field label={it.orderDiscount}>
              <input
                inputMode="decimal"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeVat}
                onChange={(event) => setIncludeVat(event.target.checked)}
              />
              {it.includeVat}
            </label>
            <Field label={it.dueDate}>
              <input
                type="date"
                min={romeDay()}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
            <QuoteSummary
              items={items}
              orderDiscount={discount}
              includeVat={includeVat}
              inspectionFee={inspectionFee}
            />
            {error && <p className="message error">{error}</p>}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {it.cancel}
              </Button>
              <Button disabled={pending}>
                {pending ? it.saving : it.save}
              </Button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}
