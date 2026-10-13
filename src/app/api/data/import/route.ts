import { BusinessError } from "@/lib/domain";
import { importBusinessData } from "@/lib/data-transfer";
import { isSameOriginWriteRequest } from "@/lib/request-source";
import { requireActor } from "@/lib/session";

export async function POST(request: Request) {
  if (!isSameOriginWriteRequest(request))
    return Response.json(
      { error: "cross_origin_request_rejected" },
      { status: 403 },
    );
  try {
    const size = Number(request.headers.get("content-length") ?? "0");
    if (size > 20 * 1024 * 1024)
      return Response.json({ error: "File troppo grande." }, { status: 413 });
    const actor = await requireActor();
    const result = await importBusinessData(actor, await request.json());
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof BusinessError
        ? error.message
        : "File di backup non valido.";
    return Response.json({ error: message }, { status: 400 });
  }
}
