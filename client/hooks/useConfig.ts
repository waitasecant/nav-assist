import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AppConfig {
  confidence: number;                    // YOLO confidence filter 0.2–0.8
  immClose: number;                      // depth closeness for IMMEDIATE 0.5–0.95
  cautClose: number;                     // depth closeness for CAUTION 0.2–0.7
  voiceAlerts: boolean;                  // enable TTS announcements
  hapticAlerts: boolean;                 // enable vibration feedback
  minAlertTier: "CAUTION" | "IMMEDIATE"; // lowest tier that triggers alerts
  fallDetection: boolean;                // enable accelerometer fall detection
  serverIP: string;                      // empty = localhost (USB)
}

export const DEFAULTS: AppConfig = {
  confidence: 0.40,
  immClose: 0.75,
  cautClose: 0.45,
  voiceAlerts: true,
  hapticAlerts: true,
  minAlertTier: "CAUTION",
  fallDetection: true,
  serverIP: "",
};

const KEY = "navassist_config_v1";

export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((json) => {
      if (json) {
        const saved = JSON.parse(json);
        delete saved.serverIP; // serverIP is session-only, not persisted
        setConfigState({ ...DEFAULTS, ...saved });
      }
    });
  }, []);

  const setConfig = (patch: Partial<AppConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetConfig = () => {
    setConfigState(DEFAULTS);
    AsyncStorage.setItem(KEY, JSON.stringify(DEFAULTS));
  };

  return { config, setConfig, resetConfig };
}
