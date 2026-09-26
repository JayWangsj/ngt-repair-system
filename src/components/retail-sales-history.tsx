"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { FormDialog } from "./forms";
import { useMessages } from "./language";
import { money } from "@/lib/domain";

export type SaleHistoryRow = {
  id: string;
  code: string;
  date: string;
  itemCount: number;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER" | null;
  subtotal: number;
  discount: number;
  total: number;
  items: {
    id: string;
    name: string;
    category: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }[];
};

export function RetailSalesHistory({ sales }: { sales: SaleHistoryRow[] }) {
  const it = useMessages();
  const [selected, setSelected] = useState<SaleHistoryRow | null>(null);
  return (
    <>
      <section className="panel table-panel">
        {sales.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{it.retail.saleNumber}</th>
                  <th>{it.retail.date}</th>
                  <th>{it.retail.quantity}</th>
                  <th>{it.retail.paymentMethod}</th>
                  <th className="numeric">{it.retail.amount}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <button
                        className="order-link sale-number-button"
                        onClick={() => setSelected(sale)}
                      >
                        {sale.code}
                        <ChevronRight size={15} />
                      </button>
                    </td>
                    <td>{sale.date}</td>
                    <td>{sale.itemCount}</td>
                    <td>{sale.method ? it.methods[sale.method] : "—"}</td>
                    <td className="numeric">{money(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="inventory-empty">{it.retail.noSales}</p>
        )}
      </section>
      {selected && (
        <FormDialog
          title={`${it.retail.detail} · ${selected.code}`}
          onClose={() => setSelected(null)}
        >
          <div className="retail-sale-dialog">
            <small>{selected.date}</small>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{it.inventory.product}</th>
                    <th className="numeric">{it.retail.unitPrice}</th>
                    <th className="numeric">{it.retail.quantity}</th>
                    <th className="numeric">{it.retail.subtotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>{item.category}</small>
                      </td>
                      <td className="numeric">{money(item.unitPrice)}</td>
                      <td className="numeric">{item.quantity}</td>
                      <td className="numeric">{money(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="quote-summary">
              <div>
                <dt>{it.retail.subtotal}</dt>
                <dd>{money(selected.subtotal)}</dd>
              </div>
              <div>
                <dt>{it.retail.discount}</dt>
                <dd>− {money(selected.discount)}</dd>
              </div>
              <div>
                <dt>{it.retail.total}</dt>
                <dd>{money(selected.total)}</dd>
              </div>
            </dl>
          </div>
        </FormDialog>
      )}
    </>
  );
}
