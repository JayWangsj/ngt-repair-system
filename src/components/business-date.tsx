"use client";

import { createContext, useContext, type ReactNode } from "react";
import { romeDay } from "@/lib/domain";

const BusinessDayContext = createContext("");

export function BusinessDayProvider({
  today,
  children,
}: {
  today: string;
  children: ReactNode;
}) {
  return (
    <BusinessDayContext.Provider value={today}>
      {children}
    </BusinessDayContext.Provider>
  );
}

export function useBusinessDay() {
  return useContext(BusinessDayContext) || romeDay();
}
