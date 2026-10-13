import { checkoutWorkOrderAction, statusAction } from "@/app/actions";
import { isSameOriginWriteRequest } from "@/lib/request-source";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginWriteRequest(request))
    return Response.json(
      { error: "cross_origin_request_rejected" },
      { status: 403 },
    );
  const { id } = await params;
  const body = (await request.json()) as {
    mutation?: "status" | "checkout";
    input?: unknown;
  };
  const result =
    body.mutation === "checkout"
      ? await checkoutWorkOrderAction(id, body.input, false)
      : await statusAction(id, body.input, false);
  return Response.json(result);
}
