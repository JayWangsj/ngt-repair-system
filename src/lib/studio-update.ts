import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
) => ChildProcess;
type ProcessInspector = (options: {
  updateId?: string;
  executorPid?: number;
  scriptPath: string;
}) => Promise<boolean | undefined>;
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
    | "starting"
    | "queued"
    | "running"
    | "checking"
    | "downloading"
    | "downloaded"
    | "verifying"
    | "preparing-runtime"
    | "backing-up"
    | "installing"
    | "validating"
    | "rolling-back"
    | "complete"
    | "failed"
    | "interrupted"
    | "verifying-task"
    | "unknown";
  message?: string;
  stage?: string;
  updateId?: string;
  targetVersion?: string;
  previousVersion?: string;
  currentVersion?: string;
  actualVersion?: string;
  executorPid?: number;
  executorAlive?: boolean;
  executorConfirmed?: boolean;
  createdAt?: string;
  latestVersion?: string;
  completedStages?: string[];
  skippedStages?: string[];
  failedStage?: string;
  recoveryStatus?: "not-started" | "running" | "succeeded" | "failed";
  recoveryMessage?: string;
  manualReview?: boolean;
  previousStatus?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  progressKnown?: boolean;
  updatedAt?: string;
};

export type StudioUpdateInfo = {
  installed: boolean;
  currentVersion: string;
  authRequired: boolean;
  updateAvailable: boolean;
  notInstallable?: boolean;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadSize?: number;
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
const processInspectionCache = new Map<
  string,
  { checkedAt: number; alive: boolean | undefined }
>();
const activeUpdateRoots = new Set<string>();

function runCommand(executable: string, args: string[]) {
  return new Promise<CommandResult>((resolve, reject) => {
    execFile(
      executable,
      args,
      { timeout: 30_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim();
          return reject(new Error(detail || error.message));
        }
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

async function readJsonState<T>(filePath: string) {
  try {
    const contents = await readFile(filePath, "utf8");
    return {
      exists: true,
      value: JSON.parse(contents.replace(/^\uFEFF/, "")) as T,
      unreadable: false,
    };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, value: null, unreadable: false };
    }
    return { exists: true, value: null, unreadable: true };
  }
}

async function readUpdateLock(filePath: string) {
  try {
    const contents = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
    try {
      return {
        exists: true,
        value: JSON.parse(contents) as {
          updateId?: string;
          executorPid?: number;
          createdAt?: string;
        },
        unreadable: false,
      };
    } catch {
      const legacyCreatedAt = contents.trim();
      if (Number.isFinite(Date.parse(legacyCreatedAt)))
        return {
          exists: true,
          value: { createdAt: legacyCreatedAt },
          unreadable: false,
        };
      return { exists: true, value: null, unreadable: true };
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT")
      return { exists: false, value: null, unreadable: false };
    return { exists: true, value: null, unreadable: true };
  }
}

async function writeJsonAtomically(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value), "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function inspectUpdaterProcess(
  options: Parameters<ProcessInspector>[0],
): Promise<boolean | undefined> {
  if (process.platform !== "win32") return Promise.resolve(undefined);
  const cacheKey = `${options.executorPid || "scan"}:${options.updateId || "legacy"}`;
  const cached = processInspectionCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < 3_000)
    return Promise.resolve(cached.alive);

  const scriptPath = options.scriptPath.replace(/'/g, "''");
  const updateId = options.updateId?.match(/^[a-f\d-]{36}$/i)?.[0];
  const pid = Number.isInteger(options.executorPid) ? options.executorPid : 0;
  const script = [
    `$target = '${scriptPath}'`,
    `$process = if (${pid}) { Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' } else { Get-CimInstance Win32_Process }`,
    `$matches = @($process | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0 })`,
    updateId
      ? `$matches = @($matches | Where-Object { $_.CommandLine -match '(?i)-UpdateId\\s+"?${updateId}("|\\s|$)' })`
      : "",
    `if ($matches.Count -gt 0) { 'true' } else { 'false' }`,
  ]
    .filter(Boolean)
    .join("; ");

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 3_000, windowsHide: true },
      (error, stdout) => {
        const alive = error ? undefined : stdout.trim() === "true";
        processInspectionCache.set(cacheKey, { checkedAt: Date.now(), alive });
        resolve(alive);
      },
    );
  });
}

