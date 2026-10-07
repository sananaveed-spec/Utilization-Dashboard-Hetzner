"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALLOWED_USERS_CHANGED_EVENT,
  defaultAdminUsers,
  type DashboardUser,
} from "@/lib/allowedUsers";

type UseAllowedUsersResult = {
  users: DashboardUser[] | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useAllowedUsers(): UseAllowedUsersResult {
  const [users, setUsers] = useState<DashboardUser[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/allowed-users", { cache: "no-store" });
      const data = (await response.json()) as {
        users?: DashboardUser[];
        error?: string;
      };

      if (!response.ok || !Array.isArray(data.users) || data.users.length === 0) {
        setUsers(defaultAdminUsers());
        return;
      }

      setUsers(data.users);
    } catch {
      setUsers(defaultAdminUsers());
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
    users,
    loading,
    refresh,
  };
}
