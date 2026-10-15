import { requireActor } from "@/lib/session";
import { exportBusinessData } from "@/lib/data-transfer";
import { isSameOriginRequest } from "@/lib/request-source";

export async function GET(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "local_request_required" }, { status: 403 });
  await requireActor();
  const backup = await exportBusinessData();
  const day = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="ngt-backup-' + day + '.json"',
      "Cache-Control": "no-store",
    },
  });
}
