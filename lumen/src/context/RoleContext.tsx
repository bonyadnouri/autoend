import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { UserRole } from "../types";

interface RoleContextValue {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export const roleLabels: Record<UserRole, string> = {
  qa: "QA / SDET",
  developer: "Developer",
  "product-owner": "Product Owner",
};

export const roleDescriptions: Record<UserRole, string> = {
  qa: "Test execution, failures, coverage and re-runs",
  developer: "Reproduction steps, failed scenarios and root cause",
  "product-owner": "Journeys, missing features and UX gaps",
};

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("qa");
  const value = useMemo(() => ({ role, setRole }), [role]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
