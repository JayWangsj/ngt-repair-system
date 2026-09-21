import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, owner = false) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(owner ? "owner@test.it" : "staff@test.it");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Test-Only-Password-2026");
  await page.getByRole("button", { name: "Accedi al laboratorio" }).click();
  await expect(
    page.getByRole("heading", { name: "Oggi in laboratorio" }),
  ).toBeVisible();
}
async function create(
  page: Page,
  options: { manual?: boolean; deposit?: string } = {},
) {
  await page.goto("/orders/new");
  await page
    .getByLabel("Telefono", { exact: true })
    .fill(`333${Date.now().toString().slice(-7)}`);
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Cliente Playwright");
  await page.getByLabel("Marca", { exact: true }).fill("Apple");
  await page.getByLabel("Modello", { exact: true }).fill("iPhone 13");
  await page
    .getByLabel("Problema segnalato", { exact: true })
    .fill("Schermo danneggiato");
  await page
    .getByLabel("Intervento 1", { exact: true })
    .fill(options.manual ? "Fotocamera" : "sostituzione display");
  if (options.manual) {
    await expect(
      page.getByText("Nessun prezzo trovato", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Prezzo finale (€) 1", { exact: true }).fill("75");
    await page
      .getByLabel("Motivo prezzo manuale / modifica 1", { exact: true })
      .fill("Ricambio non presente nel listino");
  } else
    await expect(
      page.getByLabel("Prezzo finale (€) 1", { exact: true }),
    ).toHaveValue("100");
  await page
    .getByLabel("Acconto (€)", { exact: true })
    .fill(options.deposit ?? "20");
  await page
    .getByLabel("Preventivo confermato dal cliente", { exact: true })
    .check();
  await page
    .getByLabel("Come è stato confermato?", { exact: true })
    .fill("In negozio");
  await page.getByRole("button", { name: "Crea scheda", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/(?!new)[a-z0-9]+$/);
  return page.url();
}
async function state(page: Page, next: string) {
  await page
    .getByRole("combobox", { name: "Nuovo stato", exact: true })
    .selectOption(next);
  await page
    .getByRole("button", { name: "Aggiorna stato", exact: true })
    .click();
  await expect(page.locator(".detail-status .badge")).toContainText(
    next === "REPAIRING" ? "In riparazione" : "Da ritirare",
  );
}
test("staff completes registration, automatic quotation, payment and delivery", async ({
  page,
}) => {
  await login(page);
  await create(page);
  await state(page, "REPAIRING");
  await state(page, "READY");
  await page.getByLabel("Importo (€)", { exact: true }).fill("80");
  await page
    .getByRole("combobox", { name: "Metodo di pagamento", exact: true })
    .selectOption("CARD");
  await page
    .getByRole("button", { name: "Registra incasso", exact: true })
    .click();
  await expect(page.locator(".balance-card>strong")).toContainText("0,00");
  await page
    .getByRole("combobox", { name: "Nuovo stato", exact: true })
    .selectOption("COMPLETED");
  await page
    .getByLabel("Nome di chi ritira", { exact: true })
    .fill("Cliente Playwright");
  await page
    .getByRole("button", { name: "Consegna dispositivo", exact: true })
    .click();
  await expect(page.locator(".detail-status .badge")).toHaveText("Consegnato");
  await expect(page.getByText("Ritirato da:", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Cliente ↗" }).click();
  await expect(
    page.getByRole("heading", { name: "Storico riparazioni" }),
  ).toBeVisible();
  await expect(page.locator("table")).toContainText("Consegnato");
});
test("manual quote without matching rule and overpayment error", async ({
  page,
}) => {
  await login(page);
  await create(page, { manual: true, deposit: "0" });
  await expect(
    page.getByText("Prezzo manuale", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("Importo (€)", { exact: true }).fill("76");
  await page
    .getByRole("button", { name: "Registra incasso", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "supera il saldo",
  );
  await expect(page.locator(".balance-card>strong")).toContainText("75,00");
});
test("unpaid delivery is blocked for staff and requires explicit owner acknowledgement", async ({
  page,
  browser,
}) => {
  await login(page);
  const url = await create(page);
  await state(page, "REPAIRING");
  await state(page, "READY");
  await page
    .getByRole("combobox", { name: "Nuovo stato", exact: true })
    .selectOption("COMPLETED");
  await page.getByLabel("Nome di chi ritira", { exact: true }).fill("Cliente");
  await page
    .getByRole("button", { name: "Consegna dispositivo", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "titolare",
  );
  const context = await browser.newContext();
  const ownerPage = await context.newPage();
  await login(ownerPage, true);
  await ownerPage.goto(url);
  await ownerPage
    .getByRole("combobox", { name: "Nuovo stato", exact: true })
    .selectOption("COMPLETED");
  await ownerPage
    .getByLabel("Nome di chi ritira", { exact: true })
    .fill("Cliente");
  await ownerPage
    .getByLabel("Autorizzo la consegna con saldo aperto", { exact: true })
    .check();
  await ownerPage
    .getByRole("button", { name: "Consegna dispositivo", exact: true })
    .click();
  await expect(ownerPage.locator(".detail-status .badge")).toHaveText(
    "Consegnato",
  );
  await expect(ownerPage.locator(".balance-card>strong")).toContainText(
    "80,00",
  );
  await context.close();
});
test("anonymous and staff cannot access protected administration", async ({
  page,
}) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login/);
  await login(page);
  await expect(page.getByRole("link", { name: "Collaboratori" })).toHaveCount(
    0,
  );
  for (const path of ["/prices", "/team", "/reports"]) {
    await page.goto(path);
    await expect(
      page.getByText("Questa sezione è riservata al titolare."),
    ).toBeVisible();
  }
});
test("owner manages list prices and dashboard has responsive mobile layout", async ({
  page,
}) => {
  await login(page, true);
  await page.goto("/prices");
  await page.getByText("Nuova regola", { exact: true }).click();
  const form = page.locator("details").first();
  await form
    .getByLabel("Intervento", { exact: true })
    .fill(`pulizia ${Date.now()}`);
  await form.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("15");
  await form.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("Operazione completata");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Oggi in laboratorio" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Oggi in laboratorio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Oggi in laboratorio" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
});
