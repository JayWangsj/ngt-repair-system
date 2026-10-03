import { redirect } from "next/navigation";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const requestedDay = (await searchParams).day;
  const params = new URLSearchParams({ stats: "1" });
  if (requestedDay && /^\d{4}-\d{2}-\d{2}$/.test(requestedDay))
    params.set("day", requestedDay);
  redirect(`/?${params.toString()}`);
}
