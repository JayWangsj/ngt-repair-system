import { db } from "@/lib/db";
import { getStudioRuntimeInfo } from "@/lib/studio-update";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", ...(await getStudioRuntimeInfo()) });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
