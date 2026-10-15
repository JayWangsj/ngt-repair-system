import {
  getGitHubLoginStatus,
  sanitizeUpdateDiagnostic,
  startGitHubLogin,
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
    return Response.json(await getGitHubLoginStatus());
  } catch (cause) {
    const error = sanitizeUpdateDiagnostic(
      cause instanceof Error ? cause.message : "auth_status_failed",
    );
    return Response.json({ error }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginWriteRequest(request))
    return Response.json(
      { error: "cross_origin_request_rejected" },
      { status: 403 },
    );
  try {
    const status = await startGitHubLogin();
    return Response.json({ started: true, ...status }, { status: 202 });
  } catch (cause) {
    const error = sanitizeUpdateDiagnostic(
      cause instanceof Error ? cause.message : "auth_failed",
    );
    return Response.json({ error }, { status: 409 });
  }
}
