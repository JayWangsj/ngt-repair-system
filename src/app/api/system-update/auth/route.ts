import { getGitHubLoginStatus, startGitHubLogin } from "@/lib/studio-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getGitHubLoginStatus());
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "auth_status_failed";
    return Response.json({ error }, { status: 500 });
  }
}

export async function POST() {
  try {
    const status = await startGitHubLogin();
    return Response.json({ started: true, ...status }, { status: 202 });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "auth_failed";
    return Response.json({ error }, { status: 409 });
  }
}
