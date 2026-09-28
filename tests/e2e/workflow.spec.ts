import { test, expect, type Locator, type Page } from "@playwright/test";

async function chooseBusinessOption(
  page: Page,
  label: string,
  option: string,
  scope: Page | Locator = page,
) {
  const combobox = scope.getByRole("combobox", { name: label, exact: true });
  const simpleSelect = scope.getByRole("button", { name: label, exact: true });
  await expect(combobox.or(simpleSelect).first()).toBeVisible();
  if (await combobox.isVisible()) {
    await combobox.click();
    await combobox.fill(option);
  } else await simpleSelect.click();
  const panel = page.locator(".business-select-panel.is-entering");
  const exact = panel.getByRole("option", { name: option, exact: true });
  if (await exact.count()) await exact.click();
  else
    await panel.getByRole("option").filter({ hasText: option }).first().click();
}

async function enterBusinessValue(
  page: Page,
  label: string,
  value: string,
  scope: Page | Locator = page,
) {
  const combobox = scope.getByRole("combobox", { name: label, exact: true });
  await combobox.click();
  await combobox.fill(value);
  const panel = page.locator(".business-select-panel.is-entering");
  expect(
    await panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    }),
  ).toBe(true);
  await combobox
    .locator("xpath=ancestor::*[contains(@class, 'business-combobox-control')]")
    .locator(".business-select-create")
    .click();
  await combobox.press("Escape");
}
async function fillOrder(
  page: Page,
  options: {
    manual?: boolean;
    discount?: boolean;
    phone?: string;
    name?: string;
  } = {},
) {
  await page.goto("/orders/new");
  const customerName = options.name ?? "Cliente Playwright";
  if (options.phone) {
    await page
      .getByRole("combobox", { name: "Cerca cliente", exact: true })
      .fill(options.phone);
    await page
      .getByRole("button", { name: "Nuovo cliente", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
    await dialog.getByLabel(/Nome e cognome/).fill(customerName);
    await dialog.getByLabel(/Telefono/).fill(options.phone);
    await dialog
      .getByRole("button", { name: "Salva cliente", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  if (!options.phone)
    await chooseBusinessOption(page, "Cerca cliente", customerName);
  if (options.phone) {
    await chooseBusinessOption(page, "Marca", "Apple");
    await chooseBusinessOption(page, "Modello", "iPhone 13");
  } else {
    await chooseBusinessOption(
      page,
      "Dispositivo del cliente",
      "Apple iPhone 13",
    );
  }
  await page.getByLabel("Display rotto", { exact: true }).check();
  await page
    .getByLabel("Consegna prevista", { exact: true })
    .fill("2099-12-31");
  if (options.manual) {
    const project = page.getByRole("combobox", {
      name: "Intervento 1",
      exact: true,
    });
    await project.fill(`Fotocamera ${Date.now()}`);
  } else
    await chooseBusinessOption(page, "Intervento 1", "sostituzione display");
  if (options.manual) {
    const price = page.getByLabel("Prezzo originale (€) 1", { exact: true });
    const create = page.getByRole("button", {
      name: "Intervento personalizzato",
      exact: true,
    });
    await expect(async () => {
      await price.fill("75");
      await expect(price).toHaveValue("75");
      await expect(create).toBeEnabled();
    }).toPass();
    await create.click();
  } else
    await expect(
      page.getByLabel("Prezzo originale (€) 1", { exact: true }),
    ).toHaveValue("100");
  if (options.discount) {
    await page
      .getByRole("button", { name: "Aggiungi sconto intervento", exact: true })
      .click();
    await page
      .getByLabel("Sconto intervento (€) 1", { exact: true })
      .fill("10");
    await page
      .getByLabel("Sconto aggiuntivo sulla scheda (€)", { exact: true })
      .fill("5");
    await page
      .getByLabel("Includi IVA nel saldo da pagare", { exact: true })
      .check();
  }
  await expect(
    page.getByLabel("Preventivo confermato dal cliente", { exact: true }),
  ).toHaveCount(0);
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Crea scheda", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/(?!new)[a-z0-9]+$/);
}
async function openPayment(page: Page) {
  const step = page.locator(".order-step-card").filter({ hasText: /^04/ });
  await step.locator(".order-step-heading").click();
}
async function openStep(page: Page, index: number) {
  const card = page.locator(".order-step-card").nth(index);
  if (
    (await card
      .locator(".order-step-heading")
      .getAttribute("aria-expanded")) !== "true"
  )
    await card.locator(".order-step-heading").click();
}
async function state(page: Page, next: string) {
  const label = next === "REPAIRING" ? "In riparazione" : "Da ritirare";
  await page.locator(".detail-status .status-dropdown-trigger").click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toContainText(label);
}
test("new repair uses a single selected accordion step", async ({ page }) => {
  await page.goto("/orders/new");
  const cards = page.locator(".order-step-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toHaveClass(/is-selected/);
  await expect(cards.nth(0).locator(".order-step-state")).toContainText(
    "In corso",
  );
  await expect(page.locator(".order-step-collapse.is-expanded")).toHaveCount(1);
  const cardGaps = async () =>
    cards.evaluateAll((elements) =>
      elements.slice(1).map((element, index) => {
        const previous = elements[index].getBoundingClientRect();
        return element.getBoundingClientRect().top - previous.bottom;
      }),
    );
  await expect(page.locator(".order-wizard")).toHaveCSS("row-gap", "22px");
  await expect
    .poll(async () => (await cardGaps()).every((gap) => gap > 0))
    .toBe(true);
  await cards.nth(3).locator(".order-step-heading").click();
  await expect(cards.nth(3)).toHaveClass(/is-selected/);
  await expect(cards.nth(0)).not.toHaveClass(/is-selected/);
  await expect(page.locator(".order-step-collapse.is-expanded")).toHaveCount(1);
  await cards.nth(3).getByLabel("Incasso alla creazione (€)").fill("10");
  await expect(cards.nth(3)).toHaveClass(/is-selected/);
  expect((await cardGaps()).every((gap) => gap > 18)).toBe(true);
  const actionGap = await page
    .locator(".sticky-order-actions")
    .evaluate(
      (actions, card) =>
        actions.getBoundingClientRect().top -
        (card as Element).getBoundingClientRect().bottom,
      await cards.nth(3).elementHandle(),
    );
  expect(actionGap).toBeGreaterThanOrEqual(20);
});

test("device step gates faults and advances only after faults and due date", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await openStep(page, 1);
  const card = page.locator(".order-step-card").nth(1);
  const dueDate = page.getByLabel("Consegna prevista", { exact: true });
  const inspection = card.locator(".inspection-choice button");
  const display = page.getByLabel("Display rotto", { exact: true });
  const power = page.getByLabel("Non si accende", { exact: true });

  await expect(
    page.getByText("Completa prima tipo, marca e modello"),
  ).toBeVisible();
  await expect(inspection).toHaveCount(0);
  await expect(display).toHaveCount(0);
  await expect(dueDate).toHaveCount(0);

  await chooseBusinessOption(page, "Marca", "Apple");
  await card.locator(".order-step-heading").click();
  await expect(card.locator(".order-step-title small")).toHaveText(
    "Seleziona il modello del dispositivo.",
  );
  await card.locator(".order-step-heading").click();
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await expect(display).toBeEnabled();
  await expect(inspection).toBeEnabled();
  await expect(dueDate).toHaveCount(0);

  await display.check();
  await power.check();
  await expect(card).toHaveClass(/is-selected/);
  await expect(dueDate).toBeEnabled();
  await inspection.click();
  await expect(display).toBeChecked();
  await expect(power).toBeChecked();
  await expect(display).toBeDisabled();
  await inspection.click();
  await expect(display).toBeEnabled();
  await expect(display).toBeChecked();

  await dueDate.fill("2099-12-31");
  await expect(card.locator(".order-step-state")).toHaveText("Completato");
  await expect(page.locator(".order-step-card").nth(2)).toHaveClass(
    /is-selected/,
  );
});

test("single operator opens every business page without login", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/orders",
    "/retail",
    "/retail/sales",
    "/inventory",
    "/customers",
    "/prices",
    "/reports",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page).not.toHaveURL(/login/);
  }
  await expect(
    page.getByRole("link", { name: "Collaboratori", exact: true }),
  ).toHaveCount(0);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Andamento", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Statistiche dettagliate", exact: true }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("group", { name: "Lingua / 语言", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancella tutti i dati", exact: true }),
  ).toBeVisible();
  for (const [path, name] of [
    ["/orders", "Nuova riparazione"],
    ["/customers", "Nuovo cliente"],
    ["/prices", "Nuova regola"],
  ] as const) {
    await page.goto(path);
    await expect(
      page
        .getByRole(path === "/orders" ? "link" : "button", {
          name,
          exact: true,
        })
        .first(),
    ).toHaveClass(/button-primary/);
  }
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/team");
  await expect(page).toHaveURL(/\/$/);
});

test("dashboard animates once per data snapshot and respects reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  const dashboard = page.getByTestId("dashboard-motion");
  await expect(dashboard).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("ngt-dashboard-animation")),
    )
    .not.toBeNull();
  const fingerprint = await page.evaluate(() =>
    sessionStorage.getItem("ngt-dashboard-animation"),
  );
  await expect(dashboard).not.toHaveClass(/dashboard-animating/, {
    timeout: 2000,
  });

  await page.goto("/orders");
  await page.goto("/");
  await expect(page.getByTestId("dashboard-motion")).not.toHaveClass(
    /dashboard-animating/,
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("ngt-dashboard-animation"),
    ),
  ).toBe(fingerprint);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() =>
    sessionStorage.removeItem("ngt-dashboard-animation"),
  );
  await page.reload();
  await expect(page.getByTestId("dashboard-motion")).not.toHaveClass(
    /dashboard-animating/,
  );
});

