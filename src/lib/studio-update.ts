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
type AuthProcess = {
  stdin: { write: (value: string) => boolean; end: () => void };
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  once: {
    (event: "error", listener: (error: Error) => void): unknown;
    (event: "close", listener: (code: number | null) => void): unknown;
  };
  kill: () => boolean;
  unref: () => void;
};
type AuthProcessLauncher = (
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: ["pipe", "pipe", "pipe"];
    windowsHide: boolean;
  },
) => AuthProcess;

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

export type GitHubLoginStatus = {
  status: "idle" | "opening" | "waiting" | "success" | "failed";
  message?: string;
  verificationUrl?: string;
  userCode?: string;
  updatedAt?: string;
};

const githubDeviceUrl = "https://github.com/login/device";
const activeGitHubLogins = new Map<string, AuthProcess>();
const authStatusWrites = new Map<string, Promise<void>>();

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

function launchAuthProcess(
  executable: string,
  args: string[],
  options: Parameters<AuthProcessLauncher>[2],
) {
  return spawn(executable, args, options) as AuthProcess;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents.replace(/^\uFEFF/, "")) as T;
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

function authStatusPath(installRoot: string) {
  return path.join(installRoot, "github-auth-status.json");
}

function writeGitHubLoginStatus(
  installRoot: string,
  status: GitHubLoginStatus,
) {
  const filePath = authStatusPath(installRoot);
  const previous = authStatusWrites.get(filePath) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await writeFile(
        filePath,
        JSON.stringify({ ...status, updatedAt: new Date().toISOString() }),
        "utf8",
      );
    });
  authStatusWrites.set(filePath, next);
  void next.then(
    () => {
      if (authStatusWrites.get(filePath) === next)
        authStatusWrites.delete(filePath);
    },
    () => {
      if (authStatusWrites.get(filePath) === next)
        authStatusWrites.delete(filePath);
    },
  );
  return next;
}

function cleanGitHubOutput(value: string) {
  return value
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .trim();
}

function githubFailureMessage(output: string, fallback: string) {
  const cleaned = cleanGitHubOutput(output);
  if (!cleaned) return fallback;
  return cleaned.split("\n").filter(Boolean).slice(-3).join(" ");
}

function resolveStudioRoot(root?: string) {
  return root || process.env.NGT_STUDIO_ROOT || process.cwd();
}

export async function getStudioUpdateStatus(
  root?: string,
): Promise<StudioUpdateStatus> {
  const { config } = await getStudioContext(resolveStudioRoot(root));
  if (!config?.installRoot) return { status: "idle" };
  return (
    (await readJson<StudioUpdateStatus>(statusPath(config.installRoot))) || {
      status: "idle",
    }
  );
}

export async function getGitHubLoginStatus(
  root?: string,
): Promise<GitHubLoginStatus> {
  const { config } = await getStudioContext(resolveStudioRoot(root));
  if (!config?.installRoot) return { status: "idle" };
  return (
    (await readJson<GitHubLoginStatus>(authStatusPath(config.installRoot))) || {
      status: "idle",
    }
  );
}

export async function checkStudioUpdate(
  options: { root?: string; run?: CommandRunner } = {},
): Promise<StudioUpdateInfo> {
  const root = resolveStudioRoot(options.root);
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
  options: {
    root?: string;
    launch?: AuthProcessLauncher;
    run?: CommandRunner;
    timeoutMs?: number;
  } = {},
) {
  const root = resolveStudioRoot(options.root);
  const context = await getStudioContext(root);
  if (!context.release?.version || !context.config?.installRoot) {
    throw new Error("studio_not_installed");
  }
  const installRoot = context.config.installRoot;
  if (activeGitHubLogins.has(root)) return getGitHubLoginStatus(root);

  const githubCli = resolveGitHubCli(root);
  const initialStatus: GitHubLoginStatus = {
    status: "opening",
    verificationUrl: githubDeviceUrl,
  };
  await writeGitHubLoginStatus(installRoot, initialStatus);

  const child = (options.launch || launchAuthProcess)(
    githubCli,
    [
      "auth",
      "login",
      "--hostname",
      "github.com",
      "--web",
      "--clipboard",
      "--git-protocol",
      "https",
      "--scopes",
      "repo",
    ],
    {
      cwd: root,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  activeGitHubLogins.set(root, child);
  child.unref();

  let output = "";
  let finished = false;
  let userCode: string | undefined;
  const rememberOutput = (chunk: unknown) => {
    output = `${output}${String(chunk)}`.slice(-16_384);
    const nextCode = cleanGitHubOutput(output).match(
      /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/,
    )?.[0];
    if (nextCode && nextCode !== userCode) {
      userCode = nextCode;
      void writeGitHubLoginStatus(installRoot, {
        status: "waiting",
        verificationUrl: githubDeviceUrl,
        userCode,
      });
    }
  };
  child.stdout.on("data", rememberOutput);
  child.stderr.on("data", rememberOutput);

  // GitHub CLI waits for interactive confirmation before opening the browser
  // and starting device-code polling. The installed studio has no console, so
  // accept the default HTTPS credential prompt and the browser prompt here.
  child.stdin.write("\n\n");

  const finish = async (status: GitHubLoginStatus) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    activeGitHubLogins.delete(root);
    child.stdin.end();
    await writeGitHubLoginStatus(installRoot, status);
  };
  const timeout = setTimeout(
    () => {
      child.kill();
      void finish({
        status: "failed",
        message: "GitHub authorization timed out before it was completed.",
        verificationUrl: githubDeviceUrl,
        userCode,
      });
    },
    options.timeoutMs ?? 15 * 60_000,
  );
  timeout.unref();

  child.once("error", (error) => {
    void finish({
      status: "failed",
      message: error.message,
      verificationUrl: githubDeviceUrl,
      userCode,
    });
  });
  child.once("close", (code) => {
    void (async () => {
      if (code !== 0) {
        await finish({
          status: "failed",
          message: githubFailureMessage(
            output,
            `GitHub CLI exited with code ${code ?? "unknown"}.`,
          ),
          verificationUrl: githubDeviceUrl,
          userCode,
        });
        return;
      }
      try {
        const run = options.run || runCommand;
        await run(githubCli, ["auth", "status", "--hostname", "github.com"]);
        await run(githubCli, [
          "release",
          "view",
          "--repo",
          context.repository,
          "--json",
          "tagName",
        ]);
        await finish({ status: "success" });
      } catch (cause) {
        await finish({
          status: "failed",
          message:
            cause instanceof Error
              ? `GitHub authorization completed, but the private repository is not accessible: ${cause.message}`
              : "GitHub authorization completed, but the private repository is not accessible.",
          verificationUrl: githubDeviceUrl,
          userCode,
        });
      }
    })();
  });
  return initialStatus;
}

export async function startStudioUpdate(
  options: { root?: string; launch?: ProcessLauncher } = {},
) {
  const root = resolveStudioRoot(options.root);
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
