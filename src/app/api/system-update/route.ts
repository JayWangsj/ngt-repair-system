import { checkStudioUpdate, startStudioUpdate } from "@/lib/studio-update";

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

export async function POST() {
  try {
    await startStudioUpdate();
    return Response.json({ started: true }, { status: 202 });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "update_failed";
    return Response.json({ error }, { status: 409 });
  }
}
