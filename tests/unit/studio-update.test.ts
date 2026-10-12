import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkStudioUpdate,
  compareVersions,
  startGitHubLogin,
  startStudioUpdate,
} from "../../src/lib/studio-update";

const temporaryRoots: string[] = [];

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
        throw new Error("not authenticated");
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
        throw new Error("not authenticated");
      },
    });

    expect(result).toMatchObject({
      installed: true,
      currentVersion: "1.11.57",
      authRequired: true,
      status: { status: "checking" },
    });
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
                  url: "https://github.com/example/release",
                  publishedAt: "2026-10-04T12:00:00Z",
                })
              : "",
          stderr: "",
        };
      },
    });
    expect(calls[0]).toEqual(["auth", "status", "--hostname", "github.com"]);
    expect(calls[1]).toContain("JayWangsj/ngt-repair-system");
    expect(result).toMatchObject({
      authRequired: false,
      updateAvailable: true,
      latestVersion: "1.11.58",
    });
  });

  it("launches visible browser authorization and a detached update process", async () => {
    const { root, installRoot } = await studioRoot();
    const launches: { executable: string; args: string[] }[] = [];
    const launch = (executable: string, args: string[]) => {
      launches.push({ executable, args });
      return { unref() {} };
    };
    await startGitHubLogin({ root, launch });
    await startStudioUpdate({ root, launch });
    expect(launches[0].executable).toBe("powershell.exe");
    expect(launches[0].args).toContain("-Command");
    expect(launches[0].args.at(-1)).toContain("Start-Process");
    expect(launches[0].args.at(-1)).toContain("--clipboard");
    expect(launches[0].args.at(-1)).toContain("--web");
    expect(launches[1].executable).toBe("powershell.exe");
    expect(
      launches[1].args.some((argument) =>
        argument.endsWith("update-windows-studio.ps1"),
      ),
    ).toBe(true);
    const status = JSON.parse(
      await readFile(path.join(installRoot, "update-status.json"), "utf8"),
    ) as { status: string };
    expect(status.status).toBe("queued");
  });
});
