"use client";

import { getAccountAccess, type AccountAccess } from "@/lib/account-access";
import { useEffect, useMemo, useState } from "react";

export interface UseAccountAccessReturn {
  accountAccess: AccountAccess;
  isLoading: boolean;
}

export function useAccountAccess(
  email: string | null | undefined
): UseAccountAccessReturn {
  const fallbackAccess = useMemo(
    () => getAccountAccess(email),
    [email]
  );
  const [accountAccess, setAccountAccess] = useState<AccountAccess>(fallbackAccess);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (email === undefined) {
      return;
    }

    let active = true;

    const loadAccountAccess = async () => {
      setIsLoading(true);

      try {
        const response = await fetch("/api/account/access", { cache: "no-store" });
        const data = await response.json();

        if (active && response.ok && data.accountAccess) {
          setAccountAccess(data.accountAccess);
        } else if (active) {
          setAccountAccess(fallbackAccess);
        }
      } catch {
        if (active) {
          setAccountAccess(fallbackAccess);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadAccountAccess();

    return () => {
      active = false;
    };
  }, [email, fallbackAccess]);

  return {
    accountAccess,
    isLoading,
  };
}
