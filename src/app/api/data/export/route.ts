import { requireActor } from "@/lib/session";
import { exportBusinessData } from "@/lib/data-transfer";

export async function GET() {
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
