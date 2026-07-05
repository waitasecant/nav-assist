import { useEffect, useRef } from "react";
import * as SQLite from "expo-sqlite";
import * as Location from "expo-location";

export function useSessionLog() {
  const dbRef = useRef<SQLite.SQLiteDatabase | null>(null);

  useEffect(() => {
    (async () => {
      const db = await SQLite.openDatabaseAsync("navassist.db");
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS events (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          ts    INTEGER NOT NULL,
          tier  TEXT    NOT NULL,
          label TEXT    NOT NULL,
          depth REAL    NOT NULL,
          lat   REAL,
          lon   REAL
        )
      `);
      dbRef.current = db;
    })();
  }, []);

  const logEvent = async (tier: string, label: string, depth: number) => {
    const db = dbRef.current;
    if (!db) return;

    let lat: number | null = null;
    let lon: number | null = null;
    try {
      const loc = await Location.getLastKnownPositionAsync();
      if (loc) {
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
      }
    } catch (_) {}

    db.runAsync(
      "INSERT INTO events(ts,tier,label,depth,lat,lon) VALUES(?,?,?,?,?,?)",
      Date.now(), tier, label, depth, lat, lon
    );
  };

  const getRecentEvents = async (limit = 20) => {
    const db = dbRef.current;
    if (!db) return [];
    return db.getAllAsync<{ ts: number; tier: string; label: string; depth: number; lat: number | null; lon: number | null }>(
      "SELECT ts, tier, label, depth, lat, lon FROM events ORDER BY ts DESC LIMIT ?",
      limit
    );
  };

  const getTierDistribution = async () => {
    const db = dbRef.current;
    if (!db) return [];
    return db.getAllAsync<{ tier: string; count: number }>(
      "SELECT tier, COUNT(*) as count FROM events GROUP BY tier ORDER BY count DESC"
    );
  };

  const getTopHazards = async (limit = 10) => {
    const db = dbRef.current;
    if (!db) return [];
    return db.getAllAsync<{ label: string; count: number }>(
      "SELECT label, COUNT(*) as count FROM events GROUP BY label ORDER BY count DESC LIMIT ?",
      limit
    );
  };

  const getTimeline = async () => {
    const db = dbRef.current;
    if (!db) return [];
    const since = Date.now() - 30 * 60 * 1000;
    return db.getAllAsync<{ minute: number; tier: string; count: number }>(
      `SELECT (ts / 60000) as minute, tier, COUNT(*) as count
       FROM events WHERE ts >= ? GROUP BY minute, tier ORDER BY minute DESC`,
      since
    );
  };

  const clearHistory = async () => {
    const db = dbRef.current;
    if (!db) return;
    await db.runAsync("DELETE FROM events");
  };

  return { logEvent, getRecentEvents, getTierDistribution, getTopHazards, getTimeline, clearHistory };
}
