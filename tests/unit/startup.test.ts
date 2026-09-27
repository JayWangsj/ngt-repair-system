import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Windows persistent startup", () => {
  it("supervises both the database and application without machine-specific paths", async () => {
    const service = await readFile("scripts/windows-service.ps1", "utf8");
    expect(service).toContain('"scripts/windows-db.mjs" -Port 55432');
    expect(service).toContain('"scripts/start.mjs" -Port 3000');
    expect(service).toContain("$PSScriptRoot");
    expect(service).not.toContain("D:\\NGT");
  });

  it("installs a logon task with restart settings and has a matching uninstaller", async () => {
    const installer = await readFile(
      "scripts/install-windows-startup.ps1",
      "utf8",
    );
    const uninstaller = await readFile(
      "scripts/uninstall-windows-startup.ps1",
      "utf8",
    );
    expect(installer).toContain("New-ScheduledTaskTrigger -AtLogOn");
    expect(installer).toContain("Register-ScheduledTask");
    expect(installer).toContain("Start-ScheduledTask");
    expect(uninstaller).toContain("Unregister-ScheduledTask");
  });

  it("keeps the isolated test preview on a fixed restart-safe port", async () => {
    const service = await readFile(
      "scripts/windows-preview-service.ps1",
      "utf8",
    );
    const installer = await readFile(
      "scripts/install-windows-preview-startup.ps1",
      "utf8",
    );
    const uninstaller = await readFile(
      "scripts/uninstall-windows-preview-startup.ps1",
      "utf8",
    );
    expect(service).toContain('"test.env"');
    expect(service).toContain('$env:PORT = "3236"');
    expect(service).toContain('"scripts/windows-db.mjs" -Port 55432');
    expect(service).toContain('"scripts/start.mjs" -Port 3236');
    expect(installer).toContain('$taskName = "NGT Test Preview"');
    expect(installer).toContain("New-ScheduledTaskTrigger -AtLogOn");
    expect(uninstaller).toContain("Unregister-ScheduledTask");
  });
});
