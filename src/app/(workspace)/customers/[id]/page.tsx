import { requireActor } from "@/lib/session";
import { CustomerDetail } from "@/components/customer-detail";
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requireActor();
  const { id } = await params;
  const { q = "" } = await searchParams;
  return <CustomerDetail id={id} query={q} />;
}
