import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkStudioUpdate,
  compareVersions,
  getGitHubLoginStatus,
  startGitHubLogin,
  startStudioUpdate,
} from "../../src/lib/studio-update";

const temporaryRoots: string[] = [];

function authProcess() {
  const events = new EventEmitter();
  let input = "";
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString();
      callback();
    },
  });
  return {
    process: {
      stdin,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      once: events.once.bind(events),
      kill: () => true,
      unref() {},
    },
    emit: events.emit.bind(events),
    input: () => input,
  };
}

async function studioRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "ngt-studio-update-"));
  temporaryRoots.push(root);
  const installRoot = path.join(root, "installed");
  await Promise.all([
    mkdir(path.join(root, "runtime"), { recursive: true }),
    mkdir(path.join(root, ".local"), { recursive: true }),
    mkdir(path.join(root, "scripts"), { recursive: true }),
    mkdir(installRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(root, "studio-release.json"),
      JSON.stringify({ version: "1.11.57" }),
    ),
    writeFile(path.join(root, "runtime", "gh.exe"), "test"),
    writeFile(path.join(root, "scripts", "update-windows-studio.ps1"), ""),
    writeFile(
      path.join(root, ".local", "studio.json"),
      JSON.stringify({
        installRoot,
        repository: "JayWangsj/ngt-repair-system",
      }),
    ),
  ]);
  return { root, installRoot };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("studio update", () => {
  it("compares release versions numerically", () => {
    expect(compareVersions("v1.11.58", "1.11.57")).toBe(1);
    expect(compareVersions("1.11.57", "v1.11.57")).toBe(0);
    expect(compareVersions("1.9.9", "1.10.0")).toBe(-1);
  });

  it("requires GitHub authorization before reading a private release", async () => {
    const { root } = await studioRoot();
    const result = await checkStudioUpdate({
      root,
      run: async () => {
        throw new Error("You are not logged into any GitHub hosts.");
      },
    });
    expect(result).toMatchObject({
      installed: true,
      currentVersion: "1.11.57",
      authRequired: true,
      updateAvailable: false,
    });
  });

  it("reads Windows PowerShell JSON files with a UTF-8 BOM", async () => {
    const { root, installRoot } = await studioRoot();
    await Promise.all([
      writeFile(
        path.join(root, "studio-release.json"),
        `\uFEFF${JSON.stringify({ version: "1.11.57" })}`,
      ),
      writeFile(
        path.join(root, ".local", "studio.json"),
        `\uFEFF${JSON.stringify({
          installRoot,
          repository: "JayWangsj/ngt-repair-system",
        })}`,
      ),
      writeFile(
        path.join(installRoot, "update-status.json"),
        `\uFEFF${JSON.stringify({ status: "checking" })}`,
      ),
    ]);

    const result = await checkStudioUpdate({
      root,
      run: async () => {
        throw new Error("You are not logged into any GitHub hosts.");
      },
    });

    expect(result).toMatchObject({
      installed: true,
      currentVersion: "1.11.57",
      authRequired: true,
      status: { status: "checking" },
    });
  });

  it("uses the installed studio root after the standalone server changes directories", async () => {
    const { root } = await studioRoot();
    const previousRoot = process.env.NGT_STUDIO_ROOT;
    process.env.NGT_STUDIO_ROOT = root;
    try {
      const result = await checkStudioUpdate({
        run: async () => {
          throw new Error("You are not logged into any GitHub hosts.");
        },
      });
      expect(result).toMatchObject({
        installed: true,
        currentVersion: "1.11.57",
        authRequired: true,
      });
    } finally {
      if (previousRoot === undefined) delete process.env.NGT_STUDIO_ROOT;
      else process.env.NGT_STUDIO_ROOT = previousRoot;
    }
  });

  it("detects a newer private release after authorization", async () => {
    const { root } = await studioRoot();
    const calls: string[][] = [];
    const result = await checkStudioUpdate({
      root,
      run: async (_executable, args) => {
        calls.push(args);
        return {
          stdout:
            args[0] === "release"
              ? JSON.stringify({
                  tagName: "v1.11.58",
                  name: "NGT 1.11.58",
                  body: "Correzioni e miglioramenti",
                  url: "https://github.com/example/release",
                  publishedAt: "2026-10-04T12:00:00Z",
                  assets: [
                    {
                      name: "ngt-studio-windows-v1.11.58.zip",
                      size: 240_000_000,
                    },
                    { name: "ngt-studio-windows-v1.11.58.zip.sha256" },
                    { name: "ngt-studio-runtime-v1.11.58.zip" },
                    { name: "ngt-studio-runtime-v1.11.58.zip.sha256" },
                  ],
                })
              : "",
          stderr: "",
        };
      },
    });
    expect(calls[0]).toEqual([
      "auth",
      "status",
      "--hostname",
      "github.com",
      "--active",
    ]);
    expect(calls[1]).toContain("JayWangsj/ngt-repair-system");
    expect(result).toMatchObject({
      authRequired: false,
      updateAvailable: true,
      latestVersion: "1.11.58",
      releaseName: "NGT 1.11.58",
      releaseNotes: "Correzioni e miglioramenti",
      downloadSize: 240_000_000,
    });
    expect(calls[1]).toContain("tagName,name,body,url,publishedAt,assets");
  });

  it("does not offer a release without both the archive and checksum", async () => {
    const { root } = await studioRoot();
    const result = await checkStudioUpdate({
      root,
      run: async (_executable, args) => ({
        stdout:
          args[0] === "release"
            ? JSON.stringify({
                tagName: "v1.11.58",
                assets: [
                  { name: "ngt-studio-windows-v1.11.58.zip" },
                  { name: "ngt-studio-windows-v1.11.58.zip.sha256" },
                ],
              })
            : "",
        stderr: "",
      }),
    });
    expect(result).toMatchObject({ updateAvailable: false });
  });

  it("does not treat GitHub CLI network errors as missing authorization", async () => {
    const { root } = await studioRoot();
    await expect(
      checkStudioUpdate({
        root,
        run: async () => {
          throw new Error("connection timed out");
        },
      }),
    ).rejects.toThrow("connection timed out");
  });

  it("advances browser authorization and verifies private release access", async () => {
    const { root, installRoot } = await studioRoot();
    const child = authProcess();
    const launches: { executable: string; args: string[] }[] = [];
    const calls: string[][] = [];
    await startGitHubLogin({
      root,
      launch: (executable, args) => {
        launches.push({ executable, args });
        return child.process;
      },
      run: async (_executable, args) => {
        calls.push(args);
        return { stdout: "", stderr: "" };
      },
    });
    expect(launches[0].executable).toBe(path.join(root, "runtime", "gh.exe"));
    expect(launches[0].args).toContain("--clipboard");
    expect(launches[0].args).toContain("--web");
    expect(launches[0].args).toContain("repo");
    expect(child.input()).toBe("\n\n");

    child.process.stderr.write(
      "First copy your one-time code: ABCD-1234\nPress Enter to open https://github.com/login/device in your browser...",
    );
    await expect
      .poll(() => getGitHubLoginStatus(root))
      .toMatchObject({
        status: "waiting",
        userCode: "ABCD-1234",
        verificationUrl: "https://github.com/login/device",
      });
    child.emit("close", 0);
    await expect
      .poll(() => getGitHubLoginStatus(root))
      .toMatchObject({
        status: "success",
      });
    expect(calls[0]).toEqual([
      "auth",
      "status",
      "--hostname",
      "github.com",
      "--active",
    ]);
    expect(calls[1]).toContain("JayWangsj/ngt-repair-system");

    const updateLaunches: { executable: string; args: string[] }[] = [];
    await startStudioUpdate({
      root,
      launch: (executable, args) => {
        updateLaunches.push({ executable, args });
        return { unref() {} };
      },
    });
    expect(updateLaunches[0].executable).toBe("powershell.exe");
    expect(
      updateLaunches[0].args.some((argument) =>
        argument.endsWith("update-windows-studio.ps1"),
      ),
    ).toBe(true);
    const status = JSON.parse(
      await readFile(path.join(installRoot, "update-status.json"), "utf8"),
    ) as { status: string };
    expect(status.status).toBe("queued");
    await expect(startStudioUpdate({ root })).rejects.toThrow(
      "studio_update_in_progress",
    );
  });

  it("reports the GitHub CLI reason when authorization fails", async () => {
    const { root } = await studioRoot();
    const child = authProcess();
    await startGitHubLogin({
      root,
      launch: () => child.process,
    });
    child.process.stderr.write("failed to open browser: no default app\n");
    child.emit("close", 1);

    await expect
      .poll(() => getGitHubLoginStatus(root))
      .toMatchObject({
        status: "failed",
        message: "failed to open browser: no default app",
        verificationUrl: "https://github.com/login/device",
      });
  });

  it("does not report success without private repository access", async () => {
    const { root } = await studioRoot();
    const child = authProcess();
    await startGitHubLogin({
      root,
      launch: () => child.process,
      run: async (_executable, args) => {
        if (args[0] === "release") throw new Error("HTTP 404: Not Found");
        return { stdout: "", stderr: "" };
      },
    });
    child.emit("close", 0);

    await expect
      .poll(() => getGitHubLoginStatus(root))
      .toMatchObject({
        status: "failed",
        message:
          "GitHub authorization completed, but the private repository is not accessible: HTTP 404: Not Found",
      });
  });
});
