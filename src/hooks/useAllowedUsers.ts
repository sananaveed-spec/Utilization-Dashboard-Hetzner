"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED_USERS_CHANGED_EVENT,
  defaultAdminUsers,
  type DashboardUser,
} from "@/lib/allowedUsers";

const USERS_POLL_INTERVAL_MS = 5000;

type UseAllowedUsersResult = {
  users: DashboardUser[] | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

function usersFingerprint(users: DashboardUser[]): string {
  return JSON.stringify(users);
}

export function useAllowedUsers(): UseAllowedUsersResult {
  const [users, setUsers] = useState<DashboardUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const fingerprintRef = useRef("");

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/allowed-users", { cache: "no-store" });
      const data = (await response.json()) as {
        users?: DashboardUser[];
        error?: string;
      };

      const next =
        !response.ok || !Array.isArray(data.users) || data.users.length === 0
          ? defaultAdminUsers()
          : data.users;

      const nextFingerprint = usersFingerprint(next);
      if (nextFingerprint !== fingerprintRef.current) {
        fingerprintRef.current = nextFingerprint;
        setUsers(next);
      }
    } catch {
      const fallback = defaultAdminUsers();
      const nextFingerprint = usersFingerprint(fallback);
      if (nextFingerprint !== fingerprintRef.current) {
        fingerprintRef.current = nextFingerprint;
        setUsers(fallback);
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onChanged() {
      void refresh({ silent: true });
    }

    window.addEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      void refresh({ silent: true });
    }, USERS_POLL_INTERVAL_MS);

    function onVisibility() {
      if (!document.hidden) {
        void refresh({ silent: true });
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return {
    users,
    loading,
    refresh: () => refresh(),
  };
}
