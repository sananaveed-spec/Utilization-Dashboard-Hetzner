"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALLOWED_USERS_CHANGED_EVENT,
  isEmailAllowed,
} from "@/lib/allowedUsers";

type UseAllowedUsersResult = {
  emails: string[] | null;
  loading: boolean;
  isAllowed: (email: string) => boolean;
  refresh: () => Promise<void>;
};

export function useAllowedUsers(): UseAllowedUsersResult {
  const [emails, setEmails] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/allowed-users", { cache: "no-store" });
      const data = (await response.json()) as { emails?: string[] };
      setEmails(Array.isArray(data.emails) ? data.emails : []);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onChanged() {
      void refresh();
    }

    window.addEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  return {
    emails,
    loading,
    isAllowed: (email: string) =>
      emails !== null && isEmailAllowed(email, emails),
    refresh,
  };
}
