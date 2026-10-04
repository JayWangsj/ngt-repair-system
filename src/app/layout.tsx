import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n-server";
import { LanguageProvider } from "@/components/language";
import { ComfortableScrollManager } from "@/components/comfortable-scroll-manager";
import { MOTION_PREFERENCE_KEY } from "@/lib/motion-preference";

const motionPreferenceScript = `try{if(localStorage.getItem(${JSON.stringify(
  MOTION_PREFERENCE_KEY,
)})==="always")document.documentElement.dataset.motion="always"}catch{}`;

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
    <html lang={locale === "zh" ? "zh-CN" : "it"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionPreferenceScript }} />
      </head>
      <body>
        <LanguageProvider initial={locale}>
          <ComfortableScrollManager />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
