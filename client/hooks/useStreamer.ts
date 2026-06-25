import { useRef, useState, useCallback } from "react";
import { CameraView } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

// Config
const PC_IP = "localhost";
const WS_PORT = 8000;
const FRAME_INTERVAL_MS = 100;

export { PC_IP, WS_PORT };

interface Stats {
  status: string;
  latency: number | null;
  fps: number;
  frameCount: number;
  hazard: string | null;
}

export function useStreamer(cameraRef: React.RefObject<CameraView | null>) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const streamingRef = useRef(false);

  const [stats, setStats] = useState<Stats>({
    status: "Idle",
    latency: null,
    fps: 0,
    frameCount: 0,
    hazard: null,
  });

  const startCapture = useCallback(() => {
    if (streamingRef.current) return;
    streamingRef.current = true;

    const capture = async () => {
      if (!streamingRef.current) return;

      const ws = wsRef.current;
      if (cameraRef.current && ws?.readyState === WebSocket.OPEN) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.3,
            base64: true,
            skipProcessing: true,
          });

          if (photo?.base64 && ws.readyState === WebSocket.OPEN) {
            lastSentAtRef.current = Date.now();
            ws.send(JSON.stringify({ ts: lastSentAtRef.current, frame: photo.base64 }));
            frameCountRef.current++;
          }
        } catch (_) {
          // camera not ready - skip frame
        }
      }

      setTimeout(capture, FRAME_INTERVAL_MS);
    };

    capture();
  }, [cameraRef]);

  const retryDelayRef = useRef(1000);

  const connect = useCallback(() => {
    setStats((s) => ({ ...s, status: "Connecting…" }));

    const ws = new WebSocket(`ws://${PC_IP}:${WS_PORT}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelayRef.current = 1000;
      setStats((s) => ({ ...s, status: "Connected ✓" }));
      startCapture();
    };

    ws.onclose = () => {
      streamingRef.current = false;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30000);
      setStats((s) => ({ ...s, status: `Disconnected - retrying in ${delay / 1000}s` }));
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
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

      for (const cmd of msg.commands ?? []) {
        if (cmd.action === "vibrate") {
          const style =
            cmd.intensity === "high"   ? Haptics.ImpactFeedbackStyle.Heavy :
            cmd.intensity === "medium" ? Haptics.ImpactFeedbackStyle.Medium :
                                         Haptics.ImpactFeedbackStyle.Light;
          Haptics.impactAsync(style);
        } else if (cmd.action === "speak") {
          Speech.speak(cmd.text, { rate: 1.1, language: "en" });
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
