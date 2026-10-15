import {
  getStudioUpdateStatus,
  sanitizeUpdateDiagnostic,
  sanitizeUpdateStatus,
} from "@/lib/studio-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(sanitizeUpdateStatus(await getStudioUpdateStatus()));
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
