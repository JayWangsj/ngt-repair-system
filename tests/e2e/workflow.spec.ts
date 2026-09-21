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
  for (const path of ["/", "/orders", "/customers", "/prices", "/reports"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page).not.toHaveURL(/login/);
  }
  await expect(
    page.getByRole("link", { name: "Collaboratori", exact: true }),
  ).toHaveCount(0);
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
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "报价", exact: true }),
  ).toBeVisible();
  await page.getByLabel("金额（€）", { exact: true }).fill("84");
  await page.getByRole("button", { name: "登记收款", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "超过待收余额",
  );
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
test("language switching preserves unsaved form, custom fault, and preference", async ({
  page,
}) => {
  const phone = `334${Date.now().toString().slice(-7)}`;
  await fillOrder(page, { phone, discount: true });
  const fault = `Raro ${Date.now()}`;
  await page
    .getByLabel("Altro problema: scrivi e aggiungi", { exact: true })
    .fill(fault);
  await page
    .getByRole("button", { name: "Aggiungi problema", exact: true })
    .click();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "新建维修单", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("电话号码", { exact: true })).toHaveValue(phone);
  await expect(page.getByLabel("姓名", { exact: true })).toHaveValue(
    "Cliente Playwright",
  );
  await expect(page.getByLabel("单项优惠（€） 1", { exact: true })).toHaveValue(
    "10",
  );
  await expect(page.getByLabel(fault, { exact: true })).toBeChecked();
  await expect(page.getByLabel("屏幕破裂", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Italiano", exact: true }).click();
  await save(page);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.goto("/orders/new");
  await expect(page.getByLabel(fault, { exact: true })).toBeVisible();
  await page.getByLabel("电话号码", { exact: true }).fill(phone);
  await expect(page.getByLabel("姓名", { exact: true })).toHaveValue(
    "Cliente Playwright",
  );
  await page
    .getByLabel("客户已有设备", { exact: true })
    .selectOption({ index: 1 });
  await expect(page.getByLabel("型号", { exact: true })).toHaveValue(
    "iPhone 13",
  );
  await page.screenshot({
    path: "test-results/chinese-new-order.png",
    fullPage: true,
  });
  await page.getByLabel("电话号码", { exact: true }).fill("3359988776");
  await expect(page.getByLabel("型号", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("姓名", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("客户已有设备", { exact: true })).toHaveCount(0);
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
  await page.getByText("Nuova regola", { exact: true }).click();
  const form = page.locator("details").first();
  await form
    .getByLabel("Intervento", { exact: true })
    .fill(`pulizia ${Date.now()}`);
  await form.getByLabel("Prezzo suggerito (€)", { exact: true }).fill("15");
  await form.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(form.getByRole("status")).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Oggi in laboratorio", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "中文", exact: true }).click();
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
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Conferma cliente", exact: true })
    .click();
  await expect(
    page.getByText("Dati cliente confermati", { exact: true }),
  ).toHaveCount(0);
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
    .getByLabel("Seleziona Marca", { exact: true })
    .selectOption("apple");
  await page
    .getByLabel("Seleziona Modello", { exact: true })
    .selectOption("iphone 13");
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
});
test("customer page adds, edits and deletes a customer", async ({ page }) => {
  const phone = "339" + Date.now().toString().slice(-7);
  await page.goto("/customers");
  await page.getByRole("link", { name: "Nuovo cliente", exact: true }).click();
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Da modificare");
  await page.getByLabel("Telefono", { exact: true }).fill(phone);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/customers\/(?!new)[a-z0-9]+$/);
  await page
    .getByLabel("Nome e cognome", { exact: true })
    .fill("Cliente modificato");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Cliente modificato");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Elimina cliente", exact: true })
    .click();
  await expect(page).toHaveURL(/customers$/);
  await expect(
    page.getByRole("link", { name: "Cliente modificato", exact: true }),
  ).toHaveCount(0);
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
test("price editor supports individual and batch deletion", async ({
  page,
}) => {
  await page.goto("/prices");
  const before = await page.locator(".rule-list > article").count();
  expect(before).toBeGreaterThan(1);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Elimina preventivo", exact: true })
    .first()
    .click();
  await expect(page.locator(".rule-list > article")).toHaveCount(before - 1);
  await page.getByLabel("Seleziona tutti", { exact: true }).check();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: /Elimina preventivi selezionati/ })
    .click();
  await expect(page.locator(".rule-list > article")).toHaveCount(0);
});
