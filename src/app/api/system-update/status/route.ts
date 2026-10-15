import {
  getStudioUpdateStatus,
  getStudioRuntimeInfo,
  sanitizeUpdateDiagnostic,
  sanitizeUpdateStatus,
} from "@/lib/studio-update";
import { isSameOriginRequest } from "@/lib/request-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "local_request_required" }, { status: 403 });
  try {
    const [status, runtime] = await Promise.all([
      getStudioUpdateStatus(),
      getStudioRuntimeInfo(),
    ]);
    return Response.json({ ...sanitizeUpdateStatus(status), ...runtime });
  } catch (cause) {
    const error = sanitizeUpdateDiagnostic(
      cause instanceof Error ? cause.message : "update_status_failed",
    );
    return Response.json(
      { status: "verifying-task", message: error },
      { status: 503 },
    );
  }
}
