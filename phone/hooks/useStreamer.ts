import { useRef, useState, useCallback } from "react";
import { CameraView } from "expo-camera";

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
          // camera not ready — skip frame
        }
      }

      setTimeout(capture, FRAME_INTERVAL_MS);
    };

    capture();
  }, [cameraRef]);

  const connect = useCallback(() => {
    setStats((s) => ({ ...s, status: "Connecting…" }));

    const ws = new WebSocket(`ws://${PC_IP}:${WS_PORT}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStats((s) => ({ ...s, status: "Connected ✓" }));
      startCapture();
    };

    ws.onclose = () => {
      setStats((s) => ({ ...s, status: "Disconnected — retrying in 2 s" }));
      streamingRef.current = false;
      setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      setStats((s) => ({ ...s, status: "Connection error" }));
    };

    ws.onmessage = () => {
      const rtt = Date.now() - lastSentAtRef.current;
      setStats((s) => ({ ...s, latency: rtt }));
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
