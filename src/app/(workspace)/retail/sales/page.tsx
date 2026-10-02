import { redirect } from "next/navigation";

export default async function RetailSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const query = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(query.period ?? "")
    ? `&period=${query.period}`
    : "";
  redirect(`/retail?view=sales${period}`);
}
