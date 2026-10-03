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

async function chooseRequiredPart(
  page: Page,
  option: string,
  scope: Page | Locator = page,
) {
  const combobox = scope.getByRole("combobox", {
    name: "Ricambio richiesto 1",
    exact: true,
  });
  if (!(await combobox.isVisible()))
    await scope.locator(".selected-part-summary").first().click();
  await chooseBusinessOption(page, "Ricambio richiesto 1", option, scope);
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
    diagnosis?: boolean;
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
  if (options.diagnosis)
    await page
      .getByRole("button", { name: "Imposta diagnosi", exact: true })
      .click();
  else await page.getByLabel("Display rotto", { exact: true }).check();
  await page
    .getByLabel("Consegna prevista", { exact: true })
    .fill("2099-12-31");
  if (options.diagnosis) {
    await expect(
      page.getByRole("combobox", { name: "Intervento 1", exact: true }),
    ).toHaveCount(0);
  } else if (options.manual) {
    const project = page.getByRole("combobox", {
      name: "Intervento 1",
      exact: true,
    });
    await project.fill(`Fotocamera ${Date.now()}`);
  } else
    await chooseBusinessOption(page, "Intervento 1", "sostituzione display");
  if (options.diagnosis) {
    // Diagnosis orders intentionally have no repair quote yet.
  } else if (options.manual) {
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
  if (options.discount && !options.diagnosis) {
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
  const trigger = page.locator(".detail-status .status-dropdown-trigger");
  const option = page.getByRole("option", { name: label, exact: true });
  for (let attempt = 0; attempt < 3 && !(await option.isVisible()); attempt++) {
    await trigger.click({ delay: 100 });
    await page.waitForTimeout(250);
  }
  await expect(option).toBeVisible();
  await option.click({ delay: 100 });
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toBeEnabled();
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

test("inputs and expanding controls scroll only when interaction space is tight", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/orders/new");
  const customer = page.getByRole("combobox", {
    name: "Cerca cliente",
    exact: true,
  });
  await customer.focus();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await customer.evaluate((element) => (element as HTMLElement).blur());
  await page.setViewportSize({ width: 1280, height: 450 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await customer.click();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await customer.evaluate((element) => (element as HTMLElement).blur());
  await customer.focus();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const customerTop = await customer.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(customerTop).toBeGreaterThanOrEqual(130);
  expect(customerTop).toBeLessThanOrEqual(210);

  const paymentHeading = page
    .locator(".order-step-card")
    .nth(3)
    .locator(".order-step-heading");
  await paymentHeading.evaluate((element) => {
    const box = element.getBoundingClientRect();
    window.scrollBy({ top: box.bottom - window.innerHeight + 8 });
  });
  await paymentHeading.evaluate((element) => (element as HTMLElement).click());
  await expect
    .poll(() =>
      paymentHeading.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeGreaterThan(120);
  expect(
    await paymentHeading.evaluate(
      (element) => element.getBoundingClientRect().top,
    ),
  ).toBeLessThan(230);
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
  const productName = `Cavo USB-C E2E ${Date.now()}`;
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Magazzino" })).toBeVisible();
  const inventoryMain = page.locator(".inventory-main");
  const batchControls = inventoryMain.locator(".inventory-batch-controls");
  await expect(inventoryMain.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(inventoryMain.locator(".inventory-batch-toolbar")).toHaveCount(
    0,
  );
  const searchBox = inventoryMain.getByLabel("Cerca prodotto o categoria");
  const manageBatch = batchControls.getByRole("button", {
    name: "Gestisci selezione",
    exact: true,
  });
  await expect(searchBox).toBeVisible();
  await expect(manageBatch).toBeVisible();
  expect(
    Math.abs(
      (await searchBox.boundingBox())!.y - (await manageBatch.boundingBox())!.y,
    ),
  ).toBeLessThan(2);
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
  await dialog.getByLabel("Prodotto", { exact: true }).fill(productName);
  await chooseBusinessOption(page, "Categoria", "Ricarica", dialog);
  await chooseBusinessOption(page, "Utilizzo", "Vendita", dialog);
  await dialog.getByLabel("Costo", { exact: true }).fill("4.50");
  await dialog.getByLabel("Prezzo", { exact: true }).fill("12");
  const initialStock = dialog.getByLabel("Scorta iniziale", { exact: true });
  const minimumStock = dialog.getByLabel("Scorta minima", { exact: true });
  await expect(dialog.locator(".number-stepper")).toHaveCount(2);
  await expect(
    dialog.getByRole("button", { name: "- Scorta iniziale", exact: true }),
  ).toBeDisabled();
  await initialStock.fill("");
  await expect(initialStock).toHaveValue("");
  await initialStock.fill("150");
  await initialStock.press("Tab");
  await expect(initialStock).toHaveValue("150");
  const initialPlus = dialog.getByRole("button", {
    name: "+ Scorta iniziale",
    exact: true,
  });
  await initialPlus.hover();
  await expect(initialPlus).toHaveCSS("background-color", "rgb(255, 247, 214)");
  expect((await initialPlus.boundingBox())!.width).toBeGreaterThanOrEqual(38);
  await initialPlus.click();
  await expect(initialStock).toHaveValue("151");
  await initialStock.fill("4");
  await minimumStock.fill("2");
  await dialog.getByLabel("Prodotto frequente", { exact: true }).check();
  await dialog.getByRole("button", { name: "Salva prodotto" }).click();

  const row = page.getByRole("row", { name: new RegExp(productName) });
  await expect(row).toContainText("Vendita");
  await expect(row).toContainText("4");
  await expect(row.getByText("Cronologia", { exact: true })).toHaveCount(0);
  await expect(row.locator(".inventory-quantity-cell")).toHaveText(["0", "4"]);
  await expect(row.locator(".inventory-quantity-cell input")).toHaveCount(0);
  await row.click();
  await expect(row.locator("input")).not.toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(row.locator("input")).toHaveCount(0);
  await row.click();
  await row.getByLabel("+ Disponibilità").click();
  await row.getByLabel("+ Disponibilità").click();
  await expect(row.getByLabel("Disponibilità", { exact: true })).toHaveValue(
    "6",
  );
  await expect(row.locator(".inventory-quantity-cell")).toHaveText(["0", "6"]);
  await row.getByLabel("Prodotto frequente", { exact: true }).click();
  const historyCard = page.locator(".inventory-history-card");
  await expect(historyCard).toContainText("0 → 4");
  const inventoryScroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("Enter");
  await expect(row.getByLabel("Disponibilità", { exact: true })).toHaveCount(0);
  await expect(historyCard).toContainText("4 → 6");
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - inventoryScroll),
  ).toBeLessThanOrEqual(20);
  await expect(historyCard).toContainText(productName);
  await expect(historyCard).toHaveCSS("cursor", "pointer");
  await expect
    .poll(() =>
      historyCard
        .locator(".inventory-history-title-underline")
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("matrix(0, 0, 0, 1, 0, 0)");
  await expect(historyCard.locator(".inventory-history-arrow")).toHaveCSS(
    "transform",
    "none",
  );
  await expect(historyCard.locator(".inventory-history-arrow")).toHaveCSS(
    "transition-delay",
    "0.24s, 0.24s",
  );
  const defaultBorderColor = await historyCard.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );
  await historyCard.hover();
  await page.waitForTimeout(100);
  expect(
    await historyCard
      .locator(".inventory-history-arrow")
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe("matrix(1, 0, 0, 1, 0, 0)");
  await expect(historyCard).toHaveCSS("border-color", defaultBorderColor);
  await expect
    .poll(() =>
      historyCard
        .locator(".inventory-history-border-flow rect")
        .evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe("inventory-history-border-flow");
  await expect
    .poll(() =>
      historyCard
        .locator(".inventory-history-border-flow rect")
        .evaluate((element) => getComputedStyle(element).animationDuration),
    )
    .toBe("0.9s");
  await expect(
    historyCard.locator(".inventory-history-border-flow rect"),
  ).toHaveCSS("animation-iteration-count", "infinite");
  await expect(
    historyCard.locator(".inventory-history-border-flow rect"),
  ).toHaveCSS("animation-timing-function", "linear");
  await expect
    .poll(() =>
      historyCard
        .locator(".inventory-history-title-underline")
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("matrix(1, 0, 0, 1, 0, 0)");
  await expect(historyCard.locator(".inventory-history-arrow")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 8, 0)",
  );
  await expect(historyCard.locator(".inventory-history-arrow")).toHaveCSS(
    "color",
    "rgb(238, 151, 0)",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      historyCard
        .locator(".inventory-history-border-flow rect")
        .evaluate((element) => getComputedStyle(element).animationDuration),
    )
    .toBe("1.4s");
  await expect(
    historyCard.locator(".inventory-history-title-underline"),
  ).toHaveCSS("transition-duration", "0.26s");
  await expect(
    historyCard.locator(".inventory-history-title-underline"),
  ).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(historyCard.locator(".inventory-history-arrow")).toHaveCSS(
    "transition-delay",
    "0.26s, 0.26s",
  );
  await expect(historyCard.locator(".inventory-history-arrow")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 8, 0)",
  );
  await historyCard.click();
  const movementDialog = page.getByRole("dialog", {
    name: "Registro magazzino",
  });
  const movementMonth = movementDialog.getByLabel("Mese", { exact: true });
  await expect(movementMonth).toHaveAttribute("type", "month");
  const currentMovementMonth = await movementMonth.inputValue();
  await expect(movementDialog).toContainText(productName);
  await expect(movementDialog).toContainText("4 → 6");
  await expect(
    movementDialog.locator(".movement-row").filter({ hasText: productName }),
  ).toHaveCount(2);
  await movementMonth.fill("2000-01");
  await expect(movementDialog.locator(".movement-row")).toHaveCount(0);
  await expect(movementDialog).toContainText("Nessun movimento registrato.");
  await movementMonth.fill(currentMovementMonth);
  await expect(
    movementDialog.locator(".movement-row").filter({ hasText: productName }),
  ).toHaveCount(2);
  await movementDialog.getByRole("button", { name: "Chiudi" }).click();

  await manageBatch.click();
  const deleteBatch = batchControls.getByRole("button", {
    name: "Elimina",
    exact: true,
  });
  await expect(batchControls).toContainText("0 selezionati");
  await expect(deleteBatch).toBeDisabled();
  await row.getByRole("checkbox").check();
  await expect(batchControls).toContainText("1 selezionati");
  await expect(deleteBatch).toBeEnabled();
  await batchControls
    .getByRole("button", { name: "Seleziona tutti", exact: true })
    .click();
  const tableCheckboxes = inventoryMain.locator(
    '.inventory-table input[type="checkbox"]',
  );
  await expect(tableCheckboxes.first()).toBeChecked();
  await expect(tableCheckboxes.last()).toBeChecked();
  await batchControls
    .getByRole("button", { name: "Fine", exact: true })
    .click();
  await expect(inventoryMain.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(batchControls).not.toContainText("selezionati");
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
  await expect(
    page
      .locator(".status-dropdown-menu")
      .getByRole("option", { name: "Ricambio mancante", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
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
test("repair list animates a row reordered by a local status change", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fillOrder(page, { manual: true });
  await save(page);
  const olderOrderPath = new URL(page.url()).pathname;
  await page.waitForTimeout(50);
  await fillOrder(page, { manual: true });
  await save(page);
  const newerOrderPath = new URL(page.url()).pathname;
  await page.goto("/orders");

  const olderRow = page.locator(`tbody tr:has(a[href="${olderOrderPath}"])`);
  const initialOrder = await page
    .locator(".order-code-link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(initialOrder.indexOf(olderOrderPath)).toBeGreaterThan(
    initialOrder.indexOf(newerOrderPath),
  );
  const scrollBefore = await page.evaluate(() => window.scrollY);

  await olderRow.click();
  await olderRow.locator(".status-dropdown-trigger").click();
  await page
    .locator(".status-dropdown-menu")
    .getByRole("option", { name: "Annullato", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Annulla scheda" });
  await page.evaluate(() => {
    document.body.dataset.orderAnimationMax = "0";
    const started = performance.now();
    const sample = () => {
      let maximum = Number(document.body.dataset.orderAnimationMax ?? "0");
      document
        .querySelectorAll(".order-list-body > tr > td")
        .forEach((cell) => {
          const transform = getComputedStyle(cell).transform;
          if (transform === "none") return;
          maximum = Math.max(
            maximum,
            Math.abs(new DOMMatrixReadOnly(transform).m42),
          );
        });
      document.body.dataset.orderAnimationMax = String(maximum);
      if (performance.now() - started < 5000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await dialog
    .getByRole("button", { name: "Conferma annullamento" })
    .click({ delay: 150 });

  await expect(page.locator("tbody tr").first()).toContainText(
    await olderRow.locator(".order-code-link").innerText(),
  );
  await expect
    .poll(() =>
      page
        .locator("tbody td")
        .evaluateAll((cells) =>
          cells.some((cell) =>
            cell
              .getAnimations()
              .some(
                (animation) => animation.effect?.getTiming().duration === 360,
              ),
          ),
        ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      Number(document.body.dataset.orderAnimationMax ?? "0"),
    ),
  ).toBeGreaterThan(1);
  await expect(olderRow).toHaveClass(/order-row-status-highlight/, {
    timeout: 1000,
  });
  await expect(olderRow).not.toHaveClass(/order-row-status-highlight/, {
    timeout: 2000,
  });
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  await page.reload();
  await expect(olderRow).not.toHaveClass(/order-row-status-highlight/);
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
  await dialog
    .getByRole("button", { name: /Incassa e consegna/ })
    .click({ delay: 150 });
  await expect(dialog).toHaveCount(0);
  await expect(row).not.toHaveClass(/order-row-active/);
  await expect(row.locator(".badge")).toContainText("Consegnato");
  await expect(row).toContainText("Consegnato");
  await expect(row).toContainText("0,00 €");
  await row.locator("td").nth(2).click();
  await expect(
    page.getByRole("dialog", { name: "Incassa e consegna" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(row.locator(".badge")).toContainText("Consegnato");
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
  await dialog
    .getByRole("button", { name: "Conferma annullamento" })
    .click({ delay: 150 });
  await expect(dialog).toHaveCount(0);
  await expect(row).not.toHaveClass(/order-row-active/);
  await expect(row).toContainText("Annullato");
  await expect(row).toContainText("0,00 €");
  await expect(row.getByLabel("Incassato", { exact: true })).toHaveCount(0);
  await row.locator("td").nth(2).click();
  await expect(
    page.getByRole("dialog", { name: "Annulla scheda" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(row.locator(".badge")).toContainText("Annullato");
  await expect(row).toContainText("0,00 €");
});

test("repair detail cancellation persists after a reload", async ({ page }) => {
  await fillOrder(page);
  await save(page);
  await page.locator(".detail-status .status-dropdown-trigger").click();
  await page.getByRole("option", { name: "Annullato", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Annulla scheda" });
  await dialog.getByRole("button", { name: "Conferma annullamento" }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toContainText("Annullato");
  await page.reload();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toContainText("Annullato");
});

test("diagnostic order saves faults, date and quote in one progressive flow", async ({
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
  const details = page.getByTestId("details-card");
  await expect(quote).toContainText("Dispositivo in diagnosi");
  await expect(quote).toContainText("30,00 €");
  await expect(quote).toContainText("6,60 €");
  await expect(quote.getByRole("row")).toHaveCount(0);
  await details.locator(".order-card-heading").click();
  await expect(details.locator(".detail-repair-summaries")).toHaveCount(0);
  await details.locator(".order-card-heading").click();

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

  await quote.getByRole("button", { name: "Diagnosi e preventivo" }).click();
  await page
    .getByRole("button", {
      name: "Completa diagnosi e crea preventivo",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Completa diagnosi e crea preventivo",
  });
  const saveInspection = dialog.getByRole("button", {
    name: "Salva",
    exact: true,
  });
  await expect(saveInspection).toBeDisabled();
  await dialog.getByLabel("Display rotto", { exact: true }).check();
  const result = "Display danneggiato, necessaria la sostituzione";
  await dialog.getByLabel(/Descrizione aggiuntiva/).fill(result);
  await dialog
    .getByLabel("Consegna prevista", { exact: true })
    .fill("2099-12-31");
  const inspectionProjectSearch = dialog.getByRole("combobox", {
    name: "Intervento 1",
    exact: true,
  });
  await inspectionProjectSearch.fill(`Intervento layout ${Date.now()}`);
  const inspectionProjectControl = inspectionProjectSearch.locator(
    "xpath=ancestor::*[contains(@class, 'business-combobox-control')]",
  );
  const inspectionControlWidths = await inspectionProjectControl
    .locator(
      ":scope > .business-combobox-input, :scope > .business-combobox-chevron, :scope > .quote-price-field, :scope > .business-select-create",
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    );
  expect(inspectionControlWidths).toHaveLength(4);
  expect(inspectionControlWidths[0]).toBeLessThanOrEqual(420);
  expect(Math.abs(inspectionControlWidths[1] - 36)).toBeLessThanOrEqual(1);
  expect(Math.abs(inspectionControlWidths[2] - 145)).toBeLessThanOrEqual(1);
  await inspectionProjectSearch.fill("");
  await chooseBusinessOption(
    page,
    "Intervento 1",
    "sostituzione display",
    dialog,
  );
  await expect(dialog.locator(".selected-project-summary")).toContainText(
    "100,00 €",
  );
  await expect(dialog.locator(".selected-part-summary")).toContainText(
    "Nessuno",
  );
  await expect(
    dialog.getByRole("combobox", {
      name: "Ricambio richiesto 1",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(saveInspection).toBeEnabled();
  await saveInspection.click();
  await expect(dialog).toHaveCount(0);
  await expect(status).toContainText("In riparazione");
  await details.locator(".order-card-heading").click();
  await expect(details).toContainText("Display rotto");
  await expect(details).toContainText(result);
  await expect(details.locator(".detail-repair-summaries")).toBeVisible();
  await expect(details.locator(".selected-project-summary")).toContainText(
    "sostituzione display",
  );
  await expect(details.locator(".selected-part-summary")).toContainText(
    "Nessuno",
  );
  await details.locator(".selected-part-summary .summary-action").click();
  await expect(
    details.getByRole("combobox", {
      name: "Ricambio richiesto 1",
      exact: true,
    }),
  ).toBeFocused();
  await details.getByRole("button", { name: "Annulla", exact: true }).click();
  await quote.locator(".order-card-heading").click();
  await expect(quote).toContainText("Costo diagnosi (IVA esclusa)");
  const history = page.getByTestId("history-card");
  await history.locator(".order-card-heading").click();
  await expect(history).toContainText("Diagnosi avviata");
  await expect(history).toContainText("Diagnosi completata");
  await expect(history).toContainText("Preventivo creato");
  await expect(history).toContainText("Stato aggiornato: In riparazione");
  const balanceCard = page.locator(".balance-card");
  await expect(balanceCard).toContainText("Riparazione: 100,00 €");
  await expect(balanceCard).toContainText("Diagnosi: 30,00 €");
  await expect(balanceCard).toContainText("Totale: 130,00 €");
  await state(page, "READY");
  await page.getByRole("button", { name: /Incassa e consegna/ }).click();
  await expect(page.locator(".message.error")).toHaveCount(0);
  await expect(status).toContainText("Consegnato");
});

test("sales history uses a monthly filter", async ({ page }) => {
  await page.goto("/retail");
  await page.getByRole("button", { name: "Vendite", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width).toBeGreaterThan(800);
  expect(dialogBox?.height).toBeGreaterThan(600);
  const period = dialog.getByLabel("Mese");
  await expect(period).toHaveAttribute("type", "month");
  await expect(period).toHaveCSS("cursor", "pointer");
  await period.fill("2025-01");
  await expect(dialog).toContainText("Nessuna vendita registrata.");
  await period.fill(new Date().toISOString().slice(0, 7));
  await expect(page.locator('select[name="mode"]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/retail$/);
  await dialog.getByRole("button", { name: "Chiudi" }).click();

  await page.goto("/retail/sales");
  await expect(page).toHaveURL(/\/retail\?view=sales$/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Chiudi" }).click();
  await expect(page).toHaveURL(/\/retail$/);
});

test("completes a retail sale and opens its immutable receipt", async ({
  page,
}) => {
  await page.goto("/retail");
  const products = page.locator(".retail-product-grid");
  const cable = products.getByRole("button", { name: /Cavo USB-C Test/ });
  await cable.click();
  await cable.click();
  const cartRow = page.locator(".retail-cart-row");
  const retailQuantity = cartRow.getByRole("spinbutton", {
    name: "Quantità Cavo USB-C Test",
    exact: true,
  });
  await expect(retailQuantity).toHaveValue("2");
  await retailQuantity.fill("");
  await expect(retailQuantity).toHaveValue("");
  await retailQuantity.fill("5");
  await retailQuantity.press("Tab");
  await expect(retailQuantity).toHaveValue("5");
  await retailQuantity.fill("10");
  await retailQuantity.press("Enter");
  await expect(
    cartRow.getByRole("button", { name: "+ Cavo USB-C Test", exact: true }),
  ).toBeDisabled();
  await retailQuantity.fill("2");
  await retailQuantity.press("Enter");
  await expect(retailQuantity).toHaveValue("2");
  await expect(
    products.getByRole("button", { name: /Cover esaurita Test/ }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Bonifico" })).toHaveCount(0);
  await page.getByRole("button", { name: "Carta", exact: true }).click();
  await page.getByRole("button", { name: /Conferma incasso.*24,00/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toContainText("Vendita completata");
  await expect(dialog.getByRole("status")).toContainText("24,00 €");
  await dialog.getByRole("button", { name: "Vedi vendita" }).click();
  await expect(page).toHaveURL(/\/retail$/);
  await expect(dialog.getByText(/Dettaglio vendita · V-/)).toBeVisible();
  await expect(dialog.getByText("Cavo USB-C Test")).toBeVisible();
  await dialog.getByRole("button", { name: /Vendita completata/ }).click();
  await dialog.getByRole("button", { name: "Prossima vendita" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".retail-empty-cart")).toBeVisible();

  await page.getByRole("button", { name: "Vendite", exact: true }).click();
  const historyDialog = page.getByRole("dialog");
  const saleNumber = historyDialog
    .getByRole("button", { name: /^V-\d{8}\d{3}$/ })
    .first();
  await expect(saleNumber).toHaveClass(/order-code-link/);
  await saleNumber.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(historyDialog).toContainText("Cavo USB-C Test");
  const backToHistory = historyDialog.getByRole("button", {
    name: /Storico vendite/,
  });
  await expect(backToHistory).toHaveClass(/back-link/);
  await backToHistory.click();
  await expect(historyDialog.getByText("Numero vendita")).toBeVisible();
  await historyDialog.getByRole("button", { name: "Chiudi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/retail$/);
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
  await expect(page.getByTestId("other-information-card")).toHaveCount(0);
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
  await page.getByTestId("details-card").locator(".order-card-heading").click();
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
test("settings applies a manual business date and can return to system time", async ({
  page,
}) => {
  await page.goto("/settings");
  const dateSettings = page.locator(".business-date-settings");
  await chooseBusinessOption(
    page,
    "Modalità data",
    "Imposta manualmente",
    dateSettings,
  );
  await dateSettings
    .getByLabel("Imposta manualmente", { exact: true })
    .fill("2031-04-12");
  await dateSettings
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Data corrente aggiornata.",
  );
  await expect(dateSettings).toContainText("12/04/2031");

  await page.goto("/orders/new");
  await chooseBusinessOption(page, "Cerca cliente", "Cliente Playwright");
  await chooseBusinessOption(
    page,
    "Dispositivo del cliente",
    "Apple iPhone 13",
  );
  await page.getByLabel("Display rotto", { exact: true }).check();
  await expect(
    page.getByLabel("Consegna prevista", { exact: true }),
  ).toHaveAttribute("min", "2031-04-12");

  await page.goto("/settings");
  const resetSettings = page.locator(".business-date-settings");
  await chooseBusinessOption(
    page,
    "Modalità data",
    "Segui la data di sistema",
    resetSettings,
  );
  await resetSettings
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Data corrente aggiornata.",
  );
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
  await page.reload();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);
  await expect(page.locator(".balance-card>strong")).toContainText("0,00");
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
  await chooseRequiredPart(page, "Batteria Test");
  await openPayment(page);
  await page
    .getByLabel("Incasso alla creazione (€)", { exact: true })
    .fill("75");
  await save(page);
  await page.waitForLoadState("networkidle");

  const details = page.getByTestId("details-card");
  const products = page.getByTestId("products-card");
  const quote = page.getByTestId("quote-card");
  const warranty = page.getByTestId("warranty-card");
  const history = page.getByTestId("history-card");
  await expect(details.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(products.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(quote.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(warranty.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(history.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("other-information-card")).toHaveCount(0);
  await details.locator(".order-card-heading").click();
  await page.waitForTimeout(250);
  const repairSummary = details.locator(".detail-repair-summary");
  await expect(
    repairSummary.locator(".selected-project-summary"),
  ).toContainText("Fotocamera");
  const requiredPartSummary = repairSummary.locator(".selected-part-summary");
  await expect(requiredPartSummary).toContainText("Batteria Test");
  await expect(requiredPartSummary).toContainText("Scorta reale 3");
  await expect(requiredPartSummary).toContainText("Impegnata 1");
  await expect(requiredPartSummary).toContainText("Disponibile 2");
  await expect(requiredPartSummary).toContainText("● Disponibile");
  await repairSummary
    .locator(".selected-project-summary .summary-action")
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(details).toHaveClass(/is-editing/);
  await expect(details.locator(".order-card-actions")).toContainText(
    "Modifica in corso",
  );
  await expect(
    details.getByRole("combobox", { name: "Cerca cliente", exact: true }),
  ).toBeVisible();
  await expect(
    details.getByRole("combobox", { name: "Intervento 1", exact: true }),
  ).toBeFocused();
  await expect(
    details.locator(".detail-repair-summary .selected-project-summary"),
  ).toHaveCount(0);
  await expect(
    details.locator(".detail-repair-summary .selected-part-summary"),
  ).toBeVisible();
  await expect(details.locator(".detail-repair-editor .message")).toHaveCount(
    0,
  );
  await expect(
    details.locator(".detail-repair-editor .quote-total"),
  ).toHaveCount(0);
  await expect(
    details.getByRole("button", { name: "Annulla", exact: true }),
  ).toHaveCount(1);
  await expect(
    details.getByRole("button", { name: "Salva", exact: true }),
  ).toHaveCount(1);
  await chooseBusinessOption(
    page,
    "Intervento 1",
    "sostituzione display",
    details,
  );
  await expect(
    details.getByRole("combobox", { name: "Intervento 1", exact: true }),
  ).toHaveCount(0);
  await expect(
    details.locator(".detail-repair-summary .selected-project-summary"),
  ).toContainText("sostituzione display");
  await expect(details).toHaveClass(/is-editing/);
  await details.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(details).not.toHaveClass(/is-editing/);
  await expect(
    details.locator(".detail-repair-summary .selected-project-summary"),
  ).toContainText("Fotocamera");
  await details.locator(".selected-part-summary .summary-action").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    details.locator(".detail-repair-summary .selected-project-summary"),
  ).toBeVisible();
  await expect(
    details.locator(".detail-repair-summary .selected-part-summary"),
  ).toHaveCount(0);
  await expect(
    details.getByRole("combobox", {
      name: "Ricambio richiesto 1",
      exact: true,
    }),
  ).toBeFocused();
  await expect(details.locator(".quote-required-part-label")).toHaveCount(1);
  await chooseBusinessOption(
    page,
    "Ricambio richiesto 1",
    "Batteria Test",
    details,
  );
  await expect(
    details.getByRole("combobox", {
      name: "Ricambio richiesto 1",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    details.locator(".detail-repair-summary .selected-part-summary"),
  ).toContainText("Batteria Test");
  await expect(details).toHaveClass(/is-editing/);
  await details
    .getByLabel("Note interne", { exact: true })
    .fill("Test salvataggio unico");
  await details.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(details).not.toHaveClass(/is-editing/);
  await expect(details.locator(".detail-repair-editor")).toHaveCount(0);
  await expect(
    details.locator(".detail-repair-summary .selected-project-summary"),
  ).toBeVisible();
  await expect(
    details.locator(".detail-repair-summary .selected-part-summary"),
  ).toContainText("Batteria Test");
  await expect(details).toContainText("Test salvataggio unico");
  await expect(
    products
      .locator(".order-product-line")
      .filter({ hasText: "Batteria Test" }),
  ).toHaveCount(0);
  const productsTop = await products.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  const detailsEdit = details.getByRole("button", {
    name: "Modifica dati",
    exact: true,
  });
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
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
    await products.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    ),
  ).toBe(productsTop);

  const addProduct = products.getByRole("button", {
    name: "Aggiungi prodotto",
    exact: true,
  });
  const addonQuantity = products.getByRole("spinbutton", {
    name: "Quantità",
    exact: true,
  });
  const addonStepper = products.locator(".order-product-form .number-stepper");
  const addonPlus = products.getByRole("button", {
    name: "+ Quantità",
    exact: true,
  });
  await expect(addonQuantity).toHaveCount(0);
  await expect(addProduct).toHaveCount(0);
  await products.getByRole("combobox", { name: "Prodotto" }).fill("Cavo");
  await expect(addonQuantity).toHaveCount(0);
  await expect(addProduct).toHaveCount(0);
  await chooseBusinessOption(page, "Prodotto", "Cavo USB-C Test", products);
  const productControls = products.locator(
    ".order-product-form .business-combobox-control, .order-product-form .number-stepper, .order-product-form .button",
  );
  const productBoxes = await productControls.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { bottom: box.bottom, height: box.height };
    }),
  );
  expect(new Set(productBoxes.map(({ bottom }) => bottom)).size).toBe(1);
  expect(new Set(productBoxes.map(({ height }) => height)).size).toBe(1);
  await expect(addonPlus).toBeVisible();
  const stepperBox = await addonStepper.boundingBox();
  const plusBox = await addonPlus.boundingBox();
  expect(plusBox!.x + plusBox!.width).toBeLessThanOrEqual(
    stepperBox!.x + stepperBox!.width + 1,
  );
  await addonQuantity.fill("");
  await expect(addonQuantity).toHaveValue("");
  await addonQuantity.fill("150");
  await expect(addonQuantity).toHaveValue("150");
  await addonQuantity.press("Tab");
  await expect(addonQuantity).toHaveValue("10");
  await expect(addonPlus).toBeDisabled();
  await addonQuantity.fill("1");
  await addonQuantity.press("Tab");
  await expect(addProduct).toBeEnabled();

  await details
    .getByRole("button", { name: "Modifica dati", exact: true })
    .click();
  await expect(details).toHaveClass(/is-editing/);
  await expect(details.locator(".order-card-heading")).toBeEnabled();
  await details
    .getByLabel("Descrizione aggiuntiva")
    .fill("Fotocamera non funziona");
  await details.locator(".order-card-heading").click();
  await expect(details).not.toHaveClass(/is-editing/);
  await expect(details.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await details.locator(".order-card-heading").click();
  await expect(details).toContainText("Fotocamera non funziona");
  await details
    .getByRole("button", { name: "Modifica dati", exact: true })
    .click();
  await details
    .getByLabel("Descrizione aggiuntiva")
    .fill("Fotocamera non funziona ancora");
  await quote.hover();
  await quote
    .getByRole("button", { name: "Modifica dati", exact: true })
    .click();
  await expect(details).not.toHaveClass(/is-editing/);
  await expect(details).toContainText("Fotocamera non funziona");
  await expect(quote).toHaveClass(/is-editing/);
  await quote.getByRole("button", { name: "Annulla" }).click();

  await expect(details).toContainText("Fotocamera non funziona ancora");

  await quote.locator(".order-card-heading").click();
  await expect(quote.locator(".quote-summary")).toBeHidden();
  await quote.locator(".order-card-heading").click();
  await expect(quote.locator(".quote-summary")).toBeVisible();
  await quote
    .getByRole("button", { name: "Modifica dati", exact: true })
    .click();
  await expect(quote.locator(".items-editor")).toHaveCount(0);
  await expect(quote.locator(".message.warning")).toHaveCount(0);
  await expect(quote.locator(".quote-total")).toBeVisible();
  await expect(quote.locator(".quote-adjustments")).toBeVisible();
  await expect(quote.locator(".quote-summary")).toBeVisible();
  await expect(
    quote.getByRole("button", { name: "Aggiungi intervento" }),
  ).toHaveCount(0);
  await quote.getByRole("button", { name: "Annulla" }).click();
  await warranty.hover();
  await warranty
    .getByRole("button", { name: "Modifica dati", exact: true })
    .click();
  const warrantyProject = await warranty
    .locator(".project-warranty-editor section strong")
    .textContent();
  const duration = warranty.getByRole("button", {
    name: `Durata garanzia ${warrantyProject}`,
    exact: true,
  });
  await duration.click();
  await page
    .locator(".business-select-panel.is-entering")
    .getByRole("option", { name: "90 giorni", exact: true })
    .click();
  await expect(duration).toContainText("90 giorni");
  await warranty
    .getByLabel("Note garanzia")
    .fill("Solo il componente sostituito");
  await warranty.getByRole("button", { name: "Salva" }).click();
  await expect(warranty).not.toHaveClass(/is-editing/);
  await expect(warranty).toContainText("90 giorni");
  await page.reload();
  await expect(warranty.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await warranty.click({ position: { x: 12, y: 12 } });
  await expect(warranty.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(warranty.locator(".warranty-progress-panel")).toContainText(
    "90 giorni",
  );

  await state(page, "READY");
  await page.getByLabel("Nome di chi ritira", { exact: true }).fill("Cliente");
  await page.getByRole("button", { name: /Conferma consegna/ }).click();
  await expect(
    page.locator(".detail-status .status-dropdown-trigger"),
  ).toHaveText(/Consegnato/);
  const firstDelivery = await details.getByText(/Ritirato da/).textContent();
  await expect(
    details.getByRole("button", { name: "Modifica dati", exact: true }),
  ).toHaveCount(0);
  await expect(
    quote.getByRole("button", { name: "Modifica dati", exact: true }),
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
    dialog.getByRole("checkbox", { name: /Fotocamera/ }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("radio", { name: /Riparazione in garanzia/ }),
  ).toBeChecked();
  const dialogPartSummary = dialog.locator(".selected-part-summary");
  await expect(dialogPartSummary).toContainText("Batteria Test");
  await expect(dialogPartSummary).toContainText("Disponibile");
  await dialog.locator(".after-sales-part-field > span").click();
  await expect(
    dialog.getByRole("combobox", { name: /Ricambio richiesto/ }),
  ).toHaveCount(0);
  await dialogPartSummary.hover();
  await expect(dialogPartSummary.locator(".summary-action svg")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 4, 0)",
  );
  expect(
    await dialog.locator(".after-sales-notes").evaluate((notes) => {
      const list = notes.closest("form")?.querySelector(".rework-project-list");
      return list
        ? notes.getBoundingClientRect().top -
            list.getBoundingClientRect().bottom
        : 0;
    }),
  ).toBeGreaterThanOrEqual(18);
  await dialogPartSummary.locator(".selection-summary-copy").click();
  const dialogPartSearch = dialog.getByRole("combobox", {
    name: /Ricambio richiesto/,
  });
  await expect(dialogPartSearch).toBeFocused();
  const dialogNewPart = dialog.getByRole("button", {
    name: "Nuovo ricambio",
  });
  await expect(dialogNewPart).toHaveCount(0);
  await dialogPartSearch.fill("Batteria");
  await expect(dialogNewPart).toHaveCount(0);
  await dialogPartSearch.fill(`Ricambio assente ${Date.now()}`);
  await expect(dialogNewPart).toBeVisible();
  await dialogPartSearch.fill("");
  await expect(dialog.locator(".selected-part-summary")).toContainText(
    "Nessuno",
  );
  await expect(dialog.getByLabel("Costo aggiuntivo (€)")).toHaveCount(0);
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
  await dialog.locator(".selected-part-summary .summary-action").click();
  await dialog.getByRole("combobox", { name: /Ricambio richiesto/ }).fill("");
  await expect(dialog.locator(".selected-part-summary")).toContainText(
    "Nessuno",
  );
  await dialog
    .getByLabel("Note post-vendita (facoltative)")
    .fill("Difetto ricomparso");
  await dialog.getByLabel("Costo aggiuntivo (€)").fill("50");
  await dialog
    .getByRole("button", { name: "Apri riparazione post-vendita", exact: true })
    .click();
  const reworkStatus = page.locator(".detail-status .status-dropdown-trigger");
  await expect(reworkStatus).toHaveText(/In riparazione post-vendita/);
  await expect(reworkStatus).toHaveCSS("color", "rgb(190, 24, 93)");
  await expect(reworkStatus).toHaveCSS(
    "background-color",
    "rgb(252, 231, 243)",
  );
  await expect(warranty.locator(".order-card-heading")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  for (const card of [details, products, quote, history]) {
    await expect(card.locator(".order-card-heading")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  }
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
  await expect(warranty.locator(".project-warranty-list > section")).toHaveCSS(
    "padding",
    "18px",
  );
  await expect(warranty.locator(".active-rework-summary")).toHaveCSS(
    "row-gap",
    "12px",
  );
  const detailPartSummary = warranty.locator(
    ".active-rework-summary .selected-part-summary",
  );
  await expect(detailPartSummary).toContainText("Nessuno");
  await detailPartSummary.locator(".selection-summary-copy").click();
  const detailPartSearch = warranty.getByRole("combobox", {
    name: "Ricambio richiesto",
    exact: true,
  });
  await expect(detailPartSearch).toBeFocused();
  await detailPartSearch.press("Escape");
  await expect(detailPartSummary).toContainText("Nessuno");
  await expect(
    details.getByRole("button", { name: "Modifica dati", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Importo (€)", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Registra incasso" }).click();
  await expect(page.locator(".balance-card>strong")).toContainText("0,00");
  await state(page, "READY");
  await reworkStatus.click();
  const reworkReadyMenu = page.locator(".status-dropdown-menu");
  await expect(
    reworkReadyMenu.getByRole("option", { name: "Annullato", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
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
  await chooseBusinessOption(page, "Ricambio richiesto", "Batteria Test", form);
  const requiredQuantity = form.getByRole("spinbutton", {
    name: "Quantità",
    exact: true,
  });
  await requiredQuantity.fill("");
  await expect(requiredQuantity).toHaveValue("");
  await requiredQuantity.fill("12");
  await requiredQuantity.press("Tab");
  await expect(requiredQuantity).toHaveValue("12");
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
  await expect(
    page.locator(".order-step-card").nth(1).locator(".order-step-heading"),
  ).toHaveAttribute("aria-expanded", "true");
  await openStep(page, 0);
  const customerSummary = page.locator(".selected-customer-summary");
  await customerSummary.hover();
  await expect(customerSummary.locator(".summary-action svg")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 4, 0)",
  );
  await customerSummary.locator(".selection-summary-copy").click();
  await expect(
    page.getByRole("combobox", { name: "Cerca cliente", exact: true }),
  ).toBeVisible();
  await expect(customerSummary).toHaveCount(0);
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
  await expect(createCustomer).toHaveCount(0);
  await expand.click();
  await expect(customer).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator(".business-select-panel.is-entering").getByRole("option"),
  ).not.toHaveCount(0);
  await customerControl.locator(".business-combobox-chevron").click();
  await expect(customer).toHaveAttribute("aria-expanded", "false");

  await customer.fill("Cliente");
  await expect(createCustomer).toHaveCount(0);

  await customer.fill("cliente-in-trovabile");
  const panel = page.locator(".business-select-panel.is-entering");
  await expect(panel).toContainText(
    "Nessun risultato. Usa «+Nuovo cliente» a destra per crearne uno.",
  );
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expect(createCustomer).toBeEnabled();
  await createCustomer.click();
  const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await expect(dialog.getByLabel(/Nome e cognome/)).toHaveValue(
    "cliente-in-trovabile",
  );
  await expect(dialog.getByLabel(/Telefono/)).toBeFocused();
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(customer).toHaveValue("cliente-in-trovabile");
  await customerControl
    .getByRole("button", { name: "Cancella selezione", exact: true })
    .click();
  await expect(customer).toHaveValue("");
  await expect(createCustomer).toHaveCount(0);

  await customer.fill("3391234567");
  await createCustomer.click();
  await expect(dialog.getByLabel(/Telefono/)).toHaveValue("3391234567");
  await expect(dialog.getByLabel(/Nome e cognome/)).toBeFocused();
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await customerControl
    .getByRole("button", { name: "Cancella selezione", exact: true })
    .click();

  await chooseBusinessOption(page, "Cerca cliente", "Cliente Playwright");
  await page.getByRole("button", { name: "Cambia", exact: true }).click();
  await expect(customer).toHaveValue("");
  await expect(page.locator(".order-step-heading").first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator(".order-step-state").first()).toContainText(
    "In corso",
  );

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
  await expect(projectPrice).toHaveCount(0);
  await expect(createProject).toHaveCount(0);
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
  await expect(projectPrice).toHaveCount(0);
  await expect(createProject).toHaveCount(0);
  await chooseBusinessOption(page, "Intervento 1", "sostituzione display");
  const projectSummary = page.locator(".selected-project-summary");
  await expect(projectSummary).toContainText("sostituzione display");
  await expect(projectSummary).toContainText("100,00 €");
  await expect(
    page.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveCount(0);
  await projectSummary.locator(".summary-price-button").click();
  await expect(
    page.getByRole("combobox", { name: "Intervento 1", exact: true }),
  ).toHaveCount(0);
  const inlinePrice = page.getByLabel("Prezzo originale (€) 1", {
    exact: true,
  });
  await expect(inlinePrice).toHaveValue("100");
  await inlinePrice.fill("0");
  await inlinePrice.press("Enter");
  await expect(inlinePrice).toBeVisible();
  await expect(
    inlinePrice.locator("xpath=..//*[@class='field-error']"),
  ).toHaveText("Il prezzo deve essere maggiore di 0.");
  await inlinePrice.fill("105");
  await inlinePrice.press("Enter");
  await expect(projectSummary).toContainText("105,00 €");
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
  await expect(page.locator(".price-breakdown")).toContainText("105,00");
  await projectSummary.getByRole("button", { name: "Cambia" }).click();
  const customName = `Intervento temporaneo ${Date.now()}`;
  const editingProjectSearch = page.getByRole("combobox", {
    name: "Intervento 1",
    exact: true,
  });
  await expect(editingProjectSearch).toBeFocused();
  await editingProjectSearch.fill(customName);
  await expect(projectPrice).toBeVisible();
  const noMatchHint = page.locator(".repair-project-no-match-hint");
  await expect(noMatchHint).toHaveText(
    "Prezzo inserito. Usa «+Intervento personalizzato» a destra per creare l'intervento.",
  );
  await expect(page.locator(".business-select-panel.is-entering")).toHaveCount(
    0,
  );
  await page
    .getByRole("combobox", { name: "Intervento 1", exact: true })
    .press("Enter");
  await expect(projectPrice).toBeFocused();
  await projectPrice.fill("");
  await expect(noMatchHint).toHaveText(
    "Nessun contenuto corrispondente. Inserisci il prezzo per creare un intervento personalizzato.",
  );
  await projectPrice.fill("0");
  await expect(createProject).toBeDisabled();
  await expect(noMatchHint).toHaveText(
    "Il prezzo non può essere 0. Inserisci un prezzo valido.",
  );
  const invalidLayout = await projectControl.boundingBox();
  await projectPrice.fill("99");
  await expect(createProject).toBeEnabled();
  await expect(noMatchHint).toHaveText(
    "Prezzo inserito. Usa «+Intervento personalizzato» a destra per creare l'intervento.",
  );
  const validLayout = await projectControl.boundingBox();
  expect(Math.abs(validLayout!.height - invalidLayout!.height)).toBeLessThan(1);
  expect(Math.abs(validLayout!.width - invalidLayout!.width)).toBeLessThan(1);
  const projectControlWidths = await projectControl
    .locator(
      ":scope > .business-combobox-input, :scope > .business-combobox-chevron, :scope > .quote-price-field, :scope > .business-select-create",
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    );
  expect(projectControlWidths).toHaveLength(4);
  expect(projectControlWidths[0]).toBeLessThanOrEqual(420);
  expect(Math.abs(projectControlWidths[1] - 36)).toBeLessThanOrEqual(1);
  expect(Math.abs(projectControlWidths[2] - 145)).toBeLessThanOrEqual(1);
  await expect(
    page.locator(".quote-item").first().locator(":scope > .quote-hint"),
  ).toHaveCount(0);
  await createProject.click();
  await expect(projectSummary).toContainText(customName);
  await expect(projectSummary).toContainText(
    "Intervento personalizzato temporaneo",
  );
  await expect(projectSummary).toContainText("99,00 €");
  await projectSummary.locator(".summary-price-button").click();
  const customInlinePrice = page.getByLabel("Prezzo originale (€) 1", {
    exact: true,
  });
  await customInlinePrice.fill("+");
  await customInlinePrice.press("Enter");
  await expect(projectSummary).toBeVisible();
  await expect(customInlinePrice).toBeVisible();
  await expect(
    page.getByText("Il prezzo deve essere maggiore di 0."),
  ).toBeVisible();
  await customInlinePrice.fill("99");
  await customInlinePrice.press("Enter");
  await expect(projectSummary).toContainText("99,00 €");
  const catalogPage = await page.context().newPage();
  await catalogPage.goto("/prices");
  await catalogPage.getByLabel("Cerca", { exact: true }).fill(customName);
  await expect(catalogPage.locator(".price-rule-row")).toHaveCount(0);
  await catalogPage.close();
  await projectSummary.getByRole("button", { name: "Cambia" }).click();
  const temporaryOption = page
    .getByRole("option")
    .filter({ hasText: customName });
  await expect(temporaryOption).toContainText(
    "Intervento personalizzato temporaneo",
  );
  await expect(temporaryOption).toHaveAttribute("aria-selected", "true");
  await temporaryOption.click();
  await expect(projectSummary).toContainText("99,00 €");
  await openStep(page, 1);
  await enterBusinessValue(page, "Modello", "Unknown model");
  await openStep(page, 2);
  await expect(
    page.getByRole("combobox", { name: "Intervento 1", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveCount(0);
  await expect(createProject).toHaveCount(0);
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

  const emptyPartSummary = page.locator(".selected-part-summary");
  await expect(emptyPartSummary).toContainText("Nessuno");
  await expect(
    page.getByRole("combobox", {
      name: "Ricambio richiesto 1",
      exact: true,
    }),
  ).toHaveCount(0);
  await emptyPartSummary.click();
  const partSearch = page.getByRole("combobox", {
    name: "Ricambio richiesto 1",
    exact: true,
  });
  const newPart = page.getByRole("button", { name: "Nuovo ricambio" });
  await expect(newPart).toHaveCount(0);
  await partSearch.fill("Batteria");
  await expect(newPart).toHaveCount(0);
  const productName = `Ricambio E2E ${Date.now()}`;
  await partSearch.fill(productName);
  await expect(newPart).toBeEnabled();
  await newPart.click();
  const dialog = page.getByRole("dialog", {
    name: "Nuovo ricambio per riparazione",
  });
  await expect(dialog.getByLabel("Prodotto", { exact: true })).toHaveValue(
    productName,
  );
  await expect(dialog.getByRole("button", { name: "Categoria" })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole("button", { name: "Utilizzo" })).toHaveCount(0);
  await expect(dialog.getByLabel("Costo", { exact: true })).toBeFocused();
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
  await chooseRequiredPart(page, "Batteria Test");
  const summary = page.locator(".selected-part-summary");
  await expect(summary).toContainText("Batteria Test");
  const projectSummary = page.locator(".selected-project-summary");
  expect(
    await projectSummary.or(summary).evaluateAll((elements) => {
      const [project, part] = elements;
      return Math.abs(
        project.getBoundingClientRect().width -
          part.getBoundingClientRect().width,
      );
    }),
  ).toBeLessThanOrEqual(1);
  expect(
    await summary.evaluate((part) => {
      const label = part.parentElement?.querySelector(
        ".quote-required-part-label",
      );
      return label
        ? part.getBoundingClientRect().top -
            label.getBoundingClientRect().bottom
        : 0;
    }),
  ).toBeGreaterThanOrEqual(12);
  expect(
    await page.locator(".quote-required-part-label").evaluate((label) => {
      const project = label
        .closest(".quote-item")
        ?.querySelector(".selected-project-summary");
      return project
        ? label.getBoundingClientRect().top -
            project.getBoundingClientRect().bottom
        : 0;
    }),
  ).toBeGreaterThanOrEqual(18);
  expect(
    await summary.locator(".selection-summary-icon").evaluate((icon) => {
      const iconBox = icon.getBoundingClientRect();
      const svgBox = icon.querySelector("svg")!.getBoundingClientRect();
      return Math.abs(
        iconBox.left + iconBox.width / 2 - (svgBox.left + svgBox.width / 2),
      );
    }),
  ).toBeLessThanOrEqual(1);
  await summary.hover();
  await expect(summary.locator(".summary-action svg")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 4, 0)",
  );
  await summary.locator(".selection-summary-copy").click();
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
  await summary.locator(".summary-action").click();
  await expect(search).toBeFocused();
  await search.fill(`Ricambio stile ${Date.now()}`);
  const newPart = page.getByRole("button", {
    name: "Nuovo ricambio",
    exact: true,
  });
  await expect(newPart).toBeEnabled();
  await expect(newPart).toHaveCSS("background-color", "rgb(255, 240, 168)");
  await expect(newPart).toHaveCSS("font-weight", "650");
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
  const projectSummary = page.locator(".selected-project-summary");
  await expect(projectSummary).toContainText("100,00 €");
  await projectSummary
    .getByRole("button", { name: "Cambia", exact: true })
    .click();
  await search.press("Control+A");
  await search.press("Backspace");
  await expect(search).toHaveValue("");
  await expect(price).toHaveCount(0);

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
  await expect(create).toHaveCount(0);
  await expect(page.locator(".selected-project-summary")).toContainText(name);
  await expect(page.locator(".order-step-card").nth(2)).toHaveClass(
    /is-completed/,
  );
  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.locator(".business-select-panel.is-entering")).toHaveCount(
    0,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Aggiungi intervento", exact: true })
    .click();
  const newItem = page.locator(".quote-item").nth(1);
  await newItem.hover();
  const removeItem = newItem.locator(".record-icon-delete");
  await expect(removeItem).toHaveCSS("bottom", "10px");
  expect(
    await removeItem.evaluate((button) => {
      const control = button.parentElement?.querySelector(
        ".business-combobox-control",
      );
      return control
        ? button.getBoundingClientRect().top -
            control.getBoundingClientRect().bottom
        : -1;
    }),
  ).toBeGreaterThanOrEqual(6);
  await removeItem.click();

  await chooseRequiredPart(page, "Batteria Test");
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
  await fillOrder(page, { phone, name, manual: true });
  await save(page);
  await page.goto("/customers");
  await page.getByLabel("Cerca", { exact: true }).fill(phone);
  const row = page.locator(".customer-table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(name);
  await expect(page).toHaveURL(new RegExp("q=" + phone + "$"));
  await row.getByRole("link", { name, exact: true }).click();
  let detailDialog = page.getByRole("dialog", { name });
  await expect(detailDialog).toBeVisible();
  await expect(detailDialog).toHaveClass(/form-dialog/);
  await expect(detailDialog.locator(".customer-device-row")).toHaveCount(1);
  await expect(
    detailDialog.getByRole("heading", { name: "Storico riparazioni" }),
  ).toBeVisible();
  await detailDialog.locator(".customer-summary").hover();
  await detailDialog
    .getByRole("button", { name: "Modifica cliente", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Modifica cliente" });
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
  await expect(
    detailDialog.locator(".customer-summary .customer-phone"),
  ).toHaveCount(2);
  const firstPhone = detailDialog
    .locator(".customer-summary .customer-phone")
    .first();
  const storedPhone = await firstPhone.locator("a").innerText();
  await expect(firstPhone.locator("a")).toHaveAttribute(
    "href",
    "tel:" + storedPhone,
  );
  await expect(firstPhone.getByRole("button")).toHaveCount(0);
  await detailDialog.locator(".customer-device-row").hover();
  await detailDialog
    .getByRole("button", { name: "Modifica dispositivo", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Modifica dispositivo" });
  await enterBusinessValue(page, "Modello", "Unsaved model", dialog);
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(detailDialog.locator(".customer-device-row")).not.toContainText(
    "Unsaved model",
  );
  await expect(
    detailDialog.getByRole("button", {
      name: "Modifica dispositivo",
      exact: true,
    }),
  ).toBeFocused();
  await detailDialog.locator(".customer-device-row").hover();
  await detailDialog
    .getByRole("button", { name: "Modifica dispositivo", exact: true })
    .click();
  await dialog
    .getByLabel("IMEI (facoltativo)", { exact: true })
    .fill("123456789012345");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(detailDialog.locator(".customer-device-row")).toContainText(
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
  await detailDialog.getByRole("button", { name: "Chiudi" }).click();
  await expect(detailDialog).toHaveCount(0);
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
  dialog = page.getByRole("dialog", { name: "Modifica cliente" });
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
  detailDialog = page.getByRole("dialog", { name });
  const device = detailDialog.locator(".customer-device-row");
  page.once("dialog", (dialog) => dialog.accept());
  await device.hover();
  await device
    .getByRole("button", { name: "Elimina dispositivo", exact: true })
    .click();
  await expect(device).toHaveCount(0);
  await expect(
    detailDialog.getByText("Nessun dispositivo registrato", { exact: true }),
  ).toBeVisible();
  await expect(detailDialog.locator(".table-panel tbody tr")).toHaveCount(1);
  await detailDialog.getByRole("button", { name: "Chiudi" }).click();
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
  const detailDialog = page.getByRole("dialog", { name: "Da modificare" });
  await expect(detailDialog).toBeVisible();
  const summary = detailDialog.locator(".customer-summary");
  await summary.hover();
  await summary
    .getByRole("button", { name: "Modifica cliente", exact: true })
    .click();
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Cliente modificato");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  const updatedDetailDialog = page.getByRole("dialog", {
    name: "Cliente modificato",
  });
  await expect(updatedDetailDialog).toBeVisible();
  page.once("dialog", (d) => d.accept());
  const updatedSummary = updatedDetailDialog.locator(".customer-summary");
  await updatedSummary.hover();
  await updatedSummary
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
  const detailDialog = page.getByRole("dialog", { name: "ModalCustomer" });
  await expect(detailDialog).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await detailDialog.locator(".customer-summary").hover();
  await detailDialog
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
  await expect(addFault).toBeDisabled();
  await expect(addFault).toHaveCSS("background-color", "rgb(241, 243, 242)");
  await expect(addFault).toHaveCSS("border-color", "rgb(225, 229, 227)");
  await expect(addFault).toHaveCSS("color", "rgb(154, 162, 159)");
  await expect(addFault).toHaveCSS("cursor", "not-allowed");
  await expect(addFault).toHaveCSS("opacity", "1");
  await expect(addFault).toHaveCSS("transform", "none");
  await addFault.hover();
  await expect(addFault).toHaveCSS("transform", "none");
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
  await searchInput.fill("Display");
  await expect(addFault).toBeDisabled();
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
  await addFault.evaluate((button) => {
    const states: boolean[] = [];
    const observer = new MutationObserver(() => {
      states.push((button as HTMLButtonElement).disabled);
    });
    observer.observe(button, {
      attributes: true,
      attributeFilter: ["disabled"],
    });
    Object.assign(window, {
      __faultButtonStates: states,
      __faultButtonObserver: observer,
    });
  });
  await searchInput.press("End");
  await searchInput.type(" xyz", { delay: 30 });
  await expect(addFault).toBeEnabled();
  expect(
    await page.evaluate(() => {
      const target = window as typeof window & {
        __faultButtonStates?: boolean[];
        __faultButtonObserver?: MutationObserver;
      };
      target.__faultButtonObserver?.disconnect();
      return target.__faultButtonStates ?? [];
    }),
  ).not.toContain(true);
  const finalCreatedName = `${createdName} xyz`;
  await addFault.click();
  await expect(searchInput).toHaveValue("");
  const createdRow = dialog.locator(".fault-manager-row").filter({
    hasText: finalCreatedName,
  });
  await expect(createdRow).toBeVisible();
  await createdRow.locator(".fault-name-button").dblclick();
  const createdInlineName = dialog.locator(".fault-inline-name");
  await createdInlineName.fill(`${finalCreatedName} modificato`);
  await createdInlineName.press("Enter");
  await expect(
    dialog.locator(".fault-manager-row").filter({
      hasText: `${finalCreatedName} modificato`,
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
    version: 7,
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
  const customerDetail = page.getByRole("dialog");
  await expect(customerDetail).toHaveClass(/form-dialog/);
  const dialogBox = await customerDetail.boundingBox();
  expect(dialogBox?.width).toBeGreaterThanOrEqual(900);
  expect(dialogBox?.width).toBeLessThanOrEqual(1100);
  await expect(customerDetail.locator(".customer-detail-dialog")).toHaveCSS(
    "overflow-y",
    "auto",
  );
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
  await page
    .getByRole("button", { name: "Seleziona tutti", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Seleziona tutti", exact: true })
    .click();
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
  const customerDialog = page.getByRole("dialog");
  await expect(customerDialog.locator(".customer-summary")).toBeVisible();
  await expect(
    customerDialog.locator(".eyebrow").filter({ hasText: "Area di lavoro" }),
  ).toHaveCount(0);
  await expect(
    customerDialog.getByRole("columnheader", { name: "Cliente", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".table-action")).toHaveCount(0);
  const edit = page
    .locator(".customer-detail-dialog .customer-summary")
    .getByRole("button", { name: "Modifica cliente", exact: true });
  await expect(edit).toHaveAttribute("title", "Modifica cliente");
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Modifica cliente" }),
  ).toBeVisible();
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
      fullPage: false,
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
    await page
      .getByRole("button", { name: "Seleziona tutti", exact: true })
      .click();
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
      page.locator('.customer-table input[type="checkbox"]').first(),
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

test("closing customer detail preserves list scroll and batch state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto("/customers");
  await page
    .getByRole("button", { name: "Gestisci selezione", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(scrollBefore).toBeGreaterThan(0);
  await page.locator(".customer-name .order-link").last().click();
  const detailDialog = page.getByRole("dialog");
  await expect(detailDialog.locator(".customer-detail-dialog")).toBeVisible();
  await detailDialog.getByRole("button", { name: "Chiudi" }).click();
  await expect(detailDialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Fine selezione", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.customer-table input[type="checkbox"]'),
  ).not.toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("customer name and customer row reuse the repair list hover", async ({
  page,
}) => {
  await page.goto("/customers");
  const link = page.locator(".customer-name .order-link").first();
  const row = page.locator(".customer-table tbody tr").first();
  await expect(row).toBeVisible();
  await link.hover();
  await expect(link).toHaveCSS("transform", "none");
  await expect(link.locator("svg")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 4, 0)",
  );
  await expect(row).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -1)");
  expect(
    await link
      .locator("span")
      .evaluate((element) => getComputedStyle(element, "::after").transform),
  ).toBe("matrix(1, 0, 0, 1, 0, 0)");
});

test("customer detail stays in one dialog and exposes inline device actions", async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-7);
  const name = `Cliente dialogo ${suffix}`;
  await fillOrder(page, { name, phone: `336${suffix}`, diagnosis: true });
  await save(page);
  await page.goto("/customers");

  const search = page.getByLabel("Cerca", { exact: true });
  const manage = page.getByRole("button", {
    name: "Gestisci selezione",
    exact: true,
  });
  await expect(search).toBeVisible();
  await expect(manage).toBeVisible();
  expect(
    Math.abs((await search.boundingBox())!.y - (await manage.boundingBox())!.y),
  ).toBeLessThan(2);
  await expect(
    page.getByRole("columnheader", { name: "Ultima riparazione" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Azioni" })).toHaveCount(
    0,
  );

  await manage.click();
  const selectAll = page.getByRole("checkbox", {
    name: "Seleziona tutti",
    exact: true,
  });
  await selectAll.check();
  await expect(
    page.getByRole("button", { name: /Elimina clienti selezionati/ }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Fine selezione", exact: true })
    .click();

  await search.fill(name);
  await page.getByRole("link", { name, exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Dettagli cliente",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Modifica cliente", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog
    .getByLabel("Nome e cognome", { exact: true })
    .fill(`${name} non salvato`);
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(dialog).toContainText(name);
  await expect(dialog).not.toContainText("non salvato");

  await dialog
    .getByRole("button", { name: "Nuovo dispositivo", exact: true })
    .click();
  await chooseBusinessOption(page, "Marca", "Apple", dialog);
  await chooseBusinessOption(page, "Modello", "iPhone 13", dialog);
  await dialog.getByLabel("IMEI (facoltativo)", { exact: true }).fill(suffix);
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  const added = dialog
    .locator(".customer-device-row")
    .filter({ hasText: suffix });
  await expect(added).toContainText(suffix);
  await added.hover();
  await added
    .getByRole("button", { name: "Elimina dispositivo", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Eliminare il dispositivo?",
    exact: true,
  });
  await expect(confirm).toContainText("Apple iPhone 13");
  await confirm
    .getByRole("button", { name: "Elimina dispositivo", exact: true })
    .click();
  await expect(added).toHaveCount(0);
});

test("customer links from repair list and detail open the shared dialog", async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-7);
  const name = `Cliente link ${suffix}`;
  await fillOrder(page, { name, phone: `337${suffix}`, diagnosis: true });
  await save(page);
  await page.goto("/orders");
  const row = page.locator(".order-list-body tr").filter({ hasText: name });
  await row.locator(".order-customer-link").click();
  let dialog = page.getByRole("dialog", {
    name: "Dettagli cliente",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Chiudi" }).click();
  await expect(page).toHaveURL(/\/orders/);

  await row.locator(".order-code-link").click();
  await page
    .getByRole("button", { name: /Dettagli/ })
    .first()
    .click();
  await page.locator(".order-detail-card .order-customer-link").click();
  dialog = page.getByRole("dialog", {
    name: "Dettagli cliente",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".order-detail-card").first()).toBeVisible();

  const historyRow = dialog.locator(".order-list-body tr").first();
  await historyRow.click();
  await historyRow.locator(".status-dropdown-trigger").click();
  const menu = dialog.locator(".status-dropdown-menu");
  await expect(menu).toBeVisible();
  expect(
    await menu.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    }),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await historyRow.click();
  const due = historyRow.getByLabel("Consegna prevista", { exact: true });
  await due.fill("2099-11-29");
  await due.press("Enter");
  await expect(due).toHaveCount(0);
  await expect(historyRow).toContainText("29/11/2099");
  await historyRow.click();
  const dueByClick = historyRow.getByLabel("Consegna prevista", {
    exact: true,
  });
  await dueByClick.fill("2099-11-30");
  await dialog
    .getByRole("heading", { name: "Storico riparazioni", exact: true })
    .click();
  await expect(dueByClick).toHaveCount(0);
  await expect(historyRow).toContainText("30/11/2099");
});

test("new product identifies the missing required field", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Nuovo prodotto" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Prodotto", { exact: true })
    .fill("Prodotto senza categoria");
  await dialog.getByLabel("Costo", { exact: true }).fill("1");
  await dialog.getByLabel("Prezzo", { exact: true }).fill("2");
  await dialog
    .getByRole("button", { name: "Salva prodotto", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Categoria");
});
