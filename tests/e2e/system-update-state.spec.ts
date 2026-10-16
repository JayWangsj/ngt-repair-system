import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const screenshotDirectory = path.join(
  process.cwd(),
  ".local",
  "update-verification",
);

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });
});

async function switchToItalian(page: Page) {
  const italianButton = page.getByRole("button", {
    name: "Italiano",
    exact: true,
  });
  if (await italianButton.isVisible()) await italianButton.click();
}

function availableRelease() {
  return {
    installed: true,
    currentVersion: "2.0.9",
    authRequired: false,
    updateAvailable: true,
    latestVersion: "2.0.10",
    releaseName: "NGT 2.0.10",
    releaseNotes: "Aggiornamenti affidabili e correzioni.",
    publishedAt: "2026-10-14T12:00:00Z",
    downloadSize: 240_000_000,
  };
}

async function mockAvailableCheck(page: Page) {
  await page.route("**/api/system-update", (route) =>
    route.fulfill({
      status: route.request().method() === "POST" ? 202 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().method() === "POST"
          ? {
              started: true,
              status: "starting",
              stage: "starting",
              updateId: "0bd7d5ac-4cd6-4a7e-9fd4-d11c136caf16",
              targetVersion: "2.0.10",
              currentVersion: "2.0.9",
              createdAt: new Date().toISOString(),
            }
          : availableRelease(),
      ),
    }),
  );
}

async function mockIdleTask(page: Page) {
  await page.route("**/api/system-update/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "idle", currentVersion: "2.0.9" }),
    }),
  );
}

test("ignores a stale active status when already current", async ({ page }) => {
  await page.route("**/api/system-update", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        installed: true,
        currentVersion: "2.0.9",
        authRequired: false,
        updateAvailable: false,
        latestVersion: "2.0.9",
        status: { status: "checking", stage: "checking" },
      }),
    }),
  );
  await page.route("**/api/system-update/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "idle" }),
    }),
  );

  await page.goto("/settings/system-update");
  await switchToItalian(page);
  await expect(
    page.getByRole("button", { name: "Controlla aggiornamenti", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".update-progress-card")).toHaveCount(0);
});

test("stops monitoring when the updater becomes idle", async ({ page }) => {
  await page.route("**/api/system-update", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        installed: true,
        currentVersion: "2.0.8",
        authRequired: false,
        updateAvailable: true,
        latestVersion: "2.0.9",
        status: {
          status: "checking",
          stage: "checking",
          latestVersion: "v2.0.9",
        },
      }),
    }),
  );
  await page.route("**/api/system-update/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "idle" }),
    }),
  );

  await page.goto("/settings/system-update");
  await switchToItalian(page);
  await expect(
    page.getByRole("button", { name: "Controlla aggiornamenti", exact: true }),
  ).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator(".update-progress-card")).toHaveCount(0);
});

test("captures the checking state without a phantom install card", async ({
  page,
}) => {
  let releaseCheck!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseCheck = resolve;
  });
  await page.route("**/api/system-update", async (route) => {
    await blocked;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        installed: true,
        currentVersion: "2.0.9",
        authRequired: false,
        updateAvailable: false,
        latestVersion: "2.0.9",
      }),
    });
  });
  await mockIdleTask(page);

  await page.goto("/settings/system-update");
  await expect(
    page.getByRole("button", { name: "Controllo…", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".update-progress-card")).toHaveCount(0);
  await expect(
    page.getByText("Il sistema è aggiornato.", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(screenshotDirectory, "03-checking-no-progress.png"),
    animations: "disabled",
  });
  releaseCheck();
  await expect(
    page.getByText("Il sistema è aggiornato.", { exact: true }),
  ).toBeVisible();
});

test("captures an available release in the expanded sidebar without progress", async ({
  page,
}) => {
  await mockAvailableCheck(page);
  await mockIdleTask(page);
  await page.goto("/settings");
  await switchToItalian(page);

  await expect(page.locator(".update-notification")).toContainText("2.0.10");
  await expect(page.locator(".sidebar-update-dot")).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, "01-expanded-sidebar-new-version.png"),
    animations: "disabled",
  });
  const laterButton = page.locator(".update-notification-later");
  await expect(laterButton).toHaveText("Più tardi");
  await laterButton.click();
  await expect(page.locator(".update-notification")).toHaveCount(0);
  await expect(page.locator(".sidebar-update-dot")).toBeVisible();
  await page.locator(".sidebar-update-entry").click();
  await expect(page).toHaveURL(/settings\/system-update/);
  await expect(page.locator(".update-release-card")).toContainText("2.0.10");
  await expect(page.locator(".update-progress-card")).toHaveCount(0);
  await page.screenshot({
    path: path.join(screenshotDirectory, "04-available-not-started.png"),
    animations: "disabled",
  });
});

