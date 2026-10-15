import { db } from "@/lib/db";
import { getStudioRuntimeInfo } from "@/lib/studio-update";
import { isLoopbackRequest } from "@/lib/request-source";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!isLoopbackRequest(request))
    return Response.json({ status: "unavailable" }, { status: 403 });
  try {
    await db.$queryRaw`SELECT 1`;
    await db.$queryRaw`SELECT "id" FROM "WorkOrder" LIMIT 1`;
    return Response.json({ status: "ok", ...(await getStudioRuntimeInfo()) });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
