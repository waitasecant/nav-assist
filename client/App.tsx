import React, { useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useStreamer } from "./hooks/useStreamer";
import { useFallDetector } from "./hooks/useFallDetector";
import { useSessionLog } from "./hooks/useSessionLog";
import { StatsOverlay } from "./components/StatsOverlay";
import { PermissionScreen } from "./components/PermissionScreen";
import { FallAlert } from "./components/FallAlert";

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { logEvent } = useSessionLog();
  const { stats, connect, startFpsCounter, stop } = useStreamer(cameraRef, logEvent);
  const { fallDetected, dismiss, accelMag, fallState } = useFallDetector();

  useEffect(() => {
    const timer = startFpsCounter();
    connect();
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return <PermissionScreen onRequest={requestPermission} />;
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mute />
      <StatsOverlay {...stats} accelMag={accelMag} fallState={fallState} />
      {fallDetected && <FallAlert onDismiss={dismiss} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
});
