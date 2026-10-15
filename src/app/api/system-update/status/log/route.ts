import { getStudioUpdateLog } from "@/lib/studio-update";
import { isSameOriginRequest } from "@/lib/request-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "local_request_required" }, { status: 403 });
  try {
    return Response.json({ log: await getStudioUpdateLog() });
  } catch {
    return Response.json({ log: "" });
  }
}
