import { CustomerForm } from "@/components/forms";
import { PageHeader } from "@/components/common";
import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
export default async function NewCustomer() {
  await requireActor();
  const it = await getMessages();
  return (
    <>
      <PageHeader title={it.addCustomer} />
      <section className="panel padded">
        <CustomerForm />
      </section>
    </>
  );
}
