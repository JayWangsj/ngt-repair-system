import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { appVersion } from "./version";

const repository = "JayWangsj/ngt-repair-system";

type CommandResult = { stdout: string; stderr: string };
type CommandRunner = (
  executable: string,
  args: string[],
) => Promise<CommandResult>;
type ProcessLauncher = (
  executable: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
) => { unref: () => void };

export type StudioUpdateStatus = {
  status:
    | "idle"
    | "queued"
    | "checking"
    | "downloading"
    | "backing-up"
    | "installing"
    | "complete"
    | "failed";
  message?: string;
  updatedAt?: string;
};

export type StudioUpdateInfo = {
  installed: boolean;
  currentVersion: string;
  authRequired: boolean;
  updateAvailable: boolean;
  latestVersion?: string;
  releaseUrl?: string;
  publishedAt?: string;
  status?: StudioUpdateStatus;
};

function runCommand(executable: string, args: string[]) {
  return new Promise<CommandResult>((resolve, reject) => {
    execFile(
      executable,
      args,
      { timeout: 30_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) return reject(error);
        resolve({ stdout, stderr });
      },
    );
  });
}

function launchProcess(
  executable: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
) {
  return spawn(executable, args, options);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function normalizeVersion(value: string) {
  return value.replace(/^v/i, "").split("-")[0];
}

export function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function resolveGitHubCli(root: string) {
  const bundled = path.join(root, "runtime", "gh.exe");
  return existsSync(bundled) ? bundled : "gh";
}

async function getStudioContext(root: string) {
  const release = await readJson<{ version?: string }>(
    path.join(root, "studio-release.json"),
  );
  const config = await readJson<{
    installRoot?: string;
    repository?: string;
  }>(path.join(root, ".local", "studio.json"));
  return {
    release,
    config,
    currentVersion: release?.version || appVersion,
    repository: config?.repository || repository,
  };
}

function statusPath(installRoot: string) {
  return path.join(installRoot, "update-status.json");
}

export async function getStudioUpdateStatus(
  root = process.cwd(),
): Promise<StudioUpdateStatus> {
  const { config } = await getStudioContext(root);
  if (!config?.installRoot) return { status: "idle" };
  return (
    (await readJson<StudioUpdateStatus>(statusPath(config.installRoot))) || {
      status: "idle",
    }
  );
}

export async function checkStudioUpdate(
  options: { root?: string; run?: CommandRunner } = {},
): Promise<StudioUpdateInfo> {
  const root = options.root || process.cwd();
  const run = options.run || runCommand;
  const context = await getStudioContext(root);
  const status = await getStudioUpdateStatus(root);
  if (!context.release?.version) {
    return {
      installed: false,
      currentVersion: context.currentVersion,
      authRequired: false,
      updateAvailable: false,
      status,
    };
  }

  const githubCli = resolveGitHubCli(root);
  try {
    await run(githubCli, ["auth", "status", "--hostname", "github.com"]);
  } catch {
    return {
      installed: true,
      currentVersion: context.currentVersion,
      authRequired: true,
      updateAvailable: false,
      status,
    };
  }

  const result = await run(githubCli, [
    "release",
    "view",
    "--repo",
    context.repository,
    "--json",
    "tagName,url,publishedAt",
  ]);
  const latest = JSON.parse(result.stdout) as {
    tagName: string;
    url?: string;
    publishedAt?: string;
  };
  const latestVersion = normalizeVersion(latest.tagName);
  return {
    installed: true,
    currentVersion: context.currentVersion,
    authRequired: false,
    updateAvailable: compareVersions(latestVersion, context.currentVersion) > 0,
    latestVersion,
    releaseUrl: latest.url,
    publishedAt: latest.publishedAt,
    status,
  };
}

export async function startGitHubLogin(
  options: { root?: string; launch?: ProcessLauncher } = {},
) {
  const root = options.root || process.cwd();
  const context = await getStudioContext(root);
  if (!context.release?.version) throw new Error("studio_not_installed");
  const child = (options.launch || launchProcess)(
    resolveGitHubCli(root),
    [
      "auth",
      "login",
      "--hostname",
      "github.com",
      "--web",
      "--clipboard",
      "--git-protocol",
      "https",
    ],
    { cwd: root, detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
}

export async function startStudioUpdate(
  options: { root?: string; launch?: ProcessLauncher } = {},
) {
  const root = options.root || process.cwd();
  const context = await getStudioContext(root);
  if (!context.release?.version || !context.config?.installRoot) {
    throw new Error("studio_not_installed");
  }
  const status: StudioUpdateStatus = {
    status: "queued",
    updatedAt: new Date().toISOString(),
  };
  await writeFile(
    statusPath(context.config.installRoot),
    JSON.stringify(status),
    "utf8",
  );
  const script = path.join(root, "scripts", "update-windows-studio.ps1");
  const child = (options.launch || launchProcess)(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { cwd: root, detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
}
