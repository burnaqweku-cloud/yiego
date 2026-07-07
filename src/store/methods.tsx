import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Saved funding/payout methods — managed on the Wallet page, used by the
 *  Add Money and Withdraw flows. */

export interface FundingMethod {
  id: string;
  kind: "momo" | "card";
  name: string;
  detail: string;
}

const STORAGE_KEY = "yiego_methods_v1";

const SEED: { methods: FundingMethod[]; defaultId: string } = {
  methods: [
    { id: "m1", kind: "momo", name: "MTN Mobile Money", detail: "024 ••• 221" },
    { id: "m2", kind: "card", name: "Visa card", detail: "•••• 4429" },
  ],
  defaultId: "m1",
};

interface MethodsValue {
  methods: FundingMethod[];
  defaultId: string;
  addMethod: (kind: FundingMethod["kind"], name: string, detail: string) => void;
  removeMethod: (id: string) => void;
  setDefault: (id: string) => void;
}

const MethodsContext = createContext<MethodsValue | null>(null);

function load(): { methods: FundingMethod[]; defaultId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.methods) && p.methods.length > 0 && typeof p.defaultId === "string") {
        return p;
      }
    }
  } catch {
    /* reseed */
  }
  return SEED;
}

export function MethodsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* non-fatal */
    }
  }, [state]);

  return (
    <MethodsContext.Provider
      value={{
        methods: state.methods,
        defaultId: state.defaultId,
        addMethod: (kind, name, detail) =>
          setState((s) => ({
            ...s,
            methods: [...s.methods, { id: `m${Date.now().toString(36)}`, kind, name, detail }],
          })),
        removeMethod: (id) =>
          setState((s) => {
            const methods = s.methods.filter((m) => m.id !== id);
            if (methods.length === 0) return s; // never remove the last method
            return {
              methods,
              defaultId: s.defaultId === id ? methods[0].id : s.defaultId,
            };
          }),
        setDefault: (id) => setState((s) => ({ ...s, defaultId: id })),
      }}
    >
      {children}
    </MethodsContext.Provider>
  );
}

export function useMethods(): MethodsValue {
  const ctx = useContext(MethodsContext);
  if (!ctx) throw new Error("useMethods must be used within a MethodsProvider");
  return ctx;
}