test("creates and edits a product directly in the inventory row", async ({
  page,
}) => {
  await page.goto("/inventory");
  const repairPartRow = page.getByRole("row", { name: /Batteria Test/ });
  await expect(repairPartRow).toContainText("Riparazione");
  await expect(repairPartRow.locator("td").nth(4)).toHaveText("—");
  await repairPartRow.click();
  await expect(repairPartRow.locator("td").nth(4).locator("input")).toHaveCount(
    0,
  );
  await page.getByRole("heading", { name: "Magazzino" }).click();

  await page.getByRole("button", { name: "Nuovo prodotto" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Prodotto", { exact: true }).fill("Cavo USB-C E2E");
  await chooseBusinessOption(page, "Categoria", "Ricarica", dialog);
  await chooseBusinessOption(page, "Utilizzo", "Vendita e riparazione", dialog);
  await dialog.getByLabel("Costo", { exact: true }).fill("4.50");
  await dialog.getByLabel("Prezzo", { exact: true }).fill("12");
  await dialog.getByLabel("Scorta iniziale", { exact: true }).fill("4");
  await dialog.getByLabel("Scorta minima", { exact: true }).fill("2");
  await dialog.getByLabel("Prodotto frequente", { exact: true }).check();
  await dialog.getByRole("button", { name: "Salva prodotto" }).click();

  const row = page.getByRole("row", { name: /Cavo USB-C E2E/ });
  await expect(row).toContainText("Vendita e riparazione");
  await expect(row).toContainText("4");
  await row.click();
  await row.getByLabel("+ Disponibilità").click();
  await expect(row.getByLabel("Disponibilità", { exact: true })).toHaveValue(
    "5",
  );
  await row.getByLabel("Prodotto frequente", { exact: true }).click();
  await page
    .getByRole("button", { name: "Gestisci selezione", exact: true })
    .click();
  await row.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: /Elimina prodotti selezionati/ }),
  ).toContainText("(1)");
});

