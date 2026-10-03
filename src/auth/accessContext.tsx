"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { setDashboardUserEmail } from "@/lib/dashboardApi";

export type AccessContextValue = {
  email: string;
  canEdit: boolean;
};

const AccessContext = createContext<AccessContextValue>({
  email: "",
  canEdit: false,
});

export function AccessProvider({
  email,
  canEdit,
  children,
}: AccessContextValue & { children: ReactNode }) {
  useLayoutEffect(() => {
    setDashboardUserEmail(email);
    return () => {
      setDashboardUserEmail("");
    };
  }, [email]);

  return (
    <AccessContext.Provider value={{ email, canEdit }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess(): AccessContextValue {
  return useContext(AccessContext);
}
