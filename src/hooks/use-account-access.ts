"use client";

import { getAccountAccess, type AccountAccess } from "@/lib/account-access";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseAccountAccessReturn {
  accountAccess: AccountAccess;
  isLoading: boolean;
  refreshAccountAccess: () => Promise<void>;
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

  const refreshAccountAccess = useCallback(async () => {
    if (email === undefined) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/account/access", { cache: "no-store" });
      const data = await response.json();

      if (response.ok && data.accountAccess) {
        setAccountAccess(data.accountAccess);
      } else {
        setAccountAccess(fallbackAccess);
      }
    } catch {
      setAccountAccess(fallbackAccess);
    } finally {
      setIsLoading(false);
    }
  }, [email, fallbackAccess]);

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
    refreshAccountAccess,
  };
}
