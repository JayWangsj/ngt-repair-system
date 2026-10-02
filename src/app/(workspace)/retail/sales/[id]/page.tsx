import { redirect } from "next/navigation";

export default async function RetailSaleDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/retail?view=sale&id=${encodeURIComponent(id)}`);
}