test("shows a newer but incomplete release without offering installation", async ({
  page,
}) => {
  await page.route("**/api/system-update", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        installed: true,
        currentVersion: "2.0.9",
        authRequired: false,
        updateAvailable: false,
        notInstallable: true,
        latestVersion: "2.0.10",
        releaseNotes: "Pacchetto non ancora completo.",
      }),
    }),
  );
  await mockIdleTask(page);
  await page.goto("/settings/system-update");
  await switchToItalian(page);

  await expect(page.locator(".update-version-block")).toContainText("2.0.10");
  await expect(page.locator(".update-release-card")).toContainText("2.0.10");
  await expect(page.locator(".update-release-card")).toContainText(
    "Pacchetto non ancora completo.",
  );
  await expect(
    page.locator(".update-release-card").getByRole("button"),
  ).toHaveCount(0);
});

test("keeps the version link and red dot usable when the sidebar is collapsed", async ({
  page,
}) => {
  await mockAvailableCheck(page);
  await mockIdleTask(page);
  await page.goto("/settings");
  await switchToItalian(page);
  await expect(page.locator(".sidebar-update-dot")).toBeVisible();
  await page.locator(".sidebar-toggle").click();
  await expect(page.locator(".sidebar-update-copy")).toBeHidden();
  await expect(page.locator(".sidebar-update-entry")).toHaveAttribute(
    "aria-label",
    /2\.0\.9/,
  );
  await page.screenshot({
    path: path.join(screenshotDirectory, "02-collapsed-sidebar-red-dot.png"),
    animations: "disabled",
  });
  await page.locator(".sidebar-update-entry").click();
  await expect(page).toHaveURL(/settings\/system-update/);
});

test("shows progress only after the executor reports a real stage", async ({
  page,
}) => {
  await mockAvailableCheck(page);
  let started = false;
  let polls = 0;
  await page.route("**/api/system-update/status", (route) => {
    if (!started)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "idle", currentVersion: "2.0.9" }),
      });
    polls += 1;
    const status =
      polls === 1
        ? {
            status: "starting",
            stage: "starting",
            updateId: "0bd7d5ac-4cd6-4a7e-9fd4-d11c136caf16",
            targetVersion: "2.0.10",
            executorAlive: true,
          }
        : {
            status: "running",
            stage: "downloading",
            updateId: "0bd7d5ac-4cd6-4a7e-9fd4-d11c136caf16",
            targetVersion: "2.0.10",
            executorAlive: true,
            executorConfirmed: true,
            completedStages: ["reading-release"],
            bytesDownloaded: 120_000_000,
            totalBytes: 240_000_000,
            progressKnown: true,
          };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(status),
    });
  });
  await page.route("**/api/system-update", async (route) => {
    if (route.request().method() === "POST") {
      started = true;
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          started: true,
          status: "starting",
          stage: "starting",
          updateId: "0bd7d5ac-4cd6-4a7e-9fd4-d11c136caf16",
          targetVersion: "2.0.10",
          currentVersion: "2.0.9",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(availableRelease()),
    });
  });

  await page.goto("/settings/system-update");
  await switchToItalian(page);
  const releaseCard = page.locator(".update-release-card");
  await releaseCard.getByRole("button", { name: "Aggiorna ora" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Aggiorna ora" })
    .click();
  await expect(page.locator(".update-task-compact")).toContainText(
    "Avvio dell'attività di aggiornamento",
  );
  await expect(page.locator(".update-progress-card")).toHaveCount(0);
  await expect(page.locator(".update-progress-track")).toBeVisible({
    timeout: 8_000,
  });
  await expect(page.locator(".update-progress-track")).toHaveAttribute(
    "aria-valuenow",
    "50",
  );
  await page.screenshot({
    path: path.join(screenshotDirectory, "05-confirmed-download-progress.png"),
    animations: "disabled",
  });
});

