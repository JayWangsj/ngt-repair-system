import { cents, romeDay } from "./domain";

type Allocation = {
  source: "REPAIR" | "RETAIL";
  amount: string | { toString(): string };
};
export type BusinessPayment = {
  amount: string | { toString(): string };
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  receivedAt: Date | string;
  orderId?: string | null;
  saleId?: string | null;
  allocations?: Allocation[];
};

export function revenueParts(payment: BusinessPayment) {
  if (payment.allocations?.length) {
    return payment.allocations.reduce(
      (result, allocation) => {
        result[allocation.source.toLowerCase() as "repair" | "retail"] += cents(
          allocation.amount,
        );
        return result;
      },
      { repair: 0, retail: 0 },
    );
  }
  return payment.saleId
    ? { repair: 0, retail: cents(payment.amount) }
    : { repair: cents(payment.amount), retail: 0 };
}

export function summarizePayments(payments: BusinessPayment[], day?: string) {
  return payments
    .filter((payment) => !day || romeDay(new Date(payment.receivedAt)) === day)
    .reduce(
      (summary, payment) => {
        const parts = revenueParts(payment);
        const amount = cents(payment.amount);
        summary.total += amount;
        summary.repair += parts.repair;
        summary.retail += parts.retail;
        const method = payment.method === "TRANSFER" ? "OTHER" : payment.method;
        summary.methods[method] += amount;
        return summary;
      },
      {
        total: 0,
        repair: 0,
        retail: 0,
        methods: { CASH: 0, CARD: 0, OTHER: 0 },
      },
    );
}

export function recentRomeDays(today: string, count = 7) {
  const [year, month, day] = today.split("-").map(Number);
  const anchor = Date.UTC(year, month - 1, day, 12);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(anchor - (count - index - 1) * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}

export function revenueSeries(
  payments: BusinessPayment[],
  today: string,
  count = 7,
) {
  return recentRomeDays(today, count).map((day) => ({
    day,
    ...summarizePayments(payments, day),
  }));
}
