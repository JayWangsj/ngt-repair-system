import { test, expect, type Page } from "@playwright/test";
async function fillOrder(
  page: Page,
  options: { manual?: boolean; discount?: boolean; phone?: string } = {},
) {
  await page.goto("/orders/new");
  await page
    .getByLabel("Telefono", { exact: true })
    .fill(options.phone ?? `333${Date.now().toString().slice(-7)}`);
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Cliente Playwright");
  await page.getByLabel("Marca", { exact: true }).fill("Apple");
  await page.getByLabel("Modello", { exact: true }).fill("iPhone 13");
  await page.getByLabel("Display rotto", { exact: true }).check();
  await page
    .getByLabel("Intervento 1", { exact: true })
    .fill(options.manual ? `Fotocamera ${Date.now()}` : "sostituzione display");
  if (options.manual)
    await page.getByLabel("Prezzo originale (€) 1", { exact: true }).fill("75");
  else
    await expect(
      page.getByLabel("Prezzo originale (€) 1", { exact: true }),
    ).toHaveValue("100");
  if (options.discount) {
    await page
      .getByRole("button", { name: "Aggiungi sconto intervento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Aggiungi sconto scheda", exact: true })
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
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Crea scheda", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/(?!new)[a-z0-9]+$/);
}
async function state(page: Page, next: string) {
  await page.getByLabel("Nuovo stato", { exact: true }).selectOption(next);
  await page
    .getByRole("button", { name: "Aggiorna stato", exact: true })
    .click();
  await expect(page.locator(".detail-status .badge")).toContainText(
    next === "REPAIRING" ? "In riparazione" : "Da ritirare",
  );
}
test("single operator opens every business page without login", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/orders",
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
test("creates automatic quote, receives payment and delivers", async ({
  page,
}) => {
  await fillOrder(page);
  await page
    .getByLabel("Registra un pagamento adesso", { exact: true })
    .check();
  await page
    .getByLabel("Incasso alla creazione (€)", { exact: true })
    .fill("20");
  await save(page);
  await expect(page.locator(".balance-card>strong")).toContainText("80,00");
  await state(page, "REPAIRING");
  await state(page, "READY");
  await expect(
    page.locator('select[name="kind"] option[value="DEPOSIT"]'),
  ).toHaveCount(0);
  await page.getByLabel("Importo (€)", { exact: true }).fill("80");
  await page
    .getByRole("button", { name: "Registra incasso", exact: true })
    .click();
  await expect(page.locator(".balance-card>strong")).toContainText("0,00");
  await page
    .getByLabel("Nuovo stato", { exact: true })
    .selectOption("COMPLETED");
  await expect(
    page.getByLabel("Nome di chi ritira", { exact: true }),
  ).toHaveValue("Cliente Playwright");
  await page
    .getByRole("button", { name: "Consegna dispositivo", exact: true })
    .click();
  await expect(page.locator(".detail-status .badge")).toHaveText("Consegnato");
  await page.getByRole("link", { name: "Cliente ↗", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Storico riparazioni" }),
  ).toBeVisible();
});
test("discount and IVA persist without polluting historical prices", async ({
  page,
}) => {
  await fillOrder(page, { discount: true });
  await expect(page.locator(".quote-summary")).toContainText("103,70");
  await page
    .getByLabel("Registra un pagamento adesso", { exact: true })
    .check();
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
  await page.getByLabel("Marca", { exact: true }).fill("Apple");
  await page.getByLabel("Modello", { exact: true }).fill("iPhone 13");
  await page
    .getByLabel("Intervento 1", { exact: true })
    .fill("sostituzione display");
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
test("unpaid delivery requires explicit acknowledgement", async ({ page }) => {
  await fillOrder(page);
  await save(page);
  await state(page, "REPAIRING");
  await state(page, "READY");
  await page
    .getByLabel("Nuovo stato", { exact: true })
    .selectOption("COMPLETED");
  await page.getByLabel("Nome di chi ritira", { exact: true }).fill("Cliente");
  await page
    .getByRole("button", { name: "Consegna dispositivo", exact: true })
    .click();
  await expect(page.locator(".detail-status .badge")).toHaveText("Da ritirare");
  await page
    .getByLabel("Autorizzo la consegna con saldo aperto", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Consegna dispositivo", exact: true })
    .click();
  await expect(page.locator(".detail-status .badge")).toHaveText("Consegnato");
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
  await form
    .getByLabel("Intervento", { exact: true })
    .fill(`pulizia ${Date.now()}`);
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

test("confirms a new customer with three numbers and selects that customer by name", async ({
  page,
}) => {
  const phone = "336" + Date.now().toString().slice(-7);
  await page.goto("/orders/new");
  await page.getByLabel("Telefono", { exact: true }).fill(phone);
  await page.getByLabel("Nome e cognome", { exact: true }).fill("Tre telefoni");
  await page
    .getByRole("button", { name: "Aggiungi telefono", exact: true })
    .click();
  await page
    .getByLabel("Telefono 2", { exact: true })
    .fill("337" + phone.slice(3));
  await page
    .getByRole("button", { name: "Aggiungi telefono", exact: true })
    .click();
  await page
    .getByLabel("Telefono 3", { exact: true })
    .fill("338" + phone.slice(3));
  await expect(
    page.getByRole("button", { name: "Aggiungi telefono", exact: true }),
  ).toBeDisabled();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Conferma cliente", exact: true })
    .click();
  await expect(
    page.getByText("Dati cliente confermati", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByLabel("Seleziona Nome e cognome", { exact: true })
    .selectOption({ label: "Tre telefoni · +39" + phone });
  await expect(page.getByLabel("Telefono", { exact: true })).toHaveValue(
    "+39" + phone,
  );
  await expect(page.getByLabel("Telefono 3", { exact: true })).toHaveValue(
    "+39338" + phone.slice(3),
  );
  await page.goto("/orders/new");
  await page
    .getByLabel("Telefono", { exact: true })
    .fill("337" + phone.slice(3));
  await expect(page.getByLabel("Nome e cognome", { exact: true })).toHaveValue(
    "Tre telefoni",
  );
});
test("native quote choices populate prices, clear on model changes and discounts are optional", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await page
    .getByLabel("Tipo dispositivo", { exact: true })
    .selectOption("TABLET");
  await page
    .getByLabel("Seleziona Marca", { exact: true })
    .selectOption("Apple");
  await expect(
    page
      .getByLabel("Seleziona Modello", { exact: true })
      .locator('option[value="iPhone 13"]'),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("Seleziona Modello", { exact: true })
      .locator('option[value^="iPad"]'),
  ).not.toHaveCount(0);
  await page
    .getByLabel("Tipo dispositivo", { exact: true })
    .selectOption("PHONE");
  await page
    .getByLabel("Seleziona Marca", { exact: true })
    .selectOption("Apple");
  await page
    .getByLabel("Seleziona Modello", { exact: true })
    .selectOption("iPhone 13");
  await page
    .getByLabel("Seleziona Intervento 1", { exact: true })
    .selectOption("sostituzione display");
  await expect(
    page.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveValue("100");
  await expect(
    page.getByLabel("Sconto intervento (€) 1", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Sconto aggiuntivo sulla scheda (€)", { exact: true }),
  ).toHaveCount(0);
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
  await expect(page.locator(".quote-summary")).toContainText("100,00");
  await page.getByLabel("Modello", { exact: true }).fill("Unknown model");
  await expect(page.getByLabel("Intervento 1", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Prezzo originale (€) 1", { exact: true }),
  ).toHaveValue("");
  await expect(
    page
      .getByLabel("Seleziona Intervento 1", { exact: true })
      .locator("option"),
  ).toHaveCount(1);
  await expect(
    page.getByText("Altri dettagli (facoltativi)", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Modello", { exact: true }).fill("iphone18promax");
  await page.getByLabel("Modello", { exact: true }).blur();
  await expect(page.getByLabel("Modello", { exact: true })).toHaveValue(
    "iPhone 18 Pro Max",
  );
});

test("customer list searches instantly, preserves navigation and supports compact editing", async ({
  page,
  context,
}) => {
  const phone = "336" + Date.now().toString().slice(-7);
  const extra = "337" + Date.now().toString().slice(-7);
  const name =
    "Cliente interfaccia molto lungo per verifica della disposizione";
  await fillOrder(page, { phone });
  await page.getByLabel("Nome e cognome", { exact: true }).fill(name);
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
  await expect(page.locator("main input")).toHaveCount(0);
  await expect(page.locator(".customer-device-row")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Storico riparazioni" }),
  ).toBeVisible();
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
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const firstPhone = page.locator(".customer-summary .customer-phone").first();
  const storedPhone = await firstPhone.locator("a").innerText();
  await firstPhone.getByRole("button").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(storedPhone);
  await expect(firstPhone.locator("a")).toHaveAttribute(
    "href",
    "tel:" + storedPhone,
  );
  await page
    .getByRole("button", { name: "Modifica dispositivo", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Modello", { exact: true }).fill("Unsaved model");
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.locator(".customer-device-row")).not.toContainText(
    "Unsaved model",
  );
  await expect(
    page.getByRole("button", { name: "Modifica dispositivo", exact: true }),
  ).toBeFocused();
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
  await row.getByRole("button", { name: /^Altre azioni/ }).click();
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
    row.getByRole("button", { name: /^Altre azioni/ }),
  ).toBeFocused();
  await row.getByRole("button", { name: /^Altre azioni/ }).click();
  await page.keyboard.press("Escape");
  await expect(
    row.getByRole("button", { name: /^Altre azioni/ }),
  ).toHaveAttribute("aria-expanded", "false");
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
  await device.getByRole("button", { name: /^Altre azioni/ }).click();
  page.once("dialog", (d) => d.accept());
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
  await row.getByRole("button", { name: /^Altre azioni/ }).click();
  page.once("dialog", (d) => d.dismiss());
  await row
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /^Altre azioni/ }).click();
  page.once("dialog", (d) => d.accept());
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
  await page
    .getByRole("button", { name: "Modifica cliente", exact: true })
    .click();
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Cliente modificato");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Cliente modificato");
  await page
    .getByRole("button", { name: /^Altre azioni/ })
    .first()
    .click();
  page.once("dialog", (d) => d.accept());
  await page
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
  await page
    .getByRole("button", { name: /^Altre azioni/ })
    .first()
    .click();
  page.once("dialog", (d) => d.accept());
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
  await dialog
    .getByLabel("Tipo dispositivo", { exact: true })
    .selectOption("SMARTWATCH");
  await dialog.getByLabel("Marca", { exact: true }).fill("Apple");
  await dialog.getByLabel("Modello", { exact: true }).fill("Watch Modal");
  await dialog.getByLabel("Intervento", { exact: true }).fill("Test battery");
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("bad");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Modello", { exact: true })).toHaveValue(
    "Watch Modal",
  );
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
    dialog.getByLabel("Tipo dispositivo", { exact: true }),
  ).toHaveValue("SMARTWATCH");
  await expect(dialog.getByLabel("Marca", { exact: true })).toHaveValue(
    "Apple",
  );
  await expect(dialog.getByLabel("Modello", { exact: true })).toHaveValue(
    "Watch Modal",
  );
  await dialog.getByLabel("Intervento", { exact: true }).fill("Test screen");
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("70");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(model.locator("article")).toHaveCount(2);
  await page.getByLabel("Cerca", { exact: true }).fill("Test battery");
  await expect(page.locator(".rule-list > article")).toHaveCount(1);
  await page.getByRole("button", { name: "Modifica", exact: true }).click();
  await page.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("45");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.locator(".rule-price")).toContainText("45,00");
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
  await page
    .getByRole("dialog")
    .getByLabel("Tipo dispositivo", { exact: true })
    .selectOption("SMARTBAND");
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

test("removes a saved fault and keeps it removed after reload", async ({
  page,
}) => {
  await page.goto("/orders/new");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Elimina problema Display rotto",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Display rotto", { exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByLabel("Display rotto", { exact: true })).toHaveCount(
    0,
  );
});

test("compact price rows support editing, selection and dismissible actions on mobile", async ({
  page,
}) => {
  await page.goto("/prices");
  await page.getByLabel("Cerca", { exact: true }).fill("iPhone 13");
  const rows = page.locator(".price-rule-row");
  const row = rows.first();
  await expect(row).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Elimina preventivo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nuova regola", exact: true }),
  ).toHaveCount(1);
  const originalPrice = await row.locator(".rule-price").innerText();
  const edit = row.getByRole("button", { name: "Modifica", exact: true });
  await edit.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("999");
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(edit).toBeFocused();
  await expect(row.locator(".rule-price")).toHaveText(originalPrice);
  await edit.click();
  await dialog.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("bad");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  const longName =
    "Sostituzione componente con descrizione molto lunga per verifica mobile";
  await dialog.getByLabel("Intervento", { exact: true }).fill(longName);
  await dialog
    .getByLabel("Prezzo suggerito (€)", { exact: true })
    .fill("123.45");
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("Cerca", { exact: true })).toHaveValue(
    "iPhone 13",
  );
  const changed = rows.filter({ hasText: longName });
  await expect(changed.locator(".price-rule-name")).toHaveCount(1);
  await expect(changed.locator(".rule-price")).toContainText("123,45");
  const more = changed.getByRole("button", { name: /^Altre azioni/ });
  await more.click();
  await expect(
    changed.getByRole("button", { name: "Elimina preventivo", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await page.locator("h1").click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
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
  await expect(
    changed.getByRole("button", { name: "Modifica", exact: true }),
  ).toBeInViewport();
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
  const before = await page.locator(".rule-list > article").count();
  expect(before).toBeGreaterThan(1);
  await page
    .getByRole("button", { name: /^Altre azioni/ })
    .first()
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Elimina preventivo", exact: true })
    .first()
    .click();
  await expect(page.locator(".rule-list > article")).toHaveCount(before - 1);
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
  const exported = await page.request.get("/api/data/export");
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-disposition"]).toContain("ngt-backup-");
  const backup = await exported.json();
  expect(backup).toMatchObject({
    format: "ngt-repair-data",
    version: 1,
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
      await expect(dialog.locator("input, select").first()).toBeFocused();
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
