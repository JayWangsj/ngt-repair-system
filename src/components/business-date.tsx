"use client";

import { createContext, useContext, type ReactNode } from "react";
import { romeDay } from "@/lib/domain";

const BusinessDayContext = createContext<{
  today: string;
  mode: "SYSTEM" | "MANUAL";
}>({ today: "", mode: "SYSTEM" });

export function BusinessDayProvider({
  today,
  mode = "SYSTEM",
  children,
}: {
  today: string;
  mode?: "SYSTEM" | "MANUAL";
  children: ReactNode;
}) {
  return (
    <BusinessDayContext.Provider value={{ today, mode }}>
      {children}
    </BusinessDayContext.Provider>
  );
}

export function useBusinessDay() {
  return useContext(BusinessDayContext).today || romeDay();
}

export function useBusinessDayMode() {
  return useContext(BusinessDayContext).mode;
}