function activeTaskStatus(status?: string) {
  return [
    "starting",
    "queued",
    "running",
    "checking",
    "downloading",
    "downloaded",
    "verifying",
    "preparing-runtime",
    "backing-up",
    "installing",
    "validating",
    "rolling-back",
  ].includes(status || "");
}

function parseStatusTime(status: StudioUpdateStatus) {
  const timestamp = Date.parse(status.updatedAt || status.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function statusMessage(status: StudioUpdateStatus, currentVersion: string) {
  const stage = status.stage || status.status || "unknown";
  return {
    status: "interrupted" as const,
    stage,
    previousStatus: status.status,
    updateId: status.updateId,
    targetVersion: status.targetVersion,
    latestVersion: status.latestVersion,
    currentVersion,
    previousVersion: status.previousVersion,
    actualVersion: currentVersion,
    completedStages: status.completedStages,
    failedStage: status.failedStage,
    message:
      "The update executor is no longer running. Check the update details before retrying.",
    updatedAt: status.updatedAt,
  };
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

function lockPath(installRoot: string) {
  return path.join(installRoot, "update.lock");
}

function updateLogPath(installRoot: string, updateId: string) {
  return path.join(installRoot, "logs", `update-${updateId}.log`);
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

function isGitHubAuthRequired(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /not logged in|not logged into|authentication (?:is )?required|token.{0,40}(?:expired|invalid|revoked)|(?:expired|invalid|revoked).{0,40}token|no authentication token/i.test(
    message,
  );
}

function resolveStudioRoot(root?: string) {
  return root || process.env.NGT_STUDIO_ROOT || process.cwd();
}

export async function getStudioUpdateStatus(
  root?: string,
  options: { inspect?: ProcessInspector } = {},
): Promise<StudioUpdateStatus> {
  const studioRoot = resolveStudioRoot(root);
  const { config, currentVersion } = await getStudioContext(studioRoot);
  if (!config?.installRoot) return { status: "idle" };
  const statusFile = await readJsonState<StudioUpdateStatus>(
    statusPath(config.installRoot),
  );
  const lockFile = await readUpdateLock(lockPath(config.installRoot));
  if (lockFile.unreadable)
    return {
      status: "verifying-task",
      message:
        "The update lock cannot be read. Verify the task before retrying.",
      manualReview: true,
      currentVersion,
    };
  if (statusFile.unreadable)
    return {
      status: "verifying-task",
      message:
        "The saved update state cannot be read. Verify the task before retrying.",
      manualReview: true,
      currentVersion,
    };

  const status = statusFile.value;
  if (!status) {
    if (!lockFile.exists) return { status: "idle", currentVersion };
    if (lockFile.value?.updateId && activeUpdateRoots.has(config.installRoot))
      return {
        status: "verifying-task",
        updateId: lockFile.value.updateId,
        currentVersion,
        message: "The update executor is starting.",
      };
    const scriptPath = path.join(
      studioRoot,
      "scripts",
      "update-windows-studio.ps1",
    );
    const alive = await (options.inspect || inspectUpdaterProcess)({
      updateId: lockFile.value?.updateId,
      executorPid: lockFile.value?.executorPid,
      scriptPath,
    });
    return alive === false
      ? statusMessage({ status: "queued" }, currentVersion)
      : {
          status: "verifying-task",
          updateId: lockFile.value?.updateId,
          currentVersion,
          executorAlive: alive,
          message: "An update lock exists without a readable task status.",
          manualReview: alive === undefined,
        };
  }

  if (status.status === "complete") {
    const target = status.targetVersion || status.latestVersion;
    if (!target || compareVersions(currentVersion, target) !== 0) {
      return {
        ...status,
        status: "interrupted",
        currentVersion,
        actualVersion: currentVersion,
        message: `The task reported completion, but the running version is ${currentVersion}.`,
        manualReview: true,
      };
    }
    return { ...status, currentVersion, actualVersion: currentVersion };
  }

  if (status.status === "failed" && status.recoveryStatus === "succeeded") {
    if (
      !status.previousVersion ||
      compareVersions(currentVersion, status.previousVersion) !== 0
    ) {
      return {
        ...status,
        recoveryStatus: "failed",
        recoveryMessage: status.previousVersion
          ? `The running version ${currentVersion} does not match the previous version ${status.previousVersion}.`
          : "The previous version was not recorded, so the rollback cannot be verified.",
        currentVersion,
        actualVersion: currentVersion,
        manualReview: true,
      };
    }
    return { ...status, currentVersion, actualVersion: currentVersion };
  }

  if (!activeTaskStatus(status.status))
    return { ...status, currentVersion, actualVersion: currentVersion };

  const now = Date.now();
  if (
    status.status === "starting" &&
    now - Date.parse(status.createdAt || status.updatedAt || "") < 10_000
  )
    return { ...status, currentVersion, executorAlive: false };
  const recentConfirmed =
    status.status !== "starting" &&
    status.updateId &&
    typeof status.executorPid === "number" &&
    status.executorConfirmed === true &&
    now - parseStatusTime(status) < 15_000;
  if (recentConfirmed)
    return { ...status, executorAlive: true, currentVersion };

  const scriptPath = path.join(
    studioRoot,
    "scripts",
    "update-windows-studio.ps1",
  );
  const alive = await (options.inspect || inspectUpdaterProcess)({
    updateId: status.updateId || lockFile.value?.updateId,
    executorPid: status.executorPid || lockFile.value?.executorPid,
    scriptPath,
  });
  if (alive === false) return statusMessage(status, currentVersion);

  const starting = status.status === "starting" || status.status === "queued";
  if (alive === true && starting && status.updateId)
    return { ...status, executorAlive: true, currentVersion };
  if (alive === true && !starting && status.stage)
    return { ...status, executorAlive: true, currentVersion };
  if (alive === true)
    return {
      ...status,
      status: "verifying-task",
      executorAlive: true,
      currentVersion,
      previousStatus: status.status,
      message:
        "The executor is running, but has not reported a current stage yet.",
    };
  return {
    ...status,
    status: "verifying-task",
    executorAlive: alive,
    currentVersion,
    previousStatus: status.status,
    message: "The update task status is being verified.",
    manualReview: alive === undefined,
  };
}

export async function getStudioCurrentVersion(root?: string) {
  const { currentVersion } = await getStudioContext(resolveStudioRoot(root));
  return currentVersion;
}

export async function getStudioRuntimeInfo(root?: string) {
  const context = await getStudioContext(resolveStudioRoot(root));
  return {
    currentVersion: context.currentVersion,
    versionSource: context.release?.version
      ? "studio-release.json"
      : "package.json",
  };
}

export async function getStudioUpdateLog(root?: string) {
  const studioRoot = resolveStudioRoot(root);
  const { config } = await getStudioContext(studioRoot);
  if (!config?.installRoot) return "";
  const status = await getStudioUpdateStatus(studioRoot);
  if (!status.updateId) return "";
  try {
    const contents = await readFile(
      updateLogPath(config.installRoot, status.updateId),
      "utf8",
    );
    return redactUpdateLog(contents.slice(-20_000));
  } catch {
    return "";
  }
}

function redactUpdateLog(contents: string) {
  return contents
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted token]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted token]")
    .replace(/(token\s*[:=]\s*)\S+/gi, "$1[redacted]");
}

export function sanitizeUpdateDiagnostic(value: string) {
  return redactUpdateLog(value);
}

export function sanitizeUpdateStatus(status: StudioUpdateStatus) {
  return {
    ...status,
    message: status.message
      ? sanitizeUpdateDiagnostic(status.message)
      : undefined,
    recoveryMessage: status.recoveryMessage
      ? sanitizeUpdateDiagnostic(status.recoveryMessage)
      : undefined,
  };
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
  options: {
    root?: string;
    run?: CommandRunner;
    inspect?: ProcessInspector;
  } = {},
): Promise<StudioUpdateInfo> {
  const root = resolveStudioRoot(options.root);
  const run = options.run || runCommand;
  const context = await getStudioContext(root);
  const status = await getStudioUpdateStatus(root, {
    inspect: options.inspect,
  });
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
    await run(githubCli, [
      "auth",
      "status",
      "--hostname",
      "github.com",
      "--active",
    ]);
  } catch (cause) {
    if (!isGitHubAuthRequired(cause)) throw cause;
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
    "tagName,name,body,url,publishedAt,assets",
  ]);
  const latest = JSON.parse(result.stdout) as {
    tagName: string;
    name?: string;
    body?: string;
    url?: string;
    publishedAt?: string;
    assets?: { name?: string; size?: number }[];
  };
  const latestVersion = normalizeVersion(latest.tagName);
  const studioArchive = latest.assets?.find(
    (asset) => asset.name === `ngt-studio-windows-${latest.tagName}.zip`,
  );
  const studioChecksum = latest.assets?.find(
    (asset) => asset.name === `ngt-studio-windows-${latest.tagName}.zip.sha256`,
  );
  const runtimeArchive = latest.assets?.find(
    (asset) => asset.name === `ngt-studio-runtime-${latest.tagName}.zip`,
  );
  const runtimeChecksum = latest.assets?.find(
    (asset) => asset.name === `ngt-studio-runtime-${latest.tagName}.zip.sha256`,
  );
  const isNewer = compareVersions(latestVersion, context.currentVersion) > 0;
  const installable = Boolean(
    studioArchive && studioChecksum && runtimeArchive && runtimeChecksum,
  );
  return {
    installed: true,
    currentVersion: context.currentVersion,
    authRequired: false,
    updateAvailable: isNewer && installable,
    notInstallable: isNewer && !installable,
    latestVersion,
    releaseUrl: latest.url,
    releaseName: latest.name,
    releaseNotes: latest.body?.trim() || undefined,
    publishedAt: latest.publishedAt,
    downloadSize:
      typeof studioArchive?.size === "number" ? studioArchive.size : undefined,
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
        await run(githubCli, [
          "auth",
          "status",
          "--hostname",
          "github.com",
          "--active",
        ]);
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
  options: {
    root?: string;
    launch?: ProcessLauncher;
    inspect?: ProcessInspector;
    targetVersion?: string;
  } = {},
) {
  const root = resolveStudioRoot(options.root);
  const context = await getStudioContext(root);
  if (!context.release?.version || !context.config?.installRoot) {
    throw new Error("studio_not_installed");
  }
  const installRoot = context.config.installRoot;
  const lockFile = lockPath(installRoot);
  const taskStatusFile = statusPath(installRoot);
  const scriptPath = path.join(root, "scripts", "update-windows-studio.ps1");
  const targetVersion = options.targetVersion?.replace(/^v/i, "");
  if (targetVersion) {
    const checked = await checkStudioUpdate({
      root,
      inspect: options.inspect,
    });
    if (checked.latestVersion !== targetVersion)
      throw new Error("update_target_changed");
    if (!checked.updateAvailable)
      throw new Error(
        checked.notInstallable
          ? "update_not_installable"
          : "update_no_longer_available",
      );
  }

  if (activeUpdateRoots.has(installRoot))
    throw new Error("studio_update_in_progress");

  const previousTask = await getStudioUpdateStatus(root, {
    inspect: options.inspect,
  });
  if (
    previousTask.manualReview ||
    [
      "starting",
      "queued",
      "running",
      "checking",
      "downloading",
      "downloaded",
      "verifying",
      "preparing-runtime",
      "backing-up",
      "installing",
      "validating",
      "rolling-back",
      "verifying-task",
      "unknown",
    ].includes(previousTask.status)
  )
    throw new Error(
      previousTask.manualReview
        ? "studio_update_needs_manual_review"
        : "studio_update_in_progress",
    );
  if (previousTask.recoveryStatus === "failed")
    throw new Error("studio_update_needs_manual_review");

  const existingLock = await readUpdateLock(lockFile);
  if (existingLock.unreadable)
    throw new Error("studio_update_needs_manual_review");
  if (existingLock.exists) {
    const lock = existingLock.value;
    const createdAt = Date.parse(lock?.createdAt || "");
    const recentlyCreated =
      Number.isFinite(createdAt) && Date.now() - createdAt < 10_000;
    const alive = await (options.inspect || inspectUpdaterProcess)({
      updateId: lock?.updateId,
      executorPid: lock?.executorPid,
      scriptPath,
    });
    if (alive === true || alive === undefined || recentlyCreated)
      throw new Error("studio_update_in_progress");
    await unlink(lockFile);
  }

  const updateId = randomUUID();
  const createdAt = new Date().toISOString();
  try {
    const handle = await open(lockFile, "wx");
    await handle.writeFile(
      JSON.stringify({ updateId, targetVersion, createdAt }),
      "utf8",
    );
    await handle.close();
  } catch (cause) {
    throw (cause as NodeJS.ErrnoException).code === "EEXIST"
      ? new Error("studio_update_in_progress")
      : cause;
  }

  const status: StudioUpdateStatus = {
    status: "starting",
    stage: "starting",
    updateId,
    targetVersion,
    previousVersion: context.currentVersion,
    createdAt,
    updatedAt: createdAt,
    executorConfirmed: false,
  };
  activeUpdateRoots.add(installRoot);
  try {
    await writeJsonAtomically(taskStatusFile, status);
    const logFile = updateLogPath(installRoot, updateId);
    const child = (options.launch || launchProcess)(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-UpdateId",
        updateId,
        "-ExpectedTargetVersion",
        targetVersion || "",
        "-StatusFile",
        taskStatusFile,
        "-UpdateLockFile",
        lockFile,
        "-LogFile",
        logFile,
      ],
      { cwd: root, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    child.once("spawn", () => {
      void (async () => {
        const lock = await readJson<{ updateId?: string }>(lockFile);
        if (lock?.updateId === updateId)
          await writeJsonAtomically(lockFile, {
            updateId,
            targetVersion,
            createdAt,
            executorPid: child.pid,
          }).catch(() => undefined);
      })();
    });
    let finished = false;
    const failBeforeCompletion = async (message: string) => {
      if (finished) return;
      finished = true;
      const latest = await readJson<StudioUpdateStatus>(taskStatusFile);
      if (
        latest?.updateId === updateId &&
        latest.status !== "complete" &&
        latest.status !== "failed"
      ) {
        await writeJsonAtomically(taskStatusFile, {
          ...latest,
          status: "failed",
          stage: latest.stage || "starting",
          failedStage: latest.stage || "starting",
          message,
          executorConfirmed: false,
          updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
      const lock = await readJson<{ updateId?: string }>(lockFile);
      if (lock?.updateId === updateId)
        await unlink(lockFile).catch(() => undefined);
      activeUpdateRoots.delete(installRoot);
    };
    child.once("error", (error) => {
      void failBeforeCompletion(
        `Unable to start the update executor: ${error.message}`,
      );
    });
    child.once("close", (code) => {
      void (async () => {
        const latest = await readJson<StudioUpdateStatus>(taskStatusFile);
        if (latest?.updateId !== updateId) return;
        if (latest.status === "complete" || latest.status === "failed") {
          const lock = await readJson<{ updateId?: string }>(lockFile);
          if (lock?.updateId === updateId)
            await unlink(lockFile).catch(() => undefined);
          activeUpdateRoots.delete(installRoot);
          return;
        }
        await failBeforeCompletion(
          `The update executor exited before recording a final result (code ${code ?? "unknown"}).`,
        );
      })();
    });
    return { ...status, updateId, logAvailable: true };
  } catch (cause) {
    activeUpdateRoots.delete(installRoot);
    const latest = await readJson<StudioUpdateStatus>(taskStatusFile);
    if (latest?.updateId === updateId && latest.status === "starting")
      await writeJsonAtomically(taskStatusFile, {
        ...latest,
        status: "failed",
        failedStage: "starting",
        message: `Unable to create the update executor: ${cause instanceof Error ? cause.message : String(cause)}`,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    await unlink(lockFile).catch(() => undefined);
    throw cause;
  }
}
