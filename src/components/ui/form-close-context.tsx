"use client";

import { createContext } from "react";

export const FormCloseContext = createContext<(() => void) | null>(null);
