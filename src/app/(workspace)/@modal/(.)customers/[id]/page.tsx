import { CustomerDetail } from "@/components/customer-detail";
import { requireActor } from "@/lib/session";

export default async function CustomerDetailModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requireActor();
  const { id } = await params;
  const { q = "" } = await searchParams;
  return <CustomerDetail id={id} query={q} dialog />;
}
