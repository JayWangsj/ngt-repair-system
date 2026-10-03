import { checkoutWorkOrderAction, statusAction } from "@/app/actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
