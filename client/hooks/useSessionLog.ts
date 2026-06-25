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
      await Location.requestForegroundPermissionsAsync();
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

  return { logEvent };
}
