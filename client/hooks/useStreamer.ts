import { useRef, useState, useCallback, useEffect } from "react";
import { Camera } from "react-native-vision-camera";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { AppConfig } from "./useConfig";

// Config
const WS_PORT = 8000;

export { WS_PORT };

// resolveHost returns the server host: config.serverIP if set, else 127.0.0.1.
// "localhost" on Android resolves to ::1 (IPv6) which adb reverse does not tunnel.
export function resolveHost(serverIP: string): string {
  return serverIP.trim() || "127.0.0.1";
}

export interface Stats {
  status: string;
  latency: number | null;
  fps: number;
  frameCount: number;
  hazard: string | null;
  dropped: number;
  serverFps: number;
}

export function useStreamer(
  cameraRef: React.RefObject<Camera | null>,
  config: AppConfig,
  emergencyContact: string,
  onHazard?: (tier: string, label: string, depth: number) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const streamingRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastMsgAtRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const droppedCountRef = useRef(0);
  const captureIntervalRef = useRef(100);
  const jpegQualityRef = useRef(0.3);
  const rttWindowRef = useRef<number[]>([]);
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);
  const emergencyContactRef = useRef(emergencyContact);
  useEffect(() => { emergencyContactRef.current = emergencyContact; }, [emergencyContact]);

  const [stats, setStats] = useState<Stats>({
    status: "Idle",
    latency: null,
    fps: 0,
    frameCount: 0,
    hazard: null,
    dropped: 0,
    serverFps: 0,
  });

  const startCapture = useCallback(() => {
    if (streamingRef.current) return;
    streamingRef.current = true;

    const capture = async () => {
      if (!streamingRef.current) return;

      const ws = wsRef.current;

      // Keep the connection alive while waiting for the camera to render.
      // Without this the watchdog fires after 10 s of no server responses.
      if (!cameraRef.current) {
        lastMsgAtRef.current = Date.now();
        setTimeout(capture, captureIntervalRef.current);
        return;
      }

      if (ws?.readyState === WebSocket.OPEN) {
        try {
          const photo = await Promise.race([
            cameraRef.current.takeSnapshot({ quality: Math.round(jpegQualityRef.current * 100) }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("camera timeout")), 3000)
            ),
          ]);

          if (photo?.path && ws.readyState === WebSocket.OPEN) {
            if (!inFlightRef.current) {
              // Read the snapshot file as binary to send as a WebSocket binary frame.
              const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
              const res = await fetch(uri);
              const buf = await res.arrayBuffer();
              if (ws.readyState === WebSocket.OPEN) {
                inFlightRef.current = true;
                lastSentAtRef.current = Date.now();
                ws.send(buf);
                frameCountRef.current++;
              }
            } else {
              droppedCountRef.current++;
            }
          }
        } catch (_) {
          // camera not ready or timed out - skip frame
        }
      }

      setTimeout(capture, captureIntervalRef.current);
    };

    capture();
  }, [cameraRef]);

  const retryDelayRef = useRef(1000);
  const manualStopRef = useRef(false);

  const connect = useCallback(() => {
    manualStopRef.current = false;
    setStats((s) => ({ ...s, status: "Connecting..." }));

    const host = resolveHost(configRef.current.serverIP);
    const ws = new WebSocket(`ws://${host}:${WS_PORT}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelayRef.current = 1000;
      lastMsgAtRef.current = Date.now();
      setStats((s) => ({ ...s, status: "Connected" }));
      ws.send(JSON.stringify({
        type: "config",
        confidence: configRef.current.confidence,
        immClose: configRef.current.immClose,
        cautClose: configRef.current.cautClose,
        emergencyTo: emergencyContactRef.current,
      }));
      watchdogRef.current = setInterval(() => {
        if (Date.now() - lastMsgAtRef.current > 10_000) {
          ws.close();
        }
      }, 3000);
      startCapture();
    };

    ws.onclose = (_event) => {
      streamingRef.current = false;
      inFlightRef.current = false;
      captureIntervalRef.current = 100;
      jpegQualityRef.current = 0.3;
      rttWindowRef.current = [];
      if (watchdogRef.current !== null) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30000);
      if (manualStopRef.current) {
        setStats((s) => ({ ...s, status: "Disconnected" }));
        return;
      }
      setStats((s) => ({ ...s, status: `Disconnected - retrying in ${delay / 1000}s` }));
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      inFlightRef.current = false;
      setStats((s) => ({ ...s, status: "Connection error" }));
    };

    ws.onmessage = (event) => {
      inFlightRef.current = false;
      lastMsgAtRef.current = Date.now();
      const rtt = Date.now() - lastSentAtRef.current;
      const win = rttWindowRef.current;
      win.push(rtt);
      if (win.length > 3) win.shift();
      const avgRtt = Math.round(win.reduce((a, b) => a + b, 0) / win.length);
      captureIntervalRef.current = avgRtt > 400 ? 500 : avgRtt > 150 ? 200 : 100;
      jpegQualityRef.current = avgRtt > 400 ? 0.2 : 0.3;
      const msg = JSON.parse(event.data as string);

      const top = msg.detections?.[0] ?? null;
      const depthStr = top
        ? top.depth >= 0
          ? `${(top.depth * 100).toFixed(0)}% close`
          : `${(top.area_ratio * 100).toFixed(0)}% area`
        : null;
      const hazard = top ? `${top.tier} - ${top.label} (${depthStr})` : null;
      setStats((s) => ({ ...s, latency: avgRtt, hazard, serverFps: msg.server_fps ?? 0 }));

      if (top && top.tier !== "AWARE" && onHazard) {
        onHazard(top.tier, top.label, top.depth);
      }

      const tier = top?.tier ?? "AWARE";
      const cfg = configRef.current;
      const alertable = cfg.minAlertTier === "IMMEDIATE"
        ? tier === "IMMEDIATE"
        : tier !== "AWARE";

      for (const cmd of msg.commands ?? []) {
        if (!alertable) break;
        if (cmd.action === "vibrate" && cfg.hapticAlerts) {
          const style =
            cmd.intensity === "high"   ? Haptics.ImpactFeedbackStyle.Heavy :
            cmd.intensity === "medium" ? Haptics.ImpactFeedbackStyle.Medium :
                                         Haptics.ImpactFeedbackStyle.Light;
          Haptics.impactAsync(style);
        } else if (cmd.action === "speak" && cfg.voiceAlerts) {
          Speech.speak(cmd.text, { rate: 1.1, language: "en" });
        }
      }
    };
  }, [startCapture]);

  const startFpsCounter = useCallback(() => {
    return setInterval(() => {
      const count = frameCountRef.current;
      frameCountRef.current = 0;
      const dropped = droppedCountRef.current;
      droppedCountRef.current = 0;
      setStats((s) => ({ ...s, fps: count, frameCount: s.frameCount + count, dropped }));
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    streamingRef.current = false;
    wsRef.current?.close();
  }, []);

  const disconnect = useCallback(() => {
    manualStopRef.current = true;
    streamingRef.current = false;
    wsRef.current?.close();
  }, []);

  return { stats, connect, disconnect, startFpsCounter, stop };
}
