import { useRef, useState, useCallback, useEffect } from "react";
import { CameraView } from "expo-camera";
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

interface Stats {
  status: string;
  latency: number | null;
  fps: number;
  frameCount: number;
  hazard: string | null;
}

export function useStreamer(
  cameraRef: React.RefObject<CameraView | null>,
  config: AppConfig,
  onHazard?: (tier: string, label: string, depth: number) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const streamingRef = useRef(false);
  const configRef = useRef(config);
  const camLoggedRef = useRef(false);
  useEffect(() => { configRef.current = config; }, [config]);

  const [stats, setStats] = useState<Stats>({
    status: "Idle",
    latency: null,
    fps: 0,
    frameCount: 0,
    hazard: null,
  });

  const startCapture = useCallback(() => {
    if (streamingRef.current) {
      console.log("[capture] already streaming, skip");
      return;
    }
    streamingRef.current = true;
    camLoggedRef.current = false;
    console.log("[capture] loop started");

    const capture = async () => {
      if (!streamingRef.current) return;

      const ws = wsRef.current;
      if (cameraRef.current && ws?.readyState === WebSocket.OPEN) {
        camLoggedRef.current = false;
        try {
          console.log("[capture] calling takePictureAsync");
          const photo = await Promise.race([
            cameraRef.current.takePictureAsync({ quality: 0.3, base64: true }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("takePictureAsync timed out")), 3000)
            ),
          ]);
          console.log("[capture] photo received");

          if (photo?.base64 && ws.readyState === WebSocket.OPEN) {
            if (frameCountRef.current === 0) console.log("[capture] first frame sent");
            lastSentAtRef.current = Date.now();
            ws.send(JSON.stringify({ ts: lastSentAtRef.current, frame: photo.base64 }));
            frameCountRef.current++;
          } else {
            console.warn(`[capture] photo null or ws closed: base64=${!!photo?.base64} ws=${ws.readyState}`);
          }
        } catch (e) {
          console.error(`[camera] takePictureAsync failed: ${e}`);
        }
      } else if (!camLoggedRef.current) {
        camLoggedRef.current = true;
        console.log(`[capture] waiting: ref=${!!cameraRef.current} ws=${ws?.readyState}`);
      }

      setTimeout(capture, 100);
    };

    capture();
  }, [cameraRef]);

  const retryDelayRef = useRef(1000);

  const connect = useCallback(() => {
    setStats((s) => ({ ...s, status: "Connecting…" }));

    const host = resolveHost(configRef.current.serverIP);
    console.log(`[ws] connecting to ws://${host}:${WS_PORT}/ws`);
    const ws = new WebSocket(`ws://${host}:${WS_PORT}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelayRef.current = 1000;
      console.log("[ws] opened, calling startCapture");
      setStats((s) => ({ ...s, status: "Connected ✓" }));
      ws.send(JSON.stringify({
        type: "config",
        confidence: configRef.current.confidence,
        immClose: configRef.current.immClose,
        cautClose: configRef.current.cautClose,
      }));
      startCapture();
    };

    ws.onclose = (event) => {
      streamingRef.current = false;
      console.log(`[ws] closed: code=${event.code} reason=${event.reason} clean=${event.wasClean}`);
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30000);
      setStats((s) => ({ ...s, status: `Disconnected - retrying in ${delay / 1000}s` }));
      setTimeout(connect, delay);
    };

    ws.onerror = (event) => {
      console.error(`[ws] error: ${JSON.stringify(event)}`);
      setStats((s) => ({ ...s, status: "Connection error" }));
    };

    ws.onmessage = (event) => {
      const rtt = Date.now() - lastSentAtRef.current;
      const msg = JSON.parse(event.data as string);

      const top = msg.detections?.[0] ?? null;
      const depthStr = top
        ? top.depth >= 0
          ? `${(top.depth * 100).toFixed(0)}% close`
          : `${(top.area_ratio * 100).toFixed(0)}% area`
        : null;
      const hazard = top ? `${top.tier} - ${top.label} (${depthStr})` : null;
      setStats((s) => ({ ...s, latency: rtt, hazard }));

      if (top && top.tier !== "AWARE" && onHazard) {
        onHazard(top.tier, top.label, top.depth);
      }

      for (const cmd of msg.commands ?? []) {
        if (cmd.action === "vibrate") {
          const style =
            cmd.intensity === "high"   ? Haptics.ImpactFeedbackStyle.Heavy :
            cmd.intensity === "medium" ? Haptics.ImpactFeedbackStyle.Medium :
                                         Haptics.ImpactFeedbackStyle.Light;
          Haptics.impactAsync(style);
        } else if (cmd.action === "speak") {
          Speech.speak(cmd.text, { rate: configRef.current.ttsRate, language: "en" });
        }
      }
    };
  }, [startCapture]);

  const startFpsCounter = useCallback(() => {
    return setInterval(() => {
      const count = frameCountRef.current;
      frameCountRef.current = 0;
      setStats((s) => ({ ...s, fps: count, frameCount: s.frameCount + count }));
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    streamingRef.current = false;
    wsRef.current?.close();
  }, []);

  return { stats, connect, startFpsCounter, stop };
}
