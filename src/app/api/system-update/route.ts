import {
  checkStudioUpdate,
  sanitizeUpdateDiagnostic,
  sanitizeUpdateStatus,
  startStudioUpdate,
} from "@/lib/studio-update";
import {
  isSameOriginRequest,
  isSameOriginWriteRequest,
} from "@/lib/request-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "local_request_required" }, { status: 403 });
  try {
    const result = await checkStudioUpdate();
    return Response.json({
      ...result,
      status: result.status ? sanitizeUpdateStatus(result.status) : undefined,
    });
  } catch (cause) {
    const error = sanitizeUpdateDiagnostic(
      cause instanceof Error ? cause.message : "update_check_failed",
    );
    return Response.json({ error }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginWriteRequest(request))
    return Response.json(
      { error: "cross_origin_request_rejected" },
      { status: 403 },
    );
  try {
    const body = (await request.json()) as { targetVersion?: unknown };
    if (
      typeof body.targetVersion !== "string" ||
      !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(body.targetVersion)
    )
      return Response.json(
        { error: "update_target_required" },
        { status: 400 },
      );
    const status = await startStudioUpdate({
      targetVersion: body.targetVersion,
    });
    return Response.json({ started: true, ...status }, { status: 202 });
  } catch (cause) {
    const error = sanitizeUpdateDiagnostic(
      cause instanceof Error ? cause.message : "update_failed",
    );
    return Response.json({ error }, { status: 409 });
  }
}
