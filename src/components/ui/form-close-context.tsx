"use client";

import { createContext } from "react";

export const FormCloseContext = createContext<(() => void) | null>(null);
export const FormAutoSaveContext = createContext<
  ((save: () => Promise<boolean>) => () => void) | null
>(null);
