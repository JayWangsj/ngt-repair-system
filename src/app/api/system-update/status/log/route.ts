import { getStudioUpdateLog } from "@/lib/studio-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ log: await getStudioUpdateLog() });
  } catch {
    return Response.json({ log: "" });
  }
}
