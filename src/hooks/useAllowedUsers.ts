"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALLOWED_USERS_CHANGED_EVENT,
  DEFAULT_ALLOWED_EMAILS,
  isEmailAllowed,
  uniqueNormalizedEmails,
} from "@/lib/allowedUsers";

type UseAllowedUsersResult = {
  emails: string[] | null;
  loading: boolean;
  isAllowed: (email: string) => boolean;
  refresh: () => Promise<void>;
};

function getFallbackEmails(): string[] {
  return uniqueNormalizedEmails([...DEFAULT_ALLOWED_EMAILS]);
}

export function useAllowedUsers(): UseAllowedUsersResult {
  const [emails, setEmails] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/allowed-users", { cache: "no-store" });
      const data = (await response.json()) as {
        emails?: string[];
        error?: string;
      };

      if (!response.ok || !Array.isArray(data.emails) || data.emails.length === 0) {
        setEmails(getFallbackEmails());
        return;
      }

      setEmails(data.emails);
    } catch {
      setEmails(getFallbackEmails());
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
