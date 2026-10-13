"use client";

import { createContext } from "react";

export const FormCloseContext = createContext<(() => void) | null>(null);
export type FormSaveRegistration = {
  save: () => Promise<boolean>;
  isDirty: () => boolean;
};
export const FormSaveContext = createContext<
  ((registration: FormSaveRegistration) => () => void) | null
>(null);
