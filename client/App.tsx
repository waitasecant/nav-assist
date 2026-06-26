import React, { useRef, useEffect, useState } from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useStreamer, PC_IP, WS_PORT } from "./hooks/useStreamer";
import { useFallDetector } from "./hooks/useFallDetector";
import { useSessionLog } from "./hooks/useSessionLog";
import { useConfig } from "./hooks/useConfig";
import { StatsOverlay } from "./components/StatsOverlay";
import { PermissionScreen } from "./components/PermissionScreen";
import { FallAlert } from "./components/FallAlert";
import { ConfigScreen } from "./components/ConfigScreen";

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [showConfig, setShowConfig] = useState(false);
  const { config, setConfig } = useConfig();
  const { logEvent } = useSessionLog();
  const { stats, connect, startFpsCounter, stop } = useStreamer(cameraRef, config, logEvent);
  const { fallDetected, dismiss, accelMag, fallState } = useFallDetector();

  useEffect(() => {
    const timer = startFpsCounter();
    connect();
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  const handleUnacknowledged = async () => {
    try {
      const loc = await Location.getLastKnownPositionAsync();
      await fetch(`http://${PC_IP}:${WS_PORT}/fall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: loc?.coords.latitude ?? null,
          lon: loc?.coords.longitude ?? null,
        }),
      });
    } catch (_) {}
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return <PermissionScreen onRequest={requestPermission} />;
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mute />
      <StatsOverlay {...stats} accelMag={accelMag} fallState={fallState} />
      <TouchableOpacity style={styles.gear} onPress={() => setShowConfig(true)} activeOpacity={0.7}>
        <Text style={styles.gearTxt}>⚙</Text>
      </TouchableOpacity>
      {showConfig && (
        <ConfigScreen config={config} onChange={setConfig} onClose={() => setShowConfig(false)} />
      )}
      {fallDetected && <FallAlert onDismiss={dismiss} onUnacknowledged={handleUnacknowledged} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  gear: {
    position: "absolute",
    top: 52,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  gearTxt: { color: "#fff", fontSize: 22 },
});
