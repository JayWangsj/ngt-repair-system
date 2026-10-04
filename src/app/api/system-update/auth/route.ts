import { startGitHubLogin } from "@/lib/studio-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    await startGitHubLogin();
    return Response.json({ started: true }, { status: 202 });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "auth_failed";
    return Response.json({ error }, { status: 409 });
  }
}
