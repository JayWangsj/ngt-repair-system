import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n-server";
import { LanguageProvider } from "@/components/language";
export const metadata: Metadata = {
  title: { default: "NGT · Laboratorio riparazioni", template: "%s · NGT" },
  description: "Gestione del laboratorio di riparazione",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "it"}>
      <body>
        <LanguageProvider initial={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
