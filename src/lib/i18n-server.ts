import { cookies } from "next/headers";
import { localeOf, messages } from "./i18n";
export async function getLocale() {
  return localeOf((await cookies()).get("ngt-locale")?.value);
}
export async function getMessages() {
  return messages[await getLocale()];
}
