import { expect, test, type Page } from "@playwright/test";

async function switchToItalian(page: Page) {
  const italianButton = page.getByRole("button", {
    name: "Italiano",
    exact: true,
  });
  if (await italianButton.isVisible()) await italianButton.click();
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
