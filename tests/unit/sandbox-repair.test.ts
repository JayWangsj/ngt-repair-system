import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { describe, expect, it } from "vitest";

describe.skipIf(process.platform !== "win32")(
  "sandbox ownership repair",
  () => {
    const shell = join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    // Node does not sanitize PowerShell 7's inherited module path for Windows PowerShell.
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === "psmodulepath") delete env[key];
    }
    env.PSModulePath = join(dirname(shell), "Modules");
    it("performs a read-only ownership check in the real workspace", () => {
      const output = execFileSync(
        shell,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-File",
          "scripts/repair-codex-sandbox.ps1",
        ],
        { encoding: "utf8", env },
      );
      const report = JSON.parse(output);
      expect(report.Path).toBe(join(process.cwd(), ".git"));
      expect(report.OwnerSid).toMatch(/^S-1-/);
      expect(report.NeedsRepair).toBe(
        report.OwnerSid !== report.ExpectedOwnerSid,
      );
    });
    it("rejects a worktree metadata file without modifying it", () => {
      const fixture = mkdtempSync(join(tmpdir(), "ngt-sandbox-repair-"));
      try {
        mkdirSync(join(fixture, "scripts"));
        const script = join(fixture, "scripts", "repair-codex-sandbox.ps1");
        copyFileSync("scripts/repair-codex-sandbox.ps1", script);
        const metadata = "gitdir: elsewhere\n";
        writeFileSync(join(fixture, ".git"), metadata);
        const result = spawnSync(
          shell,
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "RemoteSigned",
            "-File",
            script,
            "-Repair",
          ],
          { encoding: "utf8", env },
        );
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("Expected a real .git directory");
        expect(readFileSync(join(fixture, ".git"), "utf8")).toBe(metadata);
      } finally {
        if (
          dirname(resolve(fixture)) !== resolve(tmpdir()) ||
          !basename(fixture).startsWith("ngt-sandbox-repair-")
        )
          throw new Error("Unexpected fixture cleanup path");
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  },
);