test("shows rollback as a result instead of a normal upgrade step", async ({
  page,
}) => {
  await mockAvailableCheck(page);
  await page.route("**/api/system-update/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "failed",
        stage: "validating",
        failedStage: "validating",
        updateId: "0bd7d5ac-4cd6-4a7e-9fd4-d11c136caf16",
        targetVersion: "2.0.10",
        previousVersion: "2.0.9",
        currentVersion: "2.0.9",
        actualVersion: "2.0.9",
        executorConfirmed: true,
        recoveryStatus: "succeeded",
        completedStages: [
          "reading-release",
          "downloading",
          "verifying",
          "backing-up",
          "installing",
        ],
        message: "The new release failed its health check.",
        recoveryMessage: "The previous version was restored and verified.",
      }),
    }),
  );
  await page.route("**/api/system-update/status/log", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ log: "Health check failed; rollback verified." }),
    }),
  );

  await page.goto("/settings/system-update");
  await switchToItalian(page);
  await expect(page.locator(".update-result-card")).toContainText(
    "Aggiornamento non riuscito; la versione precedente è stata ripristinata e verificata.",
  );
  await expect(page.locator(".update-stage-list li")).toHaveCount(0);
  await page.locator(".update-diagnostics-toggle").click();
  await expect(
    page
      .locator(".update-stage-list li")
      .filter({ hasText: "Avvio e verifica database" }),
  ).toHaveClass(/failed/);
  await expect(page.locator(".update-diagnostics")).toContainText(
    "The new release failed its health check.",
  );
  await expect(page.locator(".update-diagnostics")).toContainText(
    "Health check failed; rollback verified.",
  );
  await page.screenshot({
    path: path.join(screenshotDirectory, "06-failed-restored-result.png"),
    animations: "disabled",
  });
});

test("retries the first status read automatically and keeps the update page as a manual check entry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("ngt-auto-update-check", "false");
  });
  let statusReads = 0;
  let updateChecks = 0;
  await page.route("**/api/system-update/status", (route) => {
    statusReads += 1;
    return route.fulfill({
      status: statusReads === 1 ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        statusReads === 1
          ? { status: "verifying-task", message: "temporary failure" }
          : {
              status: "idle",
              currentVersion: "2.0.9",
              installInstanceId: "test-install-a",
            },
      ),
    });
  });
  await page.route("**/api/system-update", (route) => {
    updateChecks += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...availableRelease(),
        updateAvailable: false,
        latestVersion: "2.0.9",
        installInstanceId: "test-install-a",
        status: { status: "idle", currentVersion: "2.0.9" },
      }),
    });
  });

  await page.goto("/settings");
  await expect.poll(() => statusReads).toBeGreaterThan(1);
  expect(updateChecks).toBe(0);

  await page.goto("/settings/system-update");
  await expect(
    page.getByRole("button", { name: "Controlla aggiornamenti", exact: true }),
  ).toBeEnabled();
  expect(updateChecks).toBe(1);
  await page
    .getByRole("button", { name: "Controlla aggiornamenti", exact: true })
    .click();
  await expect.poll(() => updateChecks).toBe(2);
});

test("reuses a recent install-scoped update result after a page reload", async ({
  page,
}) => {
  let updateChecks = 0;
  await page.route("**/api/system-update/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "idle",
        currentVersion: "2.0.9",
        installInstanceId: "test-install-cache",
      }),
    }),
  );
  await page.route("**/api/system-update", (route) => {
    updateChecks += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...availableRelease(),
        updateAvailable: false,
        latestVersion: "2.0.9",
        installInstanceId: "test-install-cache",
        status: { status: "idle", currentVersion: "2.0.9" },
      }),
    });
  });

  await page.goto("/settings/system-update");
  await expect(
    page.getByText("Il sistema è aggiornato.", { exact: true }),
  ).toBeVisible();
  expect(updateChecks).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Il sistema è aggiornato.", { exact: true }),
  ).toBeVisible();
  expect(updateChecks).toBe(1);
});

test("continues monitoring an active update beyond the previous four-minute limit", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T12:00:00.000Z") });
  let started = false;
  let statusReads = 0;
  let monitoringReads = 0;
  let completedStatusReads = 0;
  await page.route("**/api/system-update/status", async (route) => {
    statusReads += 1;
    if (started) monitoringReads += 1;
    const status = started
      ? {
          status: "running",
          stage: "installing",
          updateId: "0bd7d5ac-4cd6-4a7e-9fd4-d11c136caf16",
          targetVersion: "2.0.10",
          currentVersion: "2.0.9",
          executorAlive: true,
          executorConfirmed: true,
          updatedAt: "2026-10-15T12:00:00.000Z",
        }
      : { status: "idle", currentVersion: "2.0.9" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(status),
    });
    completedStatusReads += 1;
  });
  await page.route("**/api/system-update", (route) => {
    if (route.request().method() === "POST") {
      started = true;
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          status: "starting",
          stage: "starting",
          updateId: "0bd7d5ac-4cd6-4a7e-9fd4-d11c136caf16",
          targetVersion: "2.0.10",
          currentVersion: "2.0.9",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(availableRelease()),
    });
  });

  await page.goto("/settings/system-update");
  await page
    .locator(".update-release-card")
    .getByRole("button", { name: "Aggiorna ora" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Aggiorna ora" })
    .click();
  for (
    let elapsed = 0;
    elapsed < 400_000 && monitoringReads <= 120;
    elapsed += 1_000
  ) {
    const previousReads = statusReads;
    await page.clock.runFor(1_000);
    if (statusReads > previousReads) {
      await expect.poll(() => completedStatusReads).toBe(statusReads);
    }
  }

  expect(monitoringReads).toBeGreaterThan(120);
  await expect(page.locator(".update-progress-card")).toContainText(
    "Installazione",
  );
});

