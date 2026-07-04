import { useEffect, useState } from "react";

export interface TierCount { tier: string; count: number }
export interface HazardCount { label: string; count: number }
export interface GpsEvent { ts: number; tier: string; label: string; depth: number; lat: number | null; lon: number | null }

interface SessionLogQueries {
  getTierDistribution: () => Promise<TierCount[]>;
  getTopHazards: (limit?: number) => Promise<HazardCount[]>;
  getRecentEvents: (limit?: number) => Promise<GpsEvent[]>;
}

export function useDashboard(sessionLog: SessionLogQueries) {
  const [tierDist, setTierDist] = useState<TierCount[]>([]);
  const [topHazards, setTopHazards] = useState<HazardCount[]>([]);
  const [recentEvents, setRecentEvents] = useState<GpsEvent[]>([]);

  const refresh = async () => {
    const [dist, hazards, events] = await Promise.all([
      sessionLog.getTierDistribution(),
      sessionLog.getTopHazards(10),
      sessionLog.getRecentEvents(30),
    ]);
    setTierDist(dist);
    setTopHazards(hazards);
    setRecentEvents(events as GpsEvent[]);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  return { tierDist, topHazards, recentEvents, refresh };
}
