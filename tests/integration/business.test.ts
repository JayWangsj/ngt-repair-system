import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  addPayment,
  changeStatus,
  confirmQuote,
  createOrder,
  createUser,
  orderInclude,
  replaceQuote,
  savePriceRule,
  setUserEnabled,
  updateOrder,
} from "@/lib/service";
import { balance, type Actor } from "@/lib/domain";
let owner: Actor;
let staff: Actor;
function input(patch: Record<string, unknown> = {}) {
  return {
    requestId: randomUUID(),
    customerName: "Test Cliente",
    phone: "333 123 4567",
    privacyConsent: true,
    brand: "Apple",
    series: "iPhone",
    model: "iPhone 13",
    fault: "Display rotto",
    dueDate: "2026-10-01",
    items: [{ project: "Display", final: "100", adjustmentReason: "" }],
    deposit: "20",
    method: "CASH",
    confirmed: true,
    ...patch,
  };
}
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test"))
    throw new Error("Integration tests require an isolated *_test database.");
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.statusHistory.deleteMany();
  await db.workOrderItem.deleteMany();
  await db.workOrder.deleteMany();
  await db.device.deleteMany();
  await db.customer.deleteMany();
  await db.priceRule.deleteMany();
  await db.user.deleteMany();
  owner = await db.user.create({
    data: {
      name: "Titolare",
      email: "owner@test.it",
      passwordHash: "test-only",
      role: "OWNER",
    },
  });
  staff = await db.user.create({
    data: {
      name: "Tecnico",
      email: "staff@test.it",
      passwordHash: "test-only",
      role: "STAFF",
    },
  });
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.statusHistory.deleteMany();
  await db.workOrderItem.deleteMany();
  await db.workOrder.deleteMany();
  await db.device.deleteMany();
  await db.customer.deleteMany();
  await db.priceRule.deleteMany();
  await db.user.updateMany({ data: { enabled: true } });
  await savePriceRule(owner, null, {
    brand: "Apple",
    model: "iPhone 13",
    project: "Display",
    suggested: "100",
    minutes: 60,
    enabled: true,
  });
});
afterAll(() => db.$disconnect());
describe("PostgreSQL workflow", () => {
  it("registers, quotes, receives balance, delivers and audits every change", async () => {
    const created = await createOrder(staff, input());
    await changeStatus(staff, created.id, { status: "DIAGNOSING" });
    await changeStatus(staff, created.id, { status: "REPAIRING" });
    await changeStatus(staff, created.id, { status: "READY" });
    await addPayment(staff, created.id, {
      requestId: randomUUID(),
      amount: "80",
      method: "CARD",
      kind: "BALANCE",
    });
    await changeStatus(staff, created.id, {
      status: "COMPLETED",
      pickedUpBy: "Cliente",
    });
    const order = await db.workOrder.findUniqueOrThrow({
      where: { id: created.id },
      include: orderInclude,
    });
    expect(order.status).toBe("COMPLETED");
    expect(order.pickedUpAt).not.toBeNull();
    expect(order.history).toHaveLength(5);
    expect(order.payments).toHaveLength(2);
    expect(balance(order.items, order.payments)).toBe(0);
    expect(order.device.customer.phone).toBe("+393331234567");
    expect(order.device.customer.consentVersion).toBe("1.0");
    expect(order.items[0].matchLevel).toBe("MODEL");
    expect(
      await db.auditLog.count({
        where: { entityId: order.id, action: "ORDER_DELIVERED" },
      }),
    ).toBe(1);
  });
  it("preserves quote and operator snapshots after list and staff changes", async () => {
    const created = await createOrder(staff, input());
    await db.priceRule.updateMany({ data: { suggested: "150" } });
    await db.user.update({
      where: { id: staff.id },
      data: { name: "New name" },
    });
    const order = await db.workOrder.findUniqueOrThrow({
      where: { id: created.id },
      include: orderInclude,
    });
    expect(order.items[0].suggested?.toString()).toBe("100");
    expect(order.history[0].actorName).toBe("Tecnico");
    expect(order.payments[0].actorName).toBe("Tecnico");
    await db.user.update({
      where: { id: staff.id },
      data: { name: "Tecnico" },
    });
  });
  it("rolls back all customer and device changes on invalid deposit", async () => {
    await expect(createOrder(staff, input({ deposit: "101" }))).rejects.toThrow(
      "acconto",
    );
    expect(await db.customer.count()).toBe(0);
    expect(await db.device.count()).toBe(0);
    expect(await db.workOrder.count()).toBe(0);
    expect(await db.statusHistory.count()).toBe(0);
  });
  it("blocks staff or implicit owner delivery while unpaid, allows explicit owner", async () => {
    const created = await createOrder(staff, input());
    await changeStatus(staff, created.id, { status: "REPAIRING" });
    await changeStatus(staff, created.id, { status: "READY" });
    await expect(
      changeStatus(staff, created.id, {
        status: "COMPLETED",
        pickedUpBy: "Cliente",
        override: true,
      }),
    ).rejects.toThrow("titolare");
    await expect(
      changeStatus(owner, created.id, {
        status: "COMPLETED",
        pickedUpBy: "Cliente",
      }),
    ).rejects.toThrow("titolare");
    expect(
      (await db.workOrder.findUniqueOrThrow({ where: { id: created.id } }))
        .status,
    ).toBe("READY");
    await changeStatus(owner, created.id, {
      status: "COMPLETED",
      pickedUpBy: "Cliente",
      override: true,
    });
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityId: created.id, action: "ORDER_DELIVERED" },
    });
    expect(log.context).toMatchObject({
      unpaidOverride: true,
      balance: "80.00",
    });
    await addPayment(staff, created.id, {
      requestId: randomUUID(),
      amount: "80",
      method: "TRANSFER",
      kind: "BALANCE",
    });
  });
  it("requires customer confirmation before repair and resets confirmation after repricing", async () => {
    const order = await createOrder(staff, input({ confirmed: false }));
    await expect(
      changeStatus(staff, order.id, { status: "REPAIRING" }),
    ).rejects.toThrow("conferma");
    await confirmQuote(staff, order.id, "Confermato in negozio");
    await changeStatus(staff, order.id, { status: "REPAIRING" });
    await replaceQuote(staff, order.id, [
      { project: "Display", final: "90", adjustmentReason: "Sconto" },
    ]);
    const updated = await db.workOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(updated.confirmedAt).toBeNull();
    expect(updated.items[0].final.toString()).toBe("90");
    await expect(
      changeStatus(staff, order.id, { status: "READY" }),
    ).rejects.toThrow("conferma");
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "QUOTE_UPDATED" },
    });
    expect(log.context).toMatchObject({
      before: [{ final: "100" }],
      after: [{ final: "90.00" }],
    });
  });
  it("prevents quote below collected money", async () => {
    const order = await createOrder(staff, input());
    await expect(
      replaceQuote(staff, order.id, [
        { project: "Display", final: "10", adjustmentReason: "Sconto" },
      ]),
    ).rejects.toThrow("inferiore");
    expect(
      (
        await db.workOrderItem.findFirstOrThrow({
          where: { orderId: order.id },
        })
      ).final.toString(),
    ).toBe("100");
  });
  it("requires manual reason, allows owner to save a new rule, denies staff", async () => {
    await expect(
      createOrder(
        staff,
        input({ items: [{ project: "Camera", final: "50" }] }),
      ),
    ).rejects.toThrow("motivo");
    await expect(
      createOrder(
        staff,
        input({
          items: [
            {
              project: "Camera",
              final: "50",
              adjustmentReason: "Manuale",
              saveRule: true,
            },
          ],
        }),
      ),
    ).rejects.toThrow("titolare");
    const created = await createOrder(
      owner,
      input({
        items: [
          {
            project: "Camera",
            final: "50",
            adjustmentReason: "Manuale",
            saveRule: true,
          },
        ],
      }),
    );
    expect(
      (
        await db.workOrderItem.findFirstOrThrow({
          where: { orderId: created.id },
        })
      ).suggested,
    ).toBeNull();
    expect(await db.priceRule.count({ where: { project: "camera" } })).toBe(1);
  });
  it("blocks overpayment, zero and negative amounts", async () => {
    const order = await createOrder(staff, input());
    for (const amount of ["81", "0", "-1"])
      await expect(
        addPayment(staff, order.id, {
          requestId: randomUUID(),
          amount,
          kind: "BALANCE",
          method: "CASH",
        }),
      ).rejects.toThrow();
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  });
  it("makes repeated payment requests idempotent and detects altered replay", async () => {
    const order = await createOrder(staff, input());
    const payment = {
      requestId: randomUUID(),
      amount: "20",
      kind: "BALANCE",
      method: "CASH",
    };
    const first = await addPayment(staff, order.id, payment);
    const second = await addPayment(staff, order.id, payment);
    expect(first.id).toBe(second.id);
    await expect(
      addPayment(staff, order.id, { ...payment, amount: "21" }),
    ).rejects.toThrow("già utilizzata");
    expect(await db.payment.count()).toBe(2);
  });
  it("serializes concurrent payments to prevent overcollection", async () => {
    const order = await createOrder(staff, input());
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        addPayment(staff, order.id, {
          requestId: randomUUID(),
          amount: "60",
          kind: "BALANCE",
          method: "CARD",
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const updated = await db.workOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: orderInclude,
    });
    expect(balance(updated.items, updated.payments)).toBe(2000);
  });
  it("reuses the customer and device and prevents attaching another customer's device", async () => {
    const one = await createOrder(staff, input());
    const first = await db.workOrder.findUniqueOrThrow({
      where: { id: one.id },
    });
    await createOrder(staff, input({ deviceId: first.deviceId }));
    expect(await db.customer.count()).toBe(1);
    expect(await db.device.count()).toBe(1);
    await expect(
      createOrder(
        staff,
        input({ phone: "3339876543", deviceId: first.deviceId }),
      ),
    ).rejects.toThrow("non appartiene");
    expect(await db.customer.count()).toBe(1);
  });
  it("retries order creation without duplicate order or deposit", async () => {
    const data = input();
    const one = await createOrder(staff, data);
    const two = await createOrder(staff, data);
    expect(one.id).toBe(two.id);
    expect(await db.payment.count()).toBe(1);
  });
  it("rejects invalid state changes without a history entry", async () => {
    const order = await createOrder(staff, input());
    await expect(
      changeStatus(staff, order.id, {
        status: "COMPLETED",
        pickedUpBy: "Cliente",
      }),
    ).rejects.toThrow();
    expect(await db.statusHistory.count()).toBe(1);
  });
  it("edits daily details and prohibits closed-order edits", async () => {
    const order = await createOrder(staff, input({ deposit: "0" }));
    await updateOrder(staff, order.id, {
      fault: "Nuovo problema",
      notes: "Note",
      dueDate: "2026-11-01",
    });
    await changeStatus(staff, order.id, { status: "CANCELLED" });
    await expect(
      updateOrder(staff, order.id, { fault: "Edit" }),
    ).rejects.toThrow("chiusa");
  });
  it("prevents cancellation with retained payments", async () => {
    const order = await createOrder(staff, input());
    await expect(
      changeStatus(staff, order.id, { status: "CANCELLED" }),
    ).rejects.toThrow("rimborso");
  });
});
describe("server-side access control", () => {
  it("rejects staff list and employee administration", async () => {
    await expect(
      savePriceRule(staff, null, {
        project: "Battery",
        suggested: "30",
        minutes: 30,
        enabled: true,
      }),
    ).rejects.toThrow("titolare");
    await expect(
      createUser(staff, {
        name: "Forbidden",
        email: "no@test.it",
        password: "test-password-123",
        role: "OWNER",
      }),
    ).rejects.toThrow("titolare");
    await expect(setUserEnabled(staff, owner.id, false)).rejects.toThrow(
      "titolare",
    );
  });
  it("checks fresh database roles instead of trusting supplied role", async () => {
    await expect(
      savePriceRule({ ...staff, role: "OWNER" }, null, {
        project: "Battery",
        suggested: "30",
        minutes: 30,
        enabled: true,
      }),
    ).rejects.toThrow("titolare");
  });
  it("revokes disabled staff immediately and prevents self-disable", async () => {
    await setUserEnabled(owner, staff.id, false);
    await expect(createOrder(staff, input())).rejects.toThrow("Sessione");
    await expect(setUserEnabled(owner, owner.id, false)).rejects.toThrow(
      "account",
    );
  });
  it("creates employees with hashed passwords only", async () => {
    const result = await createUser(owner, {
      name: "New",
      email: `new-${randomUUID()}@test.it`,
      password: "strong-test-password",
      role: "STAFF",
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: result.id } });
    expect(user.passwordHash).not.toBe("strong-test-password");
    expect(user.passwordHash).toMatch(/^\$2/);
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityId: result.id },
    });
    expect(JSON.stringify(log.context)).not.toContain("password");
  });
});
