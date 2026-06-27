import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AppConfig {
  confidence: number; // YOLO confidence filter 0.2–0.8
  immClose: number;   // depth closeness for IMMEDIATE 0.5–0.95
  cautClose: number;  // depth closeness for CAUTION 0.2–0.7
  ttsRate: number;    // TTS speech rate 0.5–2.0
}

const DEFAULTS: AppConfig = {
  confidence: 0.40,
  immClose: 0.75,
  cautClose: 0.45,
  ttsRate: 1.1,
};

const KEY = "navassist_config_v1";

export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((json) => {
      if (json) setConfigState({ ...DEFAULTS, ...JSON.parse(json) });
    });
  }, []);

  const setConfig = (patch: Partial<AppConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  return { config, setConfig };
}
