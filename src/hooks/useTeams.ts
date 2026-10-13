"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TEAMS_CHANGED_EVENT,
  type DashboardTeam,
} from "@/lib/teams";

const TEAMS_POLL_INTERVAL_MS = 5000;

type UseTeamsResult = {
  teams: DashboardTeam[];
  loading: boolean;
  refresh: () => Promise<void>;
};

function teamsFingerprint(teams: DashboardTeam[]): string {
  return JSON.stringify(teams);
}

export function useTeams(): UseTeamsResult {
  const [teams, setTeams] = useState<DashboardTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const fingerprintRef = useRef("");

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/teams", { cache: "no-store" });
      const data = (await response.json()) as {
        teams?: DashboardTeam[];
        error?: string;
      };
      const next = Array.isArray(data.teams) ? data.teams : [];
      const nextFingerprint = teamsFingerprint(next);
      if (nextFingerprint !== fingerprintRef.current) {
        fingerprintRef.current = nextFingerprint;
        setTeams(next);
      }
    } catch {
      if (!options?.silent) {
        setTeams([]);
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
    window.addEventListener(TEAMS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(TEAMS_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      void refresh({ silent: true });
    }, TEAMS_POLL_INTERVAL_MS);

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
    teams,
    loading,
    refresh: () => refresh(),
  };
}
