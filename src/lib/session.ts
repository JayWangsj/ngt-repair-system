import { auth } from "@/auth";
import { db } from "./db";
import { redirect } from "next/navigation";
export async function requireActor() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const actor = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true, enabled: true },
  });
  if (!actor?.enabled) redirect("/login");
  return actor;
}