test("repair list exposes month, status, due-date and payment controls", async ({
  page,
}) => {
  await fillOrder(page, { manual: true });
  await save(page);
  await page.goto("/orders");
  await expect(page.locator('input[name="month"]')).toHaveValue(
    /^\d{4}-\d{2}$/,
  );
  const row = page.locator("tbody tr").first();
  await row.hover();
  await expect(row).toHaveCSS("background-color", "rgb(255, 249, 232)");
  await expect(row).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, -1\)/);

  const orderLink = row.locator(".order-code-link");
  await orderLink.hover();
  await expect(orderLink).toHaveCSS("color", "rgb(84, 62, 0)");
  await expect(orderLink.locator("svg")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 4, 0)",
  );
  expect(
    await orderLink
      .locator("span")
      .evaluate((text) => getComputedStyle(text, "::after").transform),
  ).toBe("matrix(1, 0, 0, 1, 0, 0)");
  await orderLink.evaluate((link) =>
    link.addEventListener("click", (event) => event.preventDefault()),
  );
  await orderLink.click();
  await expect(row).not.toHaveClass(/order-row-active/);

  const customerLink = row.locator(".order-customer-link");
  const customerUnderline = customerLink.locator("span");
  expect(
    await customerUnderline.evaluate(
      (text) => getComputedStyle(text, "::after").transform,
    ),
  ).toBe("matrix(0, 0, 0, 1, 0, 0)");
  await customerLink.hover();
  await expect(customerLink.locator("svg")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 4, 0)",
  );
  expect(
    await customerUnderline.evaluate(
      (text) => getComputedStyle(text, "::after").transform,
    ),
  ).toBe("matrix(1, 0, 0, 1, 0, 0)");
  await customerLink.evaluate((link) =>
    link.addEventListener("click", (event) => event.preventDefault()),
  );
  await customerLink.click();
  await expect(row).not.toHaveClass(/order-row-active/);

  await row.click();
  await expect(row).toHaveClass(/order-row-active/);
  await expect(row).toHaveCSS("background-color", "rgb(255, 249, 232)");
  await expect(row).toHaveCSS("box-shadow", "none");
  await expect(row).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(row.locator(".order-inline-edit-cell > *").first()).toHaveCSS(
    "transform",
    /matrix\(1\.015, 0, 0, 1\.015, 0, 0\)/,
  );
  const status = row.locator(".status-dropdown-trigger");
  await expect(status).toBeVisible();
  await expect(row.locator("select.status-select")).toHaveCount(0);
  const currentStatus = (await status.textContent())?.trim() ?? "";
  const rowHeight = await row.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await status.click();
  await expect(page.locator(".status-dropdown-menu")).toHaveCSS(
    "position",
    "fixed",
  );
  await expect(
    page
      .locator(".status-dropdown-menu")
      .getByRole("option", { name: currentStatus, exact: true }),
  ).toHaveCount(0);
  expect(
    await row.evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(rowHeight);
  await page
    .locator(".status-dropdown-menu")
    .getByRole("option", { name: "Ricambio mancante", exact: true })
    .click();
  await expect(status).toHaveClass(/status-parts_missing/);
  await expect(
    row.getByLabel("Consegna prevista", { exact: true }),
  ).toBeEnabled();
  await expect(row.getByLabel("Incassato", { exact: true })).toBeVisible();
  await row.getByLabel("Consegna prevista", { exact: true }).fill("2099-11-30");
  await row.getByLabel("Incassato", { exact: true }).fill("30");
  await page.getByRole("heading", { name: "Riparazioni" }).click();
  await expect(row.getByLabel("Incassato", { exact: true })).toHaveCount(0);
  await expect(row).toContainText("30,00 €");
  await expect(row).toContainText("30/11/2099");
});
test("repair list delivery uses the shared checkout and refreshes the row", async ({
  page,
}) => {
  await fillOrder(page);
  await save(page);
  await state(page, "READY");
  const orderPath = new URL(page.url()).pathname;
  await page.goto("/orders");
  const row = page.locator(`tbody tr:has(a[href="${orderPath}"])`);
  await row.click();
  await row.locator(".status-dropdown-trigger").click();
  await page
    .locator(".status-dropdown-menu")
    .getByRole("option", { name: "Consegnato", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Incassa e consegna" });
  await expect(dialog.getByLabel("Importo (€)", { exact: true })).toHaveValue(
    "100.00",
  );
  await dialog.getByRole("button", { name: /Incassa e consegna/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.locator(".badge")).toContainText("Consegnato");
  await expect(row).toContainText("Consegnato");
  await expect(row).toContainText("0,00 €");
});

test("repair list cancellation uses the shared confirmation and locks the row", async ({
  page,
}) => {
  await fillOrder(page);
  await save(page);
  const orderPath = new URL(page.url()).pathname;
  await page.goto("/orders");
  const row = page.locator(`tbody tr:has(a[href="${orderPath}"])`);
  await row.click();
  await row.locator(".status-dropdown-trigger").click();
  await page
    .locator(".status-dropdown-menu")
    .getByRole("option", { name: "Annullato", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Annulla scheda" });
  await dialog
    .getByLabel("Motivo dell'annullamento (facoltativo)")
    .fill("Cliente rinuncia");
  await dialog.getByRole("button", { name: "Conferma annullamento" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText("Annullato");
  await expect(row).toContainText("0,00 €");
  await expect(row.getByLabel("Incassato", { exact: true })).toHaveCount(0);
});

test("diagnostic order follows inspection, quote and customer approval flow", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await chooseBusinessOption(page, "Cerca cliente", "Cliente Playwright");
  await chooseBusinessOption(
    page,
    "Dispositivo del cliente",
    "Apple iPhone 13",
  );
  await page
    .getByRole("button", { name: "Imposta diagnosi", exact: true })
    .click();
  await page
    .getByLabel("Consegna prevista", { exact: true })
    .fill("2099-12-31");
  await expect(
    page.getByLabel("Costo diagnosi (€) *", { exact: true }),
  ).toHaveValue("30");
  await expect(page.getByLabel("Intervento 1", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Completati 3/3 passaggi obbligatori").first(),
  ).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/new-order-inspection-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 844 });
  await save(page);
  const orderPath = new URL(page.url()).pathname;
  const status = page.locator(".detail-status .status-dropdown-trigger");
  await expect(status).toContainText("In diagnosi");
  const quote = page.getByTestId("quote-card");
  await expect(quote).toContainText("Dispositivo in diagnosi");
  await expect(quote).toContainText("30,00 €");
  await expect(quote).toContainText("6,60 €");
  await expect(quote.getByRole("row")).toHaveCount(0);

  await status.click();
  const statusMenu = page.locator(".status-dropdown-menu");
  await expect(
    statusMenu.getByRole("option", { name: "In riparazione", exact: true }),
  ).toHaveCount(0);
  await expect(
    statusMenu.getByRole("option", { name: "Da ritirare", exact: true }),
  ).toHaveCount(0);
  await expect(
    statusMenu.getByRole("option", { name: "Consegnato", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/orders");
  const listRow = page.locator(`tbody tr:has(a[href="${orderPath}"])`);
  await expect(listRow).toContainText("In diagnosi");
  await expect(listRow).toContainText("Problema da diagnosticare");
  await listRow.getByRole("link").first().click();

  await page
    .getByRole("button", {
      name: "Completa diagnosi e crea preventivo",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Completa diagnosi e crea preventivo",
  });
  const result = "Display danneggiato, necessaria la sostituzione";
  await dialog
    .getByLabel("Esito della diagnosi *", { exact: true })
    .fill(result);
  await chooseBusinessOption(
    page,
    "Intervento 1",
    "sostituzione display",
    dialog,
  );
  await expect(
    dialog.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveValue("100");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status).toContainText("Da confermare");
  await expect(page.getByTestId("details-card")).toContainText(result);
  await expect(quote).toContainText("Costo diagnosi (IVA esclusa)");
  await expect(quote).toContainText("sostituzione display");
  const history = page.getByTestId("history-card");
  await expect(history).toContainText("Diagnosi avviata");
  await expect(history).toContainText("Diagnosi completata");
  await expect(history).toContainText("Preventivo creato");
  await expect(history).toContainText("Stato aggiornato: Da confermare");

  await page
    .getByLabel("Come è stato confermato?", { exact: true })
    .fill("Confermato al banco");
  await page
    .getByRole("button", { name: "Registra conferma", exact: true })
    .click();
  await expect(status).toContainText("In riparazione");
});

test("sales history uses a monthly filter", async ({ page }) => {
  await page.goto("/retail/sales");
  await expect(
    page.getByRole("link", { name: /Vendita rapida/ }),
  ).toBeVisible();
  await expect(page.locator('input[name="period"]')).toHaveAttribute(
    "type",
    "month",
  );
  await page.getByRole("button", { name: "Filtra", exact: true }).click();
  await expect(page.locator('select[name="mode"]')).toHaveCount(0);
});

test("completes a retail sale and opens its immutable receipt", async ({
  page,
}) => {
  await page.goto("/retail");
  const products = page.locator(".retail-product-grid");
  const cable = products.getByRole("button", { name: /Cavo USB-C Test/ });
  await cable.click();
  await cable.click();
  await expect(page.locator(".retail-cart-row")).toContainText("2");
  await expect(
    products.getByRole("button", { name: /Cover esaurita Test/ }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Bonifico" })).toHaveCount(0);
  await page.getByRole("button", { name: "Carta", exact: true }).click();
  await page.getByRole("button", { name: /Conferma incasso.*24,00/ }).click();
  await expect(page.getByRole("status")).toContainText("Vendita completata");
  await expect(page.getByRole("status")).toContainText("24,00 €");
  await page.getByRole("link", { name: "Vedi vendita" }).click();
  await expect(page).toHaveURL(/\/retail\/sales\/[a-z0-9]+$/);
  await expect(
    page.getByRole("heading", { name: /Dettaglio vendita/ }),
  ).toBeVisible();
  await expect(page.getByText("Cavo USB-C Test")).toBeVisible();
  await page.goto("/retail/sales");
  await page
    .getByRole("button", { name: /^V-\d{8}\d{3}$/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Cavo USB-C Test");
});
test("creates automatic quote, receives payment and delivers", async ({
  page,
}) => {
  await fillOrder(page);
  await openPayment(page);
  await page
    .getByLabel("Incasso alla creazione (€)", { exact: true })
    .fill("20");
  await save(page);
  const productForm = page.locator(".order-product-form");
  await productForm
    .getByRole("combobox", { name: "Prodotto", exact: true })
    .click();
  await expect(page.getByRole("option", { name: /Batteria Test/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("option", { name: /Cover esaurita Test/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Accessori ricevuti", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".status-operation-card")).toHaveCount(0);
  await expect(page.locator(".balance-card>strong")).toContainText("80,00");
  await state(page, "READY");
  await expect(page.locator(".status-operation-card")).toHaveCount(1);
  await expect(page.locator(".secondary-status-action")).toHaveCount(0);
  await expect(page.locator('select[name="kind"]')).toHaveCount(0);
  await page.getByLabel("Importo (€)", { exact: true }).fill("80");
  await page.getByRole("button", { name: /Incassa e consegna/ }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);
  await page
    .getByRole("link", { name: "Cliente Playwright", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Storico riparazioni" }),
  ).toBeVisible();
});
test("discount and IVA persist without polluting historical prices", async ({
  page,
}) => {
  await fillOrder(page, { discount: true });
  await expect(page.locator(".price-breakdown")).toContainText("103,70");
  await openPayment(page);
  await page
    .getByLabel("Incasso alla creazione (€)", { exact: true })
    .fill("20");
  await save(page);
  await expect(page.locator(".balance-card>strong")).toContainText("83,70");
  await page.reload();
  await expect(page.locator(".balance-card>strong")).toContainText("83,70");
  const detailUrl = page.url();
  await page.goto("/settings");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.goto(detailUrl);
  await expect(
    page.getByRole("heading", { name: "报价", exact: true }),
  ).toBeVisible();
  await page.getByLabel("金额（€）", { exact: true }).fill("84");
  await page.getByRole("button", { name: "登记收款", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "超过待收余额",
  );
  await page.goto("/settings");
  await page.getByRole("button", { name: "Italiano", exact: true }).click();
  await page.goto("/orders/new");
  await openStep(page, 1);
  await chooseBusinessOption(page, "Marca", "Apple");
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await openStep(page, 2);
  await chooseBusinessOption(page, "Intervento 1", "sostituzione display");
  await expect(
    page.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveValue("100");
});
test("language switching from settings persists across business pages", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await page.goto("/orders/new");
  await expect(
    page.getByRole("heading", { name: "新建维修单", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Italiano", exact: true }).click();
  await page.goto("/orders/new");
  await expect(
    page.getByRole("heading", { name: "Nuova riparazione", exact: true }),
  ).toBeVisible();
});
test("manual quote saves automatically and rejects overpayment", async ({
  page,
}) => {
  await fillOrder(page, { manual: true });
  await save(page);
  await expect(page.locator(".balance-card>strong")).toContainText("75,00");
  await page.getByLabel("Importo (€)", { exact: true }).fill("76");
  await page
    .getByRole("button", { name: "Registra incasso", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "supera il saldo",
  );
  await page.goto("/prices");
  await page.getByLabel("Cerca", { exact: true }).fill("fotocamera");
  await expect(page.getByText(/fotocamera/i).first()).toBeVisible();
});
test("partial checkout records payment and delivers only after the balance is cleared", async ({
  page,
}) => {
  await fillOrder(page);
  await save(page);
  await state(page, "READY");
  const trigger = page.locator(".detail-status .status-dropdown-trigger");
  await trigger.hover();
  await expect(trigger).toHaveCSS(
    "transform",
    /matrix\(1\.015, 0, 0, 1\.015, 0, -1\)/,
  );
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger.locator("svg")).toHaveCSS(
    "transform",
    "matrix(-1, 0, 0, -1, 0, 0)",
  );
  await expect(
    page
      .locator(".status-dropdown-menu")
      .getByRole("option", { name: "Da ritirare", exact: true }),
  ).toHaveCount(0);
  await trigger.click();
  await page.getByLabel("Importo (€)", { exact: true }).fill("99");
  await page.getByLabel("Nome di chi ritira", { exact: true }).fill("Cliente");
  await page.getByRole("button", { name: /Registra incasso/ }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Da ritirare/);
  await expect(page.locator(".balance-card>strong")).toContainText("1,00");
  await page.reload();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Da ritirare/);
  await expect(page.getByLabel("Importo (€)", { exact: true })).toHaveValue(
    "1.00",
  );
  await page.locator(".detail-status .status-dropdown-trigger").click();
  await page.getByRole("option", { name: "Consegnato", exact: true }).click();
  const checkout = page.getByRole("dialog", { name: "Incassa e consegna" });
  await expect(checkout.getByLabel("Importo (€)", { exact: true })).toHaveValue(
    "1.00",
  );
  await checkout.getByRole("button", { name: /Incassa e consegna/ }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);
});
test("zero balance delivery uses the lightweight confirmation dialog", async ({
  page,
}) => {
  await fillOrder(page);
  await openPayment(page);
  await page
    .getByLabel("Incasso alla creazione (€)", { exact: true })
    .fill("100");
  await save(page);
  await state(page, "READY");
  await page.locator(".detail-status .status-dropdown-trigger").click();
  await page.getByRole("option", { name: "Consegnato", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Conferma consegna" });
  await expect(dialog.getByLabel("Importo (€)", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByLabel("Nome di chi ritira", { exact: true }),
  ).toHaveValue("Cliente Playwright");
  await dialog.getByRole("button", { name: "Conferma consegna" }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);
});
test("repair detail cards lock history and keep post-sale finance auditable", async ({
  page,
}) => {
  await fillOrder(page, { manual: true });
  await openPayment(page);
  await page
    .getByLabel("Incasso alla creazione (€)", { exact: true })
    .fill("75");
  await save(page);

  const details = page.getByTestId("details-card");
  const products = page.getByTestId("products-card");
  const quote = page.getByTestId("quote-card");
  const warranty = page.getByTestId("warranty-card");
  const productsTop = await products.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  const detailsEdit = details.getByRole("button", { name: "Modifica dati" });
  await page.mouse.move(0, 0);
  await expect(detailsEdit).toHaveCSS("opacity", "0");
  await details.hover();
  await expect(detailsEdit).toHaveCSS("opacity", "1");
  const customerLink = details.locator(".order-customer-link");
  await customerLink.hover();
  await expect(customerLink).toHaveCSS("transform", "none");
  await expect(customerLink.locator("svg")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 4, 0)",
  );
  await details.hover();
  await expect(details).toHaveCSS(
    "transform",
    /matrix\(1\.003, 0, 0, 1\.003, 0, -1\)/,
  );
  expect(
    await products.evaluate((element) => element.getBoundingClientRect().top),
  ).toBe(productsTop);

  const productControls = products.locator(
    ".order-product-form .business-combobox-control, .order-product-form > label > input:not([type='hidden']), .order-product-form .button",
  );
  const productBoxes = await productControls.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { bottom: box.bottom, height: box.height };
    }),
  );
  expect(new Set(productBoxes.map(({ bottom }) => bottom)).size).toBe(1);
  expect(new Set(productBoxes.map(({ height }) => height)).size).toBe(1);

  await details.getByRole("button", { name: "Modifica dati" }).click();
  await expect(details).toHaveClass(/is-editing/);
  await expect(
    details.getByRole("button", { name: "Dettagli" }),
  ).toBeDisabled();
  await details
    .getByLabel("Descrizione aggiuntiva")
    .fill("Fotocamera non funziona");
  await quote.hover();
  await quote.getByRole("button", { name: "Modifica dati" }).click();
  await expect(details).not.toHaveClass(/is-editing/);
  await expect(details).toContainText("Fotocamera non funziona");
  await expect(quote).toHaveClass(/is-editing/);
  await quote.getByRole("button", { name: "Annulla" }).click();

  await details.hover();
  await details.getByRole("button", { name: "Modifica dati" }).click();
  await details
    .getByLabel("Descrizione aggiuntiva")
    .fill("Fotocamera non funziona ancora");
  await details.getByRole("button", { name: "Salva" }).click();
  await expect(details).not.toHaveClass(/is-editing/);
  await expect(details).toContainText("Fotocamera non funziona ancora");

  await quote.getByRole("button", { name: "Preventivo" }).click();
  await expect(quote.locator(".quote-summary")).toBeHidden();
  await quote.getByRole("button", { name: "Preventivo" }).click();
  await expect(quote.locator(".quote-summary")).toBeVisible();
  await quote.getByRole("button", { name: "Modifica dati" }).click();
  await expect(
    quote.getByRole("button", { name: "Aggiungi intervento" }),
  ).toBeVisible();
  await quote.getByRole("button", { name: "Annulla" }).click();
  await warranty.hover();
  await warranty.getByRole("button", { name: "Modifica dati" }).click();
  await chooseBusinessOption(page, "Durata garanzia", "90 giorni", warranty);
  await warranty.getByLabel("Copertura").fill("Solo il componente sostituito");
  await warranty.getByRole("button", { name: "Salva" }).click();
  await expect(warranty).not.toHaveClass(/is-editing/);
  await expect(warranty).toContainText("90 giorni");

  await state(page, "READY");
  await page.getByLabel("Nome di chi ritira", { exact: true }).fill("Cliente");
  await page.getByRole("button", { name: /Conferma consegna/ }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);
  const firstDelivery = await details.getByText(/Ritirato da/).textContent();
  await expect(
    details.getByRole("button", { name: "Modifica dati" }),
  ).toHaveCount(0);
  await expect(
    quote.getByRole("button", { name: "Modifica dati" }),
  ).toHaveCount(0);
  await expect(page.locator(".order-product-form")).toHaveCount(0);
  await details.hover();
  await expect(details).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");

  await page
    .getByRole("button", { name: "Riparazione in garanzia", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Avvia una nuova lavorazione per il dispositivo",
  );
  await expect(dialog.locator(".warranty-progress-panel")).toContainText(
    "ancora in garanzia",
  );
  await expect(
    dialog.getByRole("combobox", { name: "Intervento", exact: true }),
  ).toHaveValue(/^Fotocamera/);
  await expect(
    dialog.getByRole("radio", { name: /Riparazione in garanzia/ }),
  ).toBeChecked();
  await expect(dialog.getByLabel("Costo aggiuntivo (€)")).toHaveAttribute(
    "readonly",
  );
  await expect(
    dialog.getByRole("button", { name: "Chiudi", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Annulla", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);

  await page
    .getByRole("button", { name: "Riparazione in garanzia", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);

  await page
    .getByRole("button", { name: "Riparazione in garanzia", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Riparazione a pagamento/ }).check();
  await dialog
    .getByLabel("Note post-vendita (facoltative)")
    .fill("Difetto ricomparso");
  await dialog.getByLabel("Costo aggiuntivo (€)").fill("50");
  await dialog
    .getByRole("button", { name: "Apri riparazione post-vendita", exact: true })
    .click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/In riparazione post-vendita/);
  await expect(page.locator(".balance-card>strong")).toContainText("50,00");
  await expect(page.getByTestId("history-card")).toContainText(
    "Riparazione post-vendita aperta",
  );
  await expect(page.getByTestId("history-card")).toContainText("Fotocamera");
  await expect(page.getByTestId("history-card")).toContainText(
    "Riparazione a pagamento · 50,00 €",
  );
  await expect(page.getByTestId("history-card")).toContainText(
    "Note post-vendita (facoltative): Difetto ricomparso",
  );
  await expect(
    details.getByRole("button", { name: "Modifica dati" }),
  ).toHaveCount(0);
  await page.getByLabel("Importo (€)", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Registra incasso" }).click();
  await expect(page.locator(".balance-card>strong")).toContainText("0,00");
  await state(page, "READY");
  await page
    .getByLabel("Nome di chi ritira", { exact: true })
    .fill("Altro nome");
  await page.getByRole("button", { name: /Conferma consegna/ }).click();
  await expect(details.getByText(/Ritirato da/)).toHaveText(
    firstDelivery ?? "",
  );

  await page.getByRole("button", { name: "Rimborso", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Motivo / note").fill("Cliente non soddisfatto");
  await dialog
    .getByRole("button", { name: "Conferma rimborso totale", exact: true })
    .click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Rimborsato/);
  await expect(page.locator(".balance-card>strong")).toContainText("0,00");
  await expect(page.locator(".balance-card")).toContainText("Totale: 0,00 €");
  await expect(page.locator(".balance-card")).toContainText(
    "Incassato: 0,00 €",
  );
  await expect(page.locator(".balance-card")).toContainText(
    "Riparazione: 0,00 €",
  );
  await expect(page.locator(".payments-card")).toContainText("-125,00");
  await expect(page.getByTestId("history-card")).toContainText(
    "Rimborso 125,00",
  );
  await expect(page.getByText("Rimborsato · contenuti bloccati")).toBeVisible();

  const refundedCode = await page.locator("h1").textContent();
  await page.goto("/orders");
  const refundedRow = page
    .locator("tbody tr")
    .filter({ hasText: refundedCode ?? "" });
  await refundedRow.click();
  await expect(
    refundedRow.getByLabel("Consegna prevista", { exact: true }),
  ).toHaveCount(0);
  await expect(
    refundedRow.getByLabel("Incassato", { exact: true }),
  ).toHaveCount(0);
  await expect(refundedRow.locator(".order-payment-values")).toContainText(
    "Totale0,00 €",
  );
  await expect(refundedRow.locator(".order-payment-values")).toContainText(
    "Incassato0,00 €",
  );
  await expect(refundedRow.locator(".order-payment-values")).toContainText(
    "Da pagare0,00 €",
  );
});
test("price editor and mobile yellow layout support both languages", async ({
  page,
}) => {
  await page.goto("/prices");
  await page
    .getByRole("button", { name: "Nuova regola", exact: true })
    .first()
    .click();
  const form = page.getByRole("dialog");
  await enterBusinessValue(page, "Intervento", `pulizia ${Date.now()}`, form);
  await form.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("15");
  await form.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole("main").getByRole("status")).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Oggi in laboratorio", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今日工作台" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page.goto("/orders/new");
  await expect(
    page.getByRole("heading", { name: "新建维修单", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-new-order.png",
    fullPage: true,
  });
});

test("creates a customer and selects it without another search", async ({
  page,
}) => {
  const phone = "336" + Date.now().toString().slice(-7);
  await page.goto("/orders/new");
  await page
    .getByRole("combobox", { name: "Cerca cliente", exact: true })
    .fill(phone);
  await page
    .getByRole("button", { name: "Nuovo cliente", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await dialog.getByLabel(/Nome e cognome/).fill("Tre telefoni");
  await dialog.getByLabel(/Telefono/).fill(phone);
  await dialog
    .getByRole("button", { name: "Salva cliente", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".selected-customer-summary")).toContainText(
    "Tre telefoni",
  );
  await expect(page.locator(".selected-customer-summary")).toContainText(
    "+39" + phone,
  );
});

test("searchable combobox keeps search, create and chevron as independent controls", async ({
  page,
}) => {
  await page.goto("/orders/new");
  const customer = page.getByRole("combobox", {
    name: "Cerca cliente",
    exact: true,
  });
  const createCustomer = page.getByRole("button", {
    name: "Nuovo cliente",
    exact: true,
  });
  const customerControl = customer.locator(
    "xpath=ancestor::*[contains(@class, 'business-combobox-control')]",
  );
  const expand = customerControl.getByRole("button", {
    name: "Apri opzioni",
    exact: true,
  });

  await expect(customer).toBeVisible();
  await expect(createCustomer).toBeVisible();
  await expect(createCustomer).toBeDisabled();
  await expand.click();
  await expect(customer).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator(".business-select-panel.is-entering").getByRole("option"),
  ).not.toHaveCount(0);
  await customerControl.locator(".business-combobox-chevron").click();
  await expect(customer).toHaveAttribute("aria-expanded", "false");

  await customer.fill("Cliente");
  await expect(createCustomer).toBeDisabled();

  await customer.fill("cliente-in-trovabile");
  const panel = page.locator(".business-select-panel.is-entering");
  await expect(panel).toContainText("Nessun cliente corrispondente");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expect(createCustomer).toBeEnabled();
  await createCustomer.click();
  const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await expect(dialog.getByLabel(/Nome e cognome/)).toHaveValue(
    "cliente-in-trovabile",
  );
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();

  await openStep(page, 1);
  const brand = page.getByRole("combobox", { name: "Marca", exact: true });
  const brandControl = brand.locator(
    "xpath=ancestor::*[contains(@class, 'business-combobox-control')]",
  );
  await brandControl.locator(".business-combobox-chevron").click();
  await page
    .locator(".business-select-panel.is-entering")
    .getByRole("option", { name: "Apple", exact: true })
    .click();
  await expect(brand).toHaveValue("Apple");
  const model = page.getByRole("combobox", { name: "Modello", exact: true });
  await model.fill("13");
  await page
    .locator(".business-select-panel.is-entering")
    .getByRole("option", { name: "iPhone 13", exact: true })
    .click();
  await expect(model).toHaveValue("iPhone 13");
  await brandControl
    .getByRole("button", { name: "Cancella selezione", exact: true })
    .click();
  await expect(brand).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Modello", exact: true }),
  ).toBeDisabled();
});

test("a unique normalized customer device is reused and stops matching after edits", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await chooseBusinessOption(page, "Cerca cliente", "Cliente Playwright");
  await chooseBusinessOption(page, "Marca", "Apple");
  const model = page.getByRole("combobox", { name: "Modello", exact: true });
  await model.fill("iphone-13");
  await page
    .getByRole("button", { name: "Modello personalizzato", exact: true })
    .click();
  await expect(model).toHaveValue("iPhone 13");
  const customerDevice = page.getByRole("button", {
    name: "Dispositivo del cliente",
    exact: true,
  });
  await expect(customerDevice).toContainText("Apple iPhone 13");
  await expect(model).toBeEnabled();

  await model.fill("modello non registrato");
  await page
    .getByRole("button", { name: "Modello personalizzato", exact: true })
    .click();
  await expect(customerDevice).toContainText("Nuovo dispositivo");
});

test("native quote choices populate prices, clear on model changes and discounts are optional", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await openStep(page, 1);
  const deviceType = page.getByRole("button", {
    name: "Tipo dispositivo",
    exact: true,
  });
  await expect(async () => {
    await chooseBusinessOption(page, "Tipo dispositivo", "Tablet");
    await expect(deviceType).toContainText("Tablet");
  }).toPass();
  await chooseBusinessOption(page, "Marca", "Apple");
  await page
    .getByRole("combobox", { name: "Modello", exact: true })
    .fill("iPad");
  await expect(page.getByRole("option", { name: /^iPad/ })).not.toHaveCount(0);
  await expect(
    page.getByRole("option", { name: "iPhone 13", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await chooseBusinessOption(page, "Tipo dispositivo", "Telefono");
  await expect(deviceType).toContainText("Telefono");
  await chooseBusinessOption(page, "Marca", "Apple");
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await openStep(page, 2);
  const projectSearch = page.getByRole("combobox", {
    name: "Intervento 1",
    exact: true,
  });
  const projectPrice = page.getByLabel("Prezzo originale (€) 1", {
    exact: true,
  });
  const createProject = page.getByRole("button", {
    name: "Intervento personalizzato",
    exact: true,
  });
  await expect(projectPrice).toBeDisabled();
  await expect(createProject).toBeDisabled();
  const projectControl = projectSearch.locator(
    "xpath=ancestor::*[contains(@class, 'business-combobox-control')]",
  );
  await projectControl.locator(".business-combobox-chevron").click();
  const projectPanel = page.locator(".business-select-panel.is-entering");
  await expect(
    projectPanel.getByRole("option", {
      name: /sostituzione display.*100,00 €/,
    }),
  ).toBeVisible();
  await projectControl.locator(".business-combobox-chevron").click();
  await projectSearch.fill("sostituzione");
  await expect(projectPrice).toBeEnabled();
  await expect(createProject).toBeDisabled();
  await chooseBusinessOption(page, "Intervento 1", "sostituzione display");
  await expect(
    page.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveValue("100");
  await expect(projectPrice).toBeEnabled();
  await expect(
    page.getByLabel("Sconto intervento (€) 1", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Sconto aggiuntivo sulla scheda (€)", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Aggiungi sconto intervento", exact: true })
    .click();
  await page.getByLabel("Sconto intervento (€) 1", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Rimuovi sconto", exact: true })
    .click();
  await expect(
    page.getByLabel("Sconto intervento (€) 1", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".price-breakdown")).toContainText("100,00");
  await openStep(page, 1);
  await enterBusinessValue(page, "Modello", "Unknown model");
  await openStep(page, 2);
  await expect(
    page.getByRole("combobox", { name: "Intervento 1", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveValue("");
  await projectControl.locator(".business-combobox-chevron").click();
  await expect(
    page.locator(".business-select-panel.is-entering"),
  ).toContainText("Nessun intervento disponibile per questo dispositivo");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Altri dettagli (facoltativi)", { exact: true }),
  ).toHaveCount(0);
  await openStep(page, 1);
  await enterBusinessValue(page, "Modello", "iphone18promax");
  await expect(
    page.getByRole("combobox", { name: "Modello", exact: true }),
  ).toHaveValue("iPhone 18 Pro Max");
});

test("creates a repair part from the quote and selects it immediately", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await openStep(page, 1);
  await chooseBusinessOption(page, "Marca", "Apple");
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await openStep(page, 2);
  await chooseBusinessOption(page, "Intervento 1", "sostituzione display");

  const partSearch = page.getByRole("combobox", {
    name: "Ricambio richiesto 1",
    exact: true,
  });
  const newPart = page.getByRole("button", { name: "Nuovo ricambio" });
  await expect(newPart).toBeDisabled();
  const productName = `Ricambio E2E ${Date.now()}`;
  await partSearch.fill(productName);
  await expect(newPart).toBeEnabled();
  await newPart.click();
  const dialog = page.getByRole("dialog", { name: "Nuovo ricambio" });
  await expect(dialog.getByLabel("Prodotto", { exact: true })).toHaveValue(
    productName,
  );
  await chooseBusinessOption(page, "Categoria", "Ricambi", dialog);
  await expect(
    dialog.getByRole("button", { name: "Utilizzo", exact: true }),
  ).toContainText("Riparazione");
  await dialog.getByLabel("Costo", { exact: true }).fill("12");
  await dialog.getByLabel("Scorta iniziale", { exact: true }).fill("0");
  await dialog.getByLabel("Scorta minima", { exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Salva prodotto" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".selected-part-summary")).toContainText(
    productName,
  );
  await expect(
    page.getByText(
      "Il ricambio selezionato non è sufficiente: dopo la creazione la scheda passerà automaticamente a «Ricambio mancante».",
      { exact: true },
    ),
  ).toBeVisible();
});

test("changing a selected repair part focuses its current name and preserves it on cancel", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await openStep(page, 1);
  await chooseBusinessOption(page, "Marca", "Apple");
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await page.getByLabel("Display rotto", { exact: true }).check();
  await page
    .getByLabel("Consegna prevista", { exact: true })
    .fill("2099-12-31");
  await chooseBusinessOption(page, "Intervento 1", "sostituzione display");
  await chooseBusinessOption(page, "Ricambio richiesto 1", "Batteria Test");
  const summary = page.locator(".selected-part-summary");
  await expect(summary).toContainText("Batteria Test");
  await summary.getByRole("button", { name: "Cambia", exact: true }).click();
  const search = page.getByRole("combobox", {
    name: "Ricambio richiesto 1",
    exact: true,
  });
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Batteria Test");
  expect(
    await search.evaluate(
      (input) =>
        (input as HTMLInputElement).selectionStart === 0 &&
        (input as HTMLInputElement).selectionEnd ===
          (input as HTMLInputElement).value.length,
    ),
  ).toBe(true);
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("Escape");
  await expect(summary).toContainText("Batteria Test");
});

test("clears a repair item and creates a custom item with Enter without submitting the order", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await chooseBusinessOption(page, "Cerca cliente", "Cliente Playwright");
  await openStep(page, 1);
  await chooseBusinessOption(
    page,
    "Dispositivo del cliente",
    "Apple iPhone 13",
  );
  await page.getByLabel("Display rotto", { exact: true }).check();
  await page
    .getByLabel("Consegna prevista", { exact: true })
    .fill("2099-12-31");
  await openStep(page, 2);

  const name = `Intervento diretto ${Date.now()}`;
  const search = page.getByRole("combobox", {
    name: "Intervento 1",
    exact: true,
  });
  const price = page.getByLabel("Prezzo originale (€) 1", { exact: true });
  const create = page.getByRole("button", {
    name: "Intervento personalizzato",
    exact: true,
  });
  await chooseBusinessOption(page, "Intervento 1", "sostituzione display");
  await expect(price).toHaveValue("100");
  await page.getByRole("button", { name: "Cancella selezione" }).click();
  await expect(search).toHaveValue("");
  await expect(price).toHaveValue("");
  await expect(price).toBeDisabled();

  await search.fill(name);
  await expect(price).toBeEnabled();
  await expect(create).toBeDisabled();
  await search.press("Enter");
  await expect(search).toHaveValue(name);
  await expect(price).toBeFocused();
  await expect(page.locator(".order-step-card").nth(2)).not.toHaveClass(
    /is-completed/,
  );
  await price.fill("85");

  await expect(search).toHaveValue(name);
  await expect(price).toHaveValue("85");
  await expect(create).toBeEnabled();
  await price.press("Enter");
  await expect(create).toBeDisabled();
  await expect(page.locator(".order-step-card").nth(2)).toHaveClass(
    /is-completed/,
  );
  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.locator(".business-select-panel.is-entering")).toHaveCount(
    0,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await chooseBusinessOption(page, "Ricambio richiesto 1", "Batteria Test");
  await save(page);
  await page.goto("/prices");
  await page.getByLabel("Cerca", { exact: true }).fill(name);
  const rule = page.locator(".price-rule-row").filter({ hasText: name });
  await expect(rule).toHaveCount(1);
  await rule.hover();
  await rule.getByRole("button", { name: "Modifica preventivo" }).click();
  const editDialog = page.getByRole("dialog", { name: "Modifica preventivo" });
  await expect(
    editDialog.getByRole("combobox", {
      name: "Ricambio richiesto",
      exact: true,
    }),
  ).toHaveValue("Batteria Test");
});

test("customer list searches instantly, preserves navigation and supports compact editing", async ({
  page,
}) => {
  const phone = "336" + Date.now().toString().slice(-7);
  const extra = "337" + Date.now().toString().slice(-7);
  const name =
    "Cliente interfaccia molto lungo per verifica della disposizione";
  await fillOrder(page, { phone, name });
  await save(page);
  await page.goto("/customers");
  await page.getByLabel("Cerca", { exact: true }).fill(phone);
  const row = page.locator(".customer-table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(name);
  await expect(page).toHaveURL(new RegExp("q=" + phone + "$"));
  await row.getByRole("link", { name, exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Torna ai clienti" }),
  ).toHaveAttribute("href", "/customers?q=" + phone);
  await expect(page.locator('main input:not([type="date"])')).toHaveCount(0);
  await expect(page.locator(".customer-device-row")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Storico riparazioni" }),
  ).toBeVisible();
  await page.locator(".customer-summary").hover();
  await page
    .getByRole("button", { name: "Modifica cliente", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Telefono", { exact: true }).fill("bad");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Telefono", { exact: true }).fill(phone);
  await dialog
    .getByRole("button", { name: "Aggiungi telefono", exact: true })
    .click();
  await dialog.getByLabel("Telefono 2", { exact: true }).fill(extra);
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".customer-summary .customer-phone")).toHaveCount(
    2,
  );
  const firstPhone = page.locator(".customer-summary .customer-phone").first();
  const storedPhone = await firstPhone.locator("a").innerText();
  await expect(firstPhone.locator("a")).toHaveAttribute(
    "href",
    "tel:" + storedPhone,
  );
  await expect(firstPhone.getByRole("button")).toHaveCount(0);
  await page.locator(".customer-device-row").hover();
  await page
    .getByRole("button", { name: "Modifica dispositivo", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await enterBusinessValue(page, "Modello", "Unsaved model", dialog);
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.locator(".customer-device-row")).not.toContainText(
    "Unsaved model",
  );
  await expect(
    page.getByRole("button", { name: "Modifica dispositivo", exact: true }),
  ).toBeFocused();
  await page.locator(".customer-device-row").hover();
  await page
    .getByRole("button", { name: "Modifica dispositivo", exact: true })
    .click();
  await dialog
    .getByLabel("IMEI (facoltativo)", { exact: true })
    .fill("123456789012345");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".customer-device-row")).toContainText(
    "123456789012345",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/customer-detail-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Torna ai clienti" }).click();
  await expect(page.getByLabel("Cerca", { exact: true })).toHaveValue(phone);
  await expect(row).toHaveCount(1);
  await page.getByLabel("Cerca", { exact: true }).fill(extra);
  await expect(row).toHaveCount(1);
  await expect(row.locator(".customer-phone")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/customer-list-mobile.png",
    fullPage: true,
  });
  await row.hover();
  await row
    .getByRole("button", { name: "Modifica cliente", exact: true })
    .click();
  await dialog
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Discard this change");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(row).toContainText(name);
  await expect(
    row.getByRole("button", { name: "Modifica cliente", exact: true }),
  ).toBeFocused();
  await page.getByLabel("Cerca", { exact: true }).fill("no matching customer");
  await expect(
    page.getByText("Nessun cliente corrispondente", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancella ricerca", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Cerca", { exact: true })).toHaveValue("");
  await page.getByLabel("Cerca", { exact: true }).fill(extra);
  await page.reload();
  await expect(page.getByLabel("Cerca", { exact: true })).toHaveValue(extra);
  await expect(row).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.screenshot({
    path: "test-results/customer-list-desktop.png",
    fullPage: true,
  });
  await row.getByRole("link", { name, exact: true }).click();
  const device = page.locator(".customer-device-row");
  page.once("dialog", (dialog) => dialog.accept());
  await device.hover();
  await device
    .getByRole("button", { name: "Elimina dispositivo", exact: true })
    .click();
  await expect(device).toHaveCount(0);
  await expect(
    page.getByText("Nessun dispositivo registrato", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".table-panel tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: "Torna ai clienti" }).click();
  await expect(row.locator(".customer-device-count")).toContainText("0");
  page.once("dialog", (dialog) => dialog.dismiss());
  await row.hover();
  await row
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  await expect(row).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await row.hover();
  await row
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await expect(page.getByLabel("Cerca", { exact: true })).toHaveValue(extra);
});

test("customer page adds, edits and deletes a customer", async ({ page }) => {
  const phone = "339" + Date.now().toString().slice(-7);
  await page.goto("/customers");
  await page
    .getByRole("button", { name: "Nuovo cliente", exact: true })
    .click();
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Da modificare");
  await page.getByLabel("Telefono", { exact: true }).fill(phone);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL(/customers$/);
  await page.getByRole("link", { name: "Da modificare", exact: true }).click();
  await expect(page).toHaveURL(/\/customers\/[^/]+$/);
  const summary = page.locator(".customer-summary");
  await summary.hover();
  await summary
    .getByRole("button", { name: "Modifica cliente", exact: true })
    .click();
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Cliente modificato");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Cliente modificato");
  page.once("dialog", (d) => d.accept());
  await summary.hover();
  await summary
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  await expect(page).toHaveURL(/customers$/);
  await expect(
    page.getByRole("link", { name: "Cliente modificato", exact: true }),
  ).toHaveCount(0);
});
test("customer dialog keeps filters and inputs on errors and allows deleted numbers again", async ({
  page,
}) => {
  const phone = "335" + Date.now().toString().slice(-7);
  await page.goto("/customers?q=ModalCustomer");
  const open = () =>
    page.getByRole("button", { name: "Nuovo cliente", exact: true }).click();
  await open();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome e cognome", { exact: true })
    .fill("ModalCustomer");
  await dialog.getByLabel("Telefono", { exact: true }).fill("bad");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByLabel("Nome e cognome", { exact: true }),
  ).toHaveValue("ModalCustomer");
  await dialog.getByLabel("Telefono", { exact: true }).fill(phone);
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/customers\?q=ModalCustomer$/);
  await page.getByRole("link", { name: "ModalCustomer", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator(".customer-summary").hover();
  await page
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  await expect(page).toHaveURL(/customers\?q=ModalCustomer$/);
  await open();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome e cognome", { exact: true })
    .fill("ModalCustomer");
  await dialog.getByLabel("Telefono", { exact: true }).fill(phone);
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "ModalCustomer", exact: true }),
  ).toBeVisible();
  await open();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Annulla", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nuovo cliente", exact: true }),
  ).toBeFocused();
});

test("quote tree supports contextual dialogs, search, editing and empty branch removal", async ({
  page,
}) => {
  await page.goto("/prices");
  await page
    .getByRole("button", { name: "Nuova regola", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await chooseBusinessOption(page, "Tipo dispositivo", "Smartwatch", dialog);
  await chooseBusinessOption(page, "Marca", "Apple", dialog);
  await enterBusinessValue(page, "Modello", "Watch Modal", dialog);
  await enterBusinessValue(page, "Intervento", "Test battery", dialog);
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("bad");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Modello", exact: true }),
  ).toHaveValue("Watch Modal");
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("40");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/prices$/);
  const model = page
    .locator("section.price-tree-level")
    .filter({ has: page.locator(".price-toggle", { hasText: "Watch Modal" }) })
    .last();
  await expect(model.locator("article")).toBeVisible();
  await model.getByRole("button", { name: "Intervento", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Tipo dispositivo", exact: true }),
  ).toContainText("Smartwatch");
  await expect(
    dialog.getByRole("combobox", { name: "Marca", exact: true }),
  ).toHaveValue("Apple");
  await expect(
    dialog.getByRole("combobox", { name: "Modello", exact: true }),
  ).toHaveValue("Watch Modal");
  await enterBusinessValue(page, "Intervento", "Test screen", dialog);
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("70");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(model.locator("article")).toHaveCount(2);
  await page.getByLabel("Cerca", { exact: true }).fill("Test battery");
  await expect(page.locator(".rule-list > article")).toHaveCount(1);
  const directPrice = page.locator(".price-rule-row").first();
  await directPrice.locator("button.inline-rule-suggested").click();
  await directPrice.locator("input.inline-rule-suggested").fill("45");
  await directPrice.locator("input.inline-rule-suggested").press("Enter");
  await expect(
    directPrice.locator("button.inline-rule-suggested"),
  ).toContainText("45,00");
  await expect(page.getByLabel("Cerca", { exact: true })).toHaveValue(
    "Test battery",
  );
  await page.getByLabel("Cerca", { exact: true }).fill("Watch Modal");
  await page
    .getByRole("button", { name: "Gestisci selezione", exact: true })
    .click();
  await page.getByLabel("Seleziona tutti", { exact: true }).check();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: /Elimina preventivi selezionati/ })
    .click();
  await expect(page.locator(".rule-list > article")).toHaveCount(0);
  await page.getByLabel("Cerca", { exact: true }).fill("");
  await expect(
    page.locator(".price-toggle", { hasText: "Watch Modal" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Nuova regola", exact: true })
    .first()
    .click();
  await chooseBusinessOption(
    page,
    "Tipo dispositivo",
    "Smartband",
    page.getByRole("dialog"),
  );
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-quote-dialog.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("hides managed faults without changing historical records", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await openStep(page, 1);
  await expect(
    page.getByRole("button", { name: "Gestisci problemi", exact: true }),
  ).toHaveCount(0);
  await chooseBusinessOption(page, "Marca", "Apple");
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await page
    .getByRole("button", { name: "Gestisci problemi", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Gestisci problemi" });
  await expect(dialog).toContainText(
    "Problemi frequenti per nuove schede · Telefono",
  );
  await expect(dialog.locator(".fault-manager-header")).toContainText(
    "Nome problema",
  );
  await expect(dialog.locator(".fault-manager-header")).toContainText("Stato");
  await expect(dialog.locator(".fault-manager-header")).not.toContainText(
    "Azioni",
  );
  const sharedColumns = await dialog.evaluate(() => {
    const header = document.querySelector(".fault-manager-header");
    const row = document.querySelector(".fault-manager-row");
    return [header, row].map(
      (element) => getComputedStyle(element!).gridTemplateColumns,
    );
  });
  expect(sharedColumns[0]).toBe(sharedColumns[1]);
  await expect(dialog.locator(".fault-drag-hint")).toBeVisible();
  const faultSearch = dialog.locator(".fault-search");
  const addFault = dialog.getByRole("button", {
    name: "Aggiungi problema",
    exact: true,
  });
  const aligned = await Promise.all([
    faultSearch.boundingBox(),
    addFault.boundingBox(),
  ]);
  expect(
    Math.abs((aligned[0]?.height ?? 0) - (aligned[1]?.height ?? 0)),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs((aligned[0]?.y ?? 0) - (aligned[1]?.y ?? 0)),
  ).toBeLessThanOrEqual(2);
  let row = dialog.locator(".fault-manager-row").filter({
    hasText: "Display rotto",
  });
  expect(
    await row.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(52);
  expect(
    await row.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(56);
  const centers = await row.evaluate((element) =>
    [
      element.querySelector(".fault-drag-handle"),
      element.querySelector(".fault-name-button"),
      element.querySelector(".fault-enabled-switch"),
      element.querySelector(".fault-delete-button"),
    ].map((node) => {
      const box = node!.getBoundingClientRect();
      return box.top + box.height / 2;
    }),
  );
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  const statusCenters = await dialog.evaluate(() => {
    const header = document
      .querySelector(".fault-manager-header .fault-manager-status")!
      .getBoundingClientRect();
    const status = document
      .querySelector(".fault-manager-row .fault-enabled-switch")!
      .getBoundingClientRect();
    return [header.left + header.width / 2, status.left + status.width / 2];
  });
  expect(Math.abs(statusCenters[0] - statusCenters[1])).toBeLessThanOrEqual(1);
  await expect(row.locator(".fault-enabled-switch")).toHaveCSS("gap", "8px");
  await expect(row.locator(".fault-delete-button")).toHaveCSS("opacity", "0");
  await row.hover();
  await expect(row.locator(".fault-delete-button")).toHaveCSS("opacity", "1");

  await row.locator(".fault-name-button").dblclick();
  const inlineName = dialog.locator(".fault-inline-name");
  await inlineName.fill("Display rotto test");
  await inlineName.press("Escape");
  await expect(row.locator(".fault-name-button")).toHaveText("Display rotto");

  await row.locator(".fault-enabled-switch input").uncheck();
  const closeManager = dialog.locator(".dialog-actions button");
  await expect(closeManager).toBeEnabled();
  await closeManager.click();
  await page
    .getByRole("button", { name: "Gestisci problemi", exact: true })
    .click();
  row = page
    .getByRole("dialog", { name: "Gestisci problemi" })
    .locator(".fault-manager-row")
    .filter({ hasText: "Display rotto" });
  await expect(row.locator(".fault-enabled-switch input")).not.toBeChecked();
  const createdName = `Problema inline ${Date.now()}`;
  const searchInput = dialog.locator(".fault-search input");
  await expect(dialog.locator(".fault-manager")).toHaveCSS(
    "overflow-y",
    "visible",
  );
  await expect(faultSearch).toHaveCSS("flex-direction", "row");
  const searchLayout = await faultSearch.evaluate((element) => {
    const wrapper = element.getBoundingClientRect();
    const icon = element.querySelector("svg")!.getBoundingClientRect();
    const input = element.querySelector("input")!.getBoundingClientRect();
    return {
      iconInside:
        icon.top >= wrapper.top + 1 && icon.bottom <= wrapper.bottom - 1,
      inputInside:
        input.top >= wrapper.top + 1 && input.bottom <= wrapper.bottom - 1,
    };
  });
  expect(searchLayout).toEqual({ iconInside: true, inputInside: true });
  for (const state of ["default", "hover", "focus"] as const) {
    if (state === "hover") await faultSearch.hover();
    if (state === "focus") await searchInput.focus();
    const borders = await faultSearch.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ];
    });
    expect(borders).toEqual(["1px", "1px", "1px", "1px"]);
  }
  await searchInput.fill(createdName);
  await expect(addFault).toBeEnabled();
  await addFault.click();
  await expect(searchInput).toHaveValue("");
  const createdRow = dialog.locator(".fault-manager-row").filter({
    hasText: createdName,
  });
  await expect(createdRow).toBeVisible();
  await createdRow.locator(".fault-name-button").dblclick();
  const createdInlineName = dialog.locator(".fault-inline-name");
  await createdInlineName.fill(`${createdName} modificato`);
  await createdInlineName.press("Enter");
  await expect(
    dialog.locator(".fault-manager-row").filter({
      hasText: `${createdName} modificato`,
    }),
  ).toBeVisible();
  await dialog.locator(".dialog-actions button").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Display rotto", { exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await openStep(page, 1);
  await chooseBusinessOption(page, "Marca", "Apple");
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await expect(page.getByLabel("Display rotto", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Gestisci problemi", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Gestisci problemi" })
      .locator(".fault-manager-row")
      .filter({ hasText: "Display rotto" }),
  ).toContainText("Disattivato");
});

test("compact price rows support direct icon actions and selection on mobile", async ({
  page,
}) => {
  await page.goto("/prices");
  await page.getByLabel("Cerca", { exact: true }).fill("iPhone 13");
  const rows = page.locator(".price-rule-row");
  const row = rows.first();
  await expect(row).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Elimina preventivo", exact: true }),
  ).toHaveCount(1);
  await expect(row.locator(".price-row-delete")).toHaveCSS("opacity", "0");
  await row.hover();
  await expect(row.locator(".price-row-delete")).toHaveCSS("opacity", "1");
  await expect(
    page.getByRole("button", { name: "Nuova regola", exact: true }),
  ).toHaveCount(1);
  const longName =
    "Sostituzione componente con descrizione molto lunga per verifica mobile";
  await row.locator("button.inline-rule-project").click();
  await row.locator("input.inline-rule-project").fill(longName);
  await row.locator("input.inline-rule-project").press("Enter");
  const changed = rows.filter({ hasText: longName });
  await expect(changed.locator("button.inline-rule-project")).toHaveCount(1);
  await changed.locator("button.inline-rule-suggested").click();
  await changed.locator("input.inline-rule-suggested").fill("123.45");
  await changed.locator("input.inline-rule-suggested").press("Enter");
  await expect(page.getByLabel("Cerca", { exact: true })).toHaveValue(
    "iPhone 13",
  );
  await expect(changed.locator("button.inline-rule-suggested")).toContainText(
    "123,45",
  );
  await expect(
    changed.getByRole("button", { name: "Elimina preventivo", exact: true }),
  ).toBeVisible();
  await expect(
    changed.getByRole("button", { name: /^Altre azioni/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gestisci selezione", exact: true })
    .click();
  await changed.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: /Elimina preventivi selezionati/ }),
  ).toContainText("(1)");
  await page
    .getByRole("button", { name: "Fine selezione", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await changed.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(changed.locator("button.inline-rule-project")).toBeInViewport();
  await page.screenshot({
    path: "test-results/compact-prices-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Gestisci selezione", exact: true })
    .click();
  await expect(changed.getByRole("checkbox")).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Seleziona tutti", { exact: true }).check();
  await page.getByLabel("Cerca", { exact: true }).fill("no-such-project");
  await expect(
    page.getByRole("button", { name: /Elimina preventivi selezionati/ }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Seleziona tutti", { exact: true }),
  ).not.toBeChecked();
});

test("price editor supports individual and batch deletion", async ({
  page,
}) => {
  await page.goto("/prices");
  await page.getByRole("button", { name: "Apple", exact: true }).click();
  await page.getByRole("button", { name: "Telefono", exact: true }).click();
  await page.getByRole("button", { name: "iPhone 13", exact: true }).click();
  await page.getByRole("button", { name: "Intervento", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await enterBusinessValue(page, "Intervento", "Da eliminare", dialog);
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("25");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  const removable = page
    .locator(".price-rule-row")
    .filter({ hasText: "Da eliminare" });
  await expect(removable).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await removable.hover();
  await removable
    .getByRole("button", { name: "Elimina preventivo", exact: true })
    .click();
  await expect(removable).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gestisci selezione", exact: true })
    .click();
  await page.getByLabel("Seleziona tutti", { exact: true }).check();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: /Elimina preventivi selezionati/ })
    .click();
  await expect(page.locator(".rule-list > article")).toHaveCount(0);
});

test("settings exports data and re-import skips existing records", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.evaluate(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    }),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta dati", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^ngt-backup-.*\.json$/);
  const exported = await page.request.get("/api/data/export");
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-disposition"]).toContain("ngt-backup-");
  const backup = await exported.json();
  expect(backup).toMatchObject({
    format: "ngt-repair-data",
    version: 6,
  });
  const imported = await page.request.post("/api/data/import", {
    data: backup,
  });
  expect(imported.ok()).toBe(true);
  const result = await imported.json();
  expect(result.imported).toBe(0);
  expect(result.skipped).toBeGreaterThan(0);
});

for (const width of [1280, 390]) {
  test(`creation buttons and dialog actions stay consistent at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const [path, name] of [
      ["/customers", "Nuovo cliente"],
      ["/prices", "Nuova regola"],
    ]) {
      await page.goto(path);
      const trigger = page
        .locator(".page-header")
        .getByRole("button", { name, exact: true });
      await expect(trigger).toBeVisible();
      if (width === 1280) {
        const heading = await page.locator("h1").boundingBox();
        const button = await trigger.boundingBox();
        expect(button!.x).toBeGreaterThan(heading!.x + heading!.width);
      }
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(":focus")).toHaveCount(1);
      const cancel = dialog.getByRole("button", {
        name: "Annulla",
        exact: true,
      });
      const saveButton = dialog.getByRole("button", {
        name: "Salva",
        exact: true,
      });
      await saveButton.scrollIntoViewIfNeeded();
      const cancelBox = await cancel.boundingBox();
      const saveBox = await saveButton.boundingBox();
      const footer = await dialog.locator(".dialog-actions").boundingBox();
      const lastInput = await dialog.locator("input").last().boundingBox();
      expect(cancelBox!.x + cancelBox!.width).toBeLessThan(saveBox!.x);
      expect(Math.abs(cancelBox!.y - saveBox!.y)).toBeLessThan(2);
      expect(
        Math.abs(saveBox!.x + saveBox!.width - footer!.x - footer!.width),
      ).toBeLessThan(2);
      expect(saveBox!.y).toBeGreaterThan(lastInput!.y + lastInput!.height);
      expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/creation-${path.slice(1)}-${width}.png`,
      });
      await cancel.click();
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
  });
}

test("shared action affordances, price search and delivery date limit", async ({
  page,
}) => {
  await page.goto("/prices");
  const search = page.getByRole("searchbox", { name: "Cerca", exact: true });
  await expect(search).toHaveAttribute(
    "placeholder",
    "Cerca marca, modello o intervento",
  );
  await expect(page.locator(".filters").filter({ has: search })).toBeVisible();
  await page.goto("/orders/new");
  await openStep(page, 1);
  await chooseBusinessOption(page, "Marca", "Apple");
  await chooseBusinessOption(page, "Modello", "iPhone 13");
  await page.locator(".fault-choice input").first().check();
  const date = page.locator('input[name="dueDate"]');
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await expect(date).toHaveAttribute("min", today);
  await date.fill("2000-01-01");
  expect(
    await date.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow),
  ).toBe(true);
  await date.fill(today);
  expect(await date.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(
    true,
  );
  await page.goto("/customers");
  await page.locator(".customer-table .order-link").first().click();
  const back = page.locator(".customer-back");
  await expect(back).toHaveClass(/button-outline/);
  await expect(back).toHaveCSS("border-top-style", "solid");
  await expect(back).toHaveCSS("display", "inline-flex");
});

test("customer batch deletion keeps selection scoped and confirms the count", async ({
  page,
}) => {
  const prefix = "Batch-" + Date.now();
  for (let i = 0; i < 2; i++) {
    await page.goto("/customers");
    await page
      .getByRole("button", { name: "Nuovo cliente", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Nome e cognome", { exact: true })
      .fill(prefix + "-" + i);
    await dialog
      .getByLabel("Telefono", { exact: true })
      .fill("334" + String(Date.now()).slice(-6) + i);
    await dialog.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  const search = page.getByLabel("Cerca", { exact: true });
  await search.fill(prefix);
  await expect(page.locator(".customer-table tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Elimina clienti selezionati" }),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gestisci selezione", exact: true })
    .click();
  await page.getByLabel("Seleziona tutti", { exact: true }).check();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("2 clienti");
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Elimina clienti selezionati" })
    .click();
  await expect(page.locator(".customer-table tbody tr")).toHaveCount(2);
  await search.fill(prefix + "-0");
  await expect(
    page.getByRole("button", { name: "Elimina clienti selezionati" }),
  ).toBeDisabled();
  await search.fill(prefix);
  await page.getByLabel("Seleziona tutti", { exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/customer-batch-mobile.png",
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Elimina clienti selezionati" })
    .click();
  await expect(page.locator(".customer-table tbody tr")).toHaveCount(0);
  await expect(search).toHaveValue(prefix);
});

test("customer detail removes duplicate actions and supports keyboard icon editing", async ({
  page,
}) => {
  await page.goto("/customers");
  await page.locator(".customer-name .order-link").first().click();
  await expect(page.locator(".customer-summary h1")).toBeVisible();
  await expect(
    page.locator(".eyebrow").filter({ hasText: "Area di lavoro" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Cliente", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".table-action")).toHaveCount(0);
  const edit = page
    .locator(".customer-summary")
    .getByRole("button", { name: "Modifica cliente", exact: true });
  await expect(edit).toHaveAttribute("title", "Modifica cliente");
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/customer-detail-" + width + ".png",
      fullPage: true,
    });
  }
});

for (const width of [1280, 390]) {
  test(`customer batch mode is opt-in and resets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/customers");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Gestisci selezione", exact: true })
      .click();
    await page.getByLabel("Seleziona tutti", { exact: true }).check();
    await expect(
      page.getByRole("button", { name: /Elimina clienti selezionati/ }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Fine selezione", exact: true })
      .click();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Gestisci selezione", exact: true })
      .click();
    await expect(
      page.getByLabel("Seleziona tutti", { exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: /Elimina clienti selezionati/ }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("customer name hover moves only the link and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/customers");
  const link = page.locator(".customer-name .order-link").first();
  const row = page.locator(".customer-table tbody tr").first();
  await expect(row).toBeVisible();
  const before = await row.boundingBox();
  const color = await link.evaluate((el) => getComputedStyle(el).color);
  await link.hover();
  await expect(link).toHaveCSS("transform", "matrix(1, 0, 0, 1, 2, 0)");
  await expect(link).not.toHaveCSS("color", color);
  expect(await row.boundingBox()).toEqual(before);
  await page.mouse.move(0, 0);
  await link.focus();
  await expect(link).toHaveCSS("transform", "matrix(1, 0, 0, 1, 2, 0)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(link).toHaveCSS("transform", "none");
});
