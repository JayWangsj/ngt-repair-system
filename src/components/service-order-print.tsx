import { it } from "@/messages/it";
import { BrandLogo } from "./brand-logo";

type PrintLine = {
  label: string;
  amount: string;
};

type PrintDevice = {
  name: string;
  imei?: string | null;
};

type PrintWarranty = {
  project: string;
  days: number;
};

export function ServiceOrderPrint({
  code,
  acceptedAt,
  expectedAt,
  customerName,
  customerPhone,
  devices,
  appearance,
  accessories,
  problem,
  interventions,
  discount,
  vat,
  total,
  paid,
  remaining,
  paymentStatus,
  paymentMethods,
  warranties,
}: {
  code: string;
  acceptedAt: string;
  expectedAt: string;
  customerName: string;
  customerPhone: string;
  devices: PrintDevice[];
  appearance?: string | null;
  accessories?: string | null;
  problem: string[];
  interventions: PrintLine[];
  discount?: string;
  vat?: string;
  total: string;
  paid: string;
  remaining: string;
  paymentStatus: string;
  paymentMethods: string[];
  warranties: PrintWarranty[];
}) {
  const labels = it.printOrder;
  const densityScore =
    interventions.length +
    devices.length +
    warranties.length +
    Math.floor(problem.join(" ").length / 120);
  const density =
    densityScore > 10 ? " is-compact" : densityScore > 7 ? " is-dense" : "";
  const copies = [
    { key: "customer", title: labels.customerCopy, shop: false },
    { key: "shop", title: labels.shopCopy, shop: true },
  ] as const;

  return (
    <section
      className={`service-order-print${density}`}
      data-testid="service-order-print"
    >
      <div className="service-order-print-sheet">
        <div className="service-order-print-cut" aria-hidden="true">
          <span>✂</span>
        </div>
        {copies.map((copy) => (
          <article className="service-order-print-copy" key={copy.key}>
            <header className="service-order-print-header">
              <div className="service-order-print-brand" aria-label="NGT">
                <BrandLogo className="service-order-print-logo" />
              </div>
              <strong>{copy.title}</strong>
            </header>

            <strong className="service-order-print-title">
              {labels.title}
            </strong>
            <div className="service-order-print-meta">
              <strong>
                {labels.orderNumber} <span>{code}</span>
              </strong>
              <dl>
                <div>
                  <dt>{labels.acceptedAt}</dt>
                  <dd>{acceptedAt}</dd>
                </div>
                <div>
                  <dt>{labels.expectedAt}</dt>
                  <dd>{expectedAt}</dd>
                </div>
              </dl>
            </div>

            <PrintSection title={labels.customer}>
              <PrintField label={labels.name} value={customerName} />
              <PrintField label={labels.phone} value={customerPhone} />
            </PrintSection>

            <PrintSection title={labels.device}>
              {devices.map((device, index) => (
                <div
                  className="service-order-print-device"
                  key={`${device.name}-${index}`}
                >
                  <PrintField
                    label={
                      devices.length > 1
                        ? `${labels.model} ${index + 1}`
                        : labels.model
                    }
                    value={device.name}
                  />
                  {device.imei && (
                    <PrintField label={labels.imei} value={device.imei} />
                  )}
                </div>
              ))}
              {appearance && (
                <PrintField label={labels.appearance} value={appearance} />
              )}
              {accessories && (
                <PrintField label={labels.accessories} value={accessories} />
              )}
            </PrintSection>

            <PrintSection
              title={labels.problem}
              className="service-order-print-problem"
            >
              {problem.length ? (
                problem.map((line) => <p key={line}>{line}</p>)
              ) : (
                <p>—</p>
              )}
            </PrintSection>

            <section className="service-order-print-section service-order-print-interventions">
              <h2>{labels.interventions}</h2>
              <table>
                <thead>
                  <tr>
                    <th>{labels.description}</th>
                    <th>{labels.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.length ? (
                    interventions.map((line, index) => (
                      <tr
                        className="service-order-print-line"
                        key={`${line.label}-${index}`}
                      >
                        <td>{line.label}</td>
                        <td>{line.amount}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  {discount && (
                    <tr>
                      <th>{labels.discount}</th>
                      <td>-{discount}</td>
                    </tr>
                  )}
                  {vat && (
                    <tr>
                      <th>{labels.vat}</th>
                      <td>{vat}</td>
                    </tr>
                  )}
                  <tr>
                    <th>{labels.total}</th>
                    <td>{total}</td>
                  </tr>
                  <tr className="service-order-print-balance">
                    <th>{labels.remaining}</th>
                    <td>{remaining}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <PrintSection
              title={labels.payments}
              className="service-order-print-payments"
            >
              <PrintField label={labels.paid} value={paid} />
              <PrintField
                label={labels.paymentMethod}
                value={paymentMethods.length ? paymentMethods.join(", ") : "—"}
              />
              <PrintField label={labels.paymentStatus} value={paymentStatus} />
            </PrintSection>

            {copy.shop && (
              <PrintSection
                title={labels.internalNotes}
                className="service-order-print-notes"
              >
                <div aria-hidden="true" />
              </PrintSection>
            )}

            <PrintSection
              title={labels.warrantyAndSignatures}
              className="service-order-print-signatures"
            >
              <div className="service-order-print-warranties">
                {warranties.length ? (
                  warranties.map((warranty) => (
                    <span key={warranty.project}>
                      {warranty.project}: {warranty.days} {labels.days}
                    </span>
                  ))
                ) : (
                  <span>{labels.noWarranty}</span>
                )}
              </div>
              <div className="service-order-print-signature-lines">
                <span>{labels.customerSignature}</span>
                <span>{labels.shopSignature}</span>
                <span>{labels.date}</span>
              </div>
            </PrintSection>
          </article>
        ))}
      </div>
    </section>
  );
}

function PrintSection({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`service-order-print-section ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div className="service-order-print-field">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}
