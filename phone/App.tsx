import React, { useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useStreamer } from "./hooks/useStreamer";
import { useFallDetector } from "./hooks/useFallDetector";
import { StatsOverlay } from "./components/StatsOverlay";
import { PermissionScreen } from "./components/PermissionScreen";
import { FallAlert } from "./components/FallAlert";

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { stats, connect, startFpsCounter, stop } = useStreamer(cameraRef);
  const { fallDetected, dismiss } = useFallDetector();

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
      <StatsOverlay {...stats} />
      {fallDetected && <FallAlert onDismiss={dismiss} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
});
