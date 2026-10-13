import { checkStudioUpdate, startStudioUpdate } from "@/lib/studio-update";
import { isSameOriginWriteRequest } from "@/lib/request-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await checkStudioUpdate());
  } catch (cause) {
    const error =
      cause instanceof Error ? cause.message : "update_check_failed";
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
    await startStudioUpdate();
    return Response.json({ started: true }, { status: 202 });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "update_failed";
    return Response.json({ error }, { status: 409 });
  }
}
