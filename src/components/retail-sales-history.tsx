import { ChevronRight } from "lucide-react";
import { DatePicker } from "./business-select";
import { useMessages } from "./language";
import { money } from "@/lib/domain";

export type SaleHistoryRow = {
  id: string;
  code: string;
  date: string;
  period: string;
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

export function RetailSalesHistory({
  sales,
  period,
  onPeriodChange,
  onSelect,
}: {
  sales: SaleHistoryRow[];
  period: string;
  onPeriodChange: (period: string) => void;
  onSelect: (sale: SaleHistoryRow) => void;
}) {
  const it = useMessages();
  const filtered = sales.filter((sale) => sale.period === period);
  return (
    <div className="retail-history-dialog" data-form-dialog-body>
      <DatePicker
        className="retail-period-picker"
        aria-label={it.month}
        name="period"
        type="month"
        value={period}
        onChange={(event) => onPeriodChange(event.target.value)}
      />
      <section className="panel table-panel">
        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{it.retail.saleNumber}</th>
                  <th>{it.retail.date}</th>
                  <th className="numeric">{it.retail.quantity}</th>
                  <th>{it.retail.paymentMethod}</th>
                  <th className="numeric">{it.retail.amount}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr className="business-list-row" key={sale.id}>
                    <td>
                      <button
                        className="order-link order-code-link sale-number-button"
                        onClick={() => onSelect(sale)}
                      >
                        <span>{sale.code}</span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    </td>
                    <td>{sale.date}</td>
                    <td className="numeric">{sale.itemCount}</td>
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
    </div>
  );
}

export function RetailSaleDetail({ sale }: { sale: SaleHistoryRow }) {
  const it = useMessages();
  return (
    <div className="retail-sale-dialog" data-form-dialog-body>
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
            {sale.items.map((item) => (
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
          <dd>{money(sale.subtotal)}</dd>
        </div>
        <div>
          <dt>{it.retail.discount}</dt>
          <dd>− {money(sale.discount)}</dd>
        </div>
        <div>
          <dt>{it.retail.total}</dt>
          <dd>{money(sale.total)}</dd>
        </div>
        <div>
          <dt>{it.retail.paymentMethod}</dt>
          <dd>{sale.method ? it.methods[sale.method] : "—"}</dd>
        </div>
        <div>
          <dt>{it.retail.date}</dt>
          <dd>{sale.date}</dd>
        </div>
      </dl>
    </div>
  );
}
