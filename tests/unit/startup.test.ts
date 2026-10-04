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
    expect(installer).toContain(
      'New-ScheduledTaskAction -Execute "wscript.exe"',
    );
    expect(installer).toContain("//B //Nologo");
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
    const launcher = await readFile(
      "scripts/windows-preview-launcher.vbs",
      "utf8",
    );
    const uninstaller = await readFile(
      "scripts/uninstall-windows-preview-startup.ps1",
      "utf8",
    );
    const testDatabase = await readFile("scripts/windows-test-db.mjs", "utf8");
    expect(service).toContain('"test.env"');
    expect(service).toContain('$env:PORT = "3236"');
    expect(service).toContain('"scripts/windows-test-db.mjs" -Port 55433');
    expect(service).toContain('"scripts/start.mjs" -Port 3236');
    expect(testDatabase).toContain('"CREATE DATABASE ngt_test"');
    expect(testDatabase).toContain('"55433"');
    expect(testDatabase).not.toContain('CREATE DATABASE ngt"');
    expect(installer).toContain('$taskName = "NGT Test Preview"');
    expect(installer).toContain(
      'New-ScheduledTaskAction -Execute "wscript.exe"',
    );
    expect(installer).toContain("//B //Nologo");
    expect(installer).toContain("New-ScheduledTaskTrigger -AtLogOn");
    expect(launcher).toContain("shell.Run command, 0, False");
    expect(uninstaller).toContain("Unregister-ScheduledTask");
  });

  it("keeps studio data outside versioned releases and packages updates at home", async () => {
    const database = await readFile("scripts/windows-db.mjs", "utf8");
    const service = await readFile("scripts/windows-service.ps1", "utf8");
    const installer = await readFile(
      "scripts/install-windows-studio.ps1",
      "utf8",
    );
    const packager = await readFile(
      "scripts/build-windows-studio-package.ps1",
      "utf8",
    );
    const materializedCopy = await readFile(
      "scripts/copy-directory-materialized.mjs",
      "utf8",
    );
    expect(database).toContain("process.env.NGT_DATA_ROOT");
    expect(database).toContain('join(persistentRoot, "data")');
    expect(service).toContain('"studio.json"');
    expect(service).toContain('"runtime\\node.exe"');
    expect(installer).toContain('"releases\\v" + $release.version');
    expect(installer).toContain('"--max-old-space-size=1536"');
    expect(packager).toContain("--config.node-linker=hoisted");
    expect(packager).toContain('"scripts\\copy-directory-materialized.mjs"');
    expect(materializedCopy).toContain("lstat(sourcePath)");
    expect(materializedCopy).toContain("readlink(sourcePath)");
    expect(packager).toContain('$runtimeDirectory "postgres"');
    expect(packager).toContain('".next\\standalone\\.env"');
    expect(packager).toContain("--frozen-lockfile");
    expect(packager).toContain("tar.exe -a -c");
  });

  it("backs up and verifies private releases before switching the studio", async () => {
    const backup = await readFile("scripts/backup-windows-studio.ps1", "utf8");
    const updater = await readFile("scripts/update-windows-studio.ps1", "utf8");
    const workflow = await readFile(
      ".github/workflows/windows-studio-release.yml",
      "utf8",
    );
    expect(backup).toContain('"SHA256SUMS.txt"');
    expect(backup).toContain("Stop-NgtStudioProcesses");
    expect(updater).toContain('"release", "download"');
    expect(updater).toContain("Get-FileHash");
    expect(updater).toContain("backup-windows-studio.ps1");
    expect(updater).toContain("Wait-NgtStudioHealth");
    expect(workflow).toContain('tags:\n      - "v*"');
    expect(workflow).toContain("--config.node-linker=hoisted");
    expect(workflow).toContain("--config.package-import-method=copy");
    expect(workflow).toContain("gh release create");
  });

  it("builds a one-click per-user studio installer", async () => {
    const definition = await readFile("installer/windows-studio.iss", "utf8");
    const builder = await readFile(
      "scripts/build-windows-studio-installer.ps1",
      "utf8",
    );
    const bootstrap = await readFile(
      "scripts/install-windows-studio-bootstrap.ps1",
      "utf8",
    );
    const packager = await readFile(
      "scripts/build-windows-studio-package.ps1",
      "utf8",
    );
    const workflow = await readFile(
      ".github/workflows/windows-studio-release.yml",
      "utf8",
    );
    const uninstaller = await readFile(
      "scripts/uninstall-windows-studio.ps1",
      "utf8",
    );
    const icon = await readFile("assets/ngt-studio.ico");
    expect(definition).toContain("PrivilegesRequired=lowest");
    expect(definition).toContain("install-windows-studio.ps1");
    expect(definition).toContain("uninstall-windows-studio.ps1");
    expect(definition).toContain("{autodesktop}");
    expect(definition).toContain(
      "SetupIconFile={#IconPath}",
    );
    expect(definition).toContain('Source: "{#ArchivePath}"');
    expect(definition).toContain("nocompression");
    expect(definition).not.toContain("recursesubdirs");
    expect(definition).toContain("UninstallDisplayIcon");
    expect(definition).toContain("IconFilename");
    expect(builder).toContain("ISCC.exe");
    expect(builder.indexOf("$compilerCandidates")).toBeLessThan(
      builder.indexOf('Get-Command "iscc.exe"'),
    );
    expect(builder).toContain("Studio installer bootstrap is missing");
    expect(builder).toContain("Inno Setup compiler:");
    expect(builder).toContain("Get-FileHash");
    expect(packager).toContain('"windows-studio-launcher.vbs"');
    expect(packager).toContain('"assets\\ngt-studio.ico"');
    expect(packager).toContain('(Join-Path $runtimeDirectory "gh.exe")');
    expect(packager).toContain('"licenses\\github-cli.txt"');
    expect(workflow).toContain("build-windows-studio-installer.ps1");
    expect(bootstrap).toContain("Expand-Archive");
    expect(bootstrap).toContain("Remove-Item -LiteralPath $PackagePath");
    expect(bootstrap).toContain("install-windows-studio.ps1");
    expect(bootstrap).toContain("-InPlace");
    expect(uninstaller).toContain("Stop-NgtStudioProcesses");
    expect(uninstaller).toContain("uninstall-windows-startup.ps1");
    expect(uninstaller).not.toContain("data-store");
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    const iconCount = icon.readUInt16LE(4);
    const iconSizes = Array.from({ length: iconCount }, (_, index) => {
      const size = icon[6 + index * 16];
      return size === 0 ? 256 : size;
    });
    expect(iconSizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
});