test("sidebar version entry hover stays contained and collapses cleanly", async ({
  page,
}) => {
  await mockAvailableCheck(page);
  await mockIdleTask(page);
  await page.goto("/settings");
  await switchToItalian(page);

  const entry = page.locator(".sidebar-update-entry");
  const icon = entry.locator(".sidebar-update-icon svg");
  const version = entry.locator(".sidebar-update-copy strong");
  const summary = entry.locator(".sidebar-update-copy small");
  const arrow = entry.locator(".sidebar-update-arrow");
  await expect(icon).toHaveClass(/lucide-refresh-cw/);
  await expect(icon).toHaveAttribute("width", "19");
  await expect(arrow).toBeVisible();
  expect(await arrow.evaluate((node) => getComputedStyle(node).transform)).toBe(
    "none",
  );
  const initialIconColor = await icon.evaluate(
    (node) => getComputedStyle(node).color,
  );

  const initialGeometry = await Promise.all(
    [icon, version, summary].map((node) => node.boundingBox()),
  );
  await entry.hover();
  await expect
    .poll(() =>
      arrow.evaluate(
        (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41,
      ),
    )
    .toBe(3);
  expect(
    await entry.evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe("rgb(255, 248, 217)");
  expect(await icon.evaluate((node) => getComputedStyle(node).color)).toBe(
    "rgb(98, 93, 76)",
  );
  expect(initialIconColor).toBe("rgb(112, 107, 88)");
  expect(
    await entry.evaluate((node) => {
      const style = getComputedStyle(node);
      return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ];
    }),
  ).toEqual(["8px", "8px", "8px", "8px"]);
  const underlineGeometry = await version.evaluate((node) => {
      const style = getComputedStyle(node, "::after");
      return {
        scaleX: new DOMMatrixReadOnly(style.transform).m11,
        underlineWidth: Number.parseFloat(style.width),
        textWidth: node.getBoundingClientRect().width,
      };
  });
  expect(underlineGeometry.scaleX).toBe(1);
  expect(underlineGeometry.underlineWidth).toBeCloseTo(
    underlineGeometry.textWidth,
    3,
  );
  const hoverGeometry = await Promise.all(
    [icon, version, summary].map((node) => node.boundingBox()),
  );
  expect(hoverGeometry).toEqual(initialGeometry);
  await entry.screenshot({
    path: path.join(screenshotDirectory, "07-sidebar-update-entry-hover.png"),
  });

  await page.mouse.move(0, 0);
  await expect
    .poll(() =>
      arrow.evaluate(
        (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41,
      ),
    )
    .toBe(0);
  await expect
    .poll(() =>
      version.evaluate(
        (node) =>
          new DOMMatrixReadOnly(getComputedStyle(node, "::after").transform)
            .m11,
      ),
    )
    .toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await entry.hover();
  await expect
    .poll(() =>
      arrow.evaluate((node) => {
        const transform = getComputedStyle(node).transform;
        return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
      }),
    )
    .toBe(0);
  await expect
    .poll(() =>
      version.evaluate(
        (node) =>
          new DOMMatrixReadOnly(getComputedStyle(node, "::after").transform)
            .m11,
      ),
    )
    .toBe(1);
  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.keyboard.press("Tab");
  await entry.focus();
  await expect
    .poll(() => entry.evaluate((node) => node.matches(":focus-visible")))
    .toBe(true);
  await expect
    .poll(() =>
      version.evaluate(
        (node) =>
          new DOMMatrixReadOnly(getComputedStyle(node, "::after").transform)
            .m11,
      ),
    )
    .toBe(1);

  await page.getByRole("button", { name: "Riduci barra laterale" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar-collapsed",
    "true",
  );
  await expect(icon).toBeVisible();
  await expect(version).toBeHidden();
  await expect(arrow).toBeHidden();
});
