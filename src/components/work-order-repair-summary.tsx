"use client";

import { useState } from "react";
import { ChevronRight, Package, Wrench } from "lucide-react";
import { cents, money } from "@/lib/domain";
import {
  ItemsEditor,
  QuoteItemsDraftForm,
  type CategoryView,
  type ItemView,
  type RuleView,
} from "./forms";
import { useMessages } from "./language";
import { useOrderDetailEdit } from "./order-detail-ui";

type Product = {
  id: string;
  name: string;
  category: string;
  stock: number;
  reserved: number;
  available: number;
};
type SummaryItem = ItemView & {
  source: string;
  requiredProduct?: Product | null;
};

export function WorkOrderRepairSummary({
  orderId,
  items,
  rules,
  device,
  products,
  productCategories,
  initialDiscount,
  initialVat,
  locked,
}: {
  orderId: string;
  items: SummaryItem[];
  rules: RuleView[];
  device: { category: string; brand: string; series: string; model: string };
  products: Product[];
  productCategories: CategoryView[];
  initialDiscount: string;
  initialVat: boolean;
  inspectionFee: string;
  owner: boolean;
  locked: boolean;
}) {
  const it = useMessages();
  const cardEdit = useOrderDetailEdit();
  const session = cardEdit?.session ?? 0;
  const [draft, setDraft] = useState<{ session: number; items: ItemView[] }>({
    session,
    items,
  });
  if (cardEdit?.editing && draft.session !== session)
    setDraft({ session, items });
  const draftItems = draft.items;
  const setDraftItems = (next: ItemView[]) =>
    setDraft({ session, items: next });
  const editing = cardEdit?.target?.kind === "repair" ? cardEdit.target : null;
  const change = (index: number, field: "project" | "part") => {
    if (!locked) cardEdit?.requestEdit({ kind: "repair", index, field });
  };
  const editor = (index: number, field: "project" | "part") => (
    <div className={`detail-repair-editor is-${field}`}>
      <ItemsEditor
        items={draftItems}
        onChange={setDraftItems}
        rules={rules}
        device={device}
        products={products}
        productCategories={productCategories}
        initialEdit={{ index, field }}
        focusedEdit
        showEmptyPartSummary
        onFocusedEditComplete={cardEdit?.clearTarget}
      />
    </div>
  );
  const displayedItems = cardEdit?.editing ? draftItems : items;

  return (
    <section className="detail-repair-summaries">
      <h3>{it.quoteSection}</h3>
      {displayedItems.map((item, index) => {
        const product = products.find(
          (candidate) => candidate.id === item.requiredProductId,
        );
        return (
          <div
            className="detail-repair-summary"
            key={`${item.project}-${index}`}
          >
            {editing?.index === index && editing.field === "project" ? (
              editor(index, "project")
            ) : (
              <div
                className={`selection-summary selected-project-summary${locked ? "" : " is-actionable"}`}
                onClick={() => change(index, "project")}
              >
                <span className="selection-summary-icon is-project">
                  <Wrench size={18} aria-hidden="true" />
                </span>
                <div className="selection-summary-copy">
                  <strong>{item.project}</strong>
                  <small>{items[index]?.source}</small>
                </div>
                <div className="selection-summary-value">
                  <small>{it.currentQuote}</small>
                  <strong>{money(cents(item.final))}</strong>
                </div>
                {!locked && (
                  <button
                    type="button"
                    className="summary-action"
                    onClick={() => change(index, "project")}
                  >
                    <span>{it.change}</span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            <strong className="quote-required-part-label">
              {it.requiredPart} ({it.optional})
            </strong>
            {editing?.index === index && editing.field === "part" ? (
              editor(index, "part")
            ) : (
              <div
                className={`selection-summary selected-part-summary${locked ? "" : " is-actionable"}`}
                onClick={() => change(index, "part")}
              >
                <span className="selection-summary-icon is-part">
                  <Package size={18} aria-hidden="true" />
                </span>
                <div className="selection-summary-copy">
                  <strong>{product?.name ?? it.afterSales.noPart}</strong>
                  {product && (
                    <small>
                      {product.category} · {it.actualStock} {product.stock} ·{" "}
                      {it.reservedStock} {product.reserved} ·{" "}
                      {it.availableStock} {product.available} ·{" "}
                      <span
                        className={`part-stock ${product.available > 0 ? "is-available" : "is-empty"}`}
                      >
                        ●{" "}
                        {product.available > 0
                          ? it.partInStock
                          : it.partOutOfStock}
                      </span>
                    </small>
                  )}
                </div>
                {!locked && (
                  <button
                    type="button"
                    className="summary-action"
                    onClick={() => change(index, "part")}
                  >
                    <span>{it.change}</span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {cardEdit?.editing && !locked && (
        <QuoteItemsDraftForm
          id={orderId}
          items={draftItems}
          orderDiscount={initialDiscount}
          includeVat={initialVat}
        />
      )}
    </section>
  );
}
