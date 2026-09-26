"use server";
import { requireActor } from "@/lib/session";
import * as service from "@/lib/service";
import { BusinessError } from "@/lib/domain";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { phoneInput } from "@/lib/validation";
import { clearBusinessData } from "@/lib/data-transfer";
type Result = { ok: true; id?: string } | { ok: false; error: string };
async function execute(
  work: () => Promise<{ id?: string } | void>,
): Promise<Result> {
  try {
    const result = await work();
    revalidatePath("/", "layout");
    return { ok: true, id: result?.id };
  } catch (error) {
    if (error instanceof BusinessError)
      return { ok: false, error: error.message };
    if (
      error instanceof ZodError &&
      error.issues.some(
        (issue) =>
          issue.path[0] === "phone" ||
          issue.path[0] === "additionalPhones" ||
          issue.message.includes("telefono"),
      )
    )
      return {
        ok: false,
        error:
          error.issues.find(
            (issue) =>
              issue.path[0] === "phone" ||
              issue.path[0] === "additionalPhones" ||
              issue.message.includes("telefono"),
          )?.message ?? "Telefono non valido.",
      };
    if (error instanceof ZodError)
      return {
        ok: false,
        error: "Controlla i campi obbligatori e gli importi.",
      };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return {
        ok: false,
        error: "Record già presente. Controlla i dati e riprova.",
      };
    // Redirect errors must propagate; infrastructure errors are deliberately not logged with PII.
    if (error instanceof Error && "digest" in error) throw error;
    return {
      ok: false,
      error: "Operazione non riuscita. Aggiorna la pagina e riprova.",
    };
  }
}
export async function createOrderAction(input: unknown) {
  const actor = await requireActor();
  return execute(() => service.createOrder(actor, input));
}
export async function updateOrderAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.updateOrder(actor, id, input));
}
export async function updateDueDateAction(id: string, dueDate: string) {
  const actor = await requireActor();
  return execute(() => service.updateDueDate(actor, id, dueDate));
}
export async function quoteAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.replaceQuote(actor, id, input));
}
export async function confirmAction(id: string, note: string) {
  const actor = await requireActor();
  return execute(() => service.confirmQuote(actor, id, note));
}
export async function paymentAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.addPayment(actor, id, input));
}
export async function setPaidTotalAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.setPaidTotal(actor, id, input));
}
export async function createProductAction(input: unknown) {
  const actor = await requireActor();
  return execute(() => service.createProduct(actor, input));
}
export async function adjustInventoryAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.adjustInventory(actor, id, input));
}
export async function updateProductAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.updateProduct(actor, id, input));
}
export async function deleteProductsAction(ids: string[]) {
  const actor = await requireActor();
  return execute(() => service.deleteProducts(actor, ids));
}
export async function saveInventoryCategoryAction(input: unknown) {
  const actor = await requireActor();
  return execute(() => service.saveInventoryCategory(actor, input));
}
export async function deleteInventoryCategoryAction(id: string) {
  const actor = await requireActor();
  return execute(() => service.deleteInventoryCategory(actor, id));
}
export async function createRetailSaleAction(input: unknown) {
  const actor = await requireActor();
  return execute(() => service.createRetailSale(actor, input));
}
export async function addWorkOrderProductAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.addWorkOrderProduct(actor, id, input));
}
export async function removeWorkOrderProductAction(id: string, lineId: string) {
  const actor = await requireActor();
  return execute(() => service.removeWorkOrderProduct(actor, id, lineId));
}
export async function checkoutWorkOrderAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.checkoutWorkOrder(actor, id, input));
}
export async function statusAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.changeStatus(actor, id, input));
}
export async function ruleAction(id: string | null, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.savePriceRule(actor, id, input));
}
export async function updatePriceRuleFieldAction(
  id: string,
  field: "project" | "suggested",
  value: string,
) {
  const actor = await requireActor();
  return execute(() => service.updatePriceRuleField(actor, id, field, value));
}

export async function lookupCustomerAction(phone: string) {
  await requireActor();
  const parsed = phoneInput.safeParse(phone);
  if (!parsed.success) return null;
  return db.customer.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { phone: parsed.data },
        { phones: { some: { phone: parsed.data } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      consentAt: true,
      phones: { select: { phone: true } },
      devices: {
        where: { deletedAt: null },
        select: {
          id: true,
          category: true,
          brand: true,
          series: true,
          model: true,
          imei: true,
          appearance: true,
          accessories: true,
        },
      },
    },
  });
}

export async function customerAction(id: string | null, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.saveCustomer(actor, id, input));
}
export async function deleteCustomerAction(id: string) {
  const actor = await requireActor();
  return execute(() => service.deleteCustomer(actor, id));
}
export async function deleteCustomersAction(ids: string[]) {
  const actor = await requireActor();
  return execute(() => service.deleteCustomers(actor, ids));
}
export async function deviceAction(id: string, input: unknown) {
  const actor = await requireActor();
  return execute(() => service.saveDevice(actor, id, input));
}
export async function deleteDeviceAction(id: string) {
  const actor = await requireActor();
  return execute(() => service.deleteDevice(actor, id));
}
export async function deleteRulesAction(ids: string[]) {
  const actor = await requireActor();
  return execute(() => service.deletePriceRules(actor, ids));
}
export async function hideFaultAction(category: string, name: string) {
  const actor = await requireActor();
  return execute(() => service.hideFault(actor, category, name));
}
export async function restoreFaultAction(category: string, name: string) {
  const actor = await requireActor();
  return execute(() => service.restoreFault(actor, category, name));
}
export async function clearDataAction() {
  const actor = await requireActor();
  return execute(() => clearBusinessData(actor));
}
