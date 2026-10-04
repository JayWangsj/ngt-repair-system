import { getStudioUpdateStatus } from "@/lib/studio-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await getStudioUpdateStatus());
}
