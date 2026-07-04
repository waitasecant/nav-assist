import React, { useRef, useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useStreamer, WS_PORT, resolveHost } from "./hooks/useStreamer";
import { useFallDetector } from "./hooks/useFallDetector";
import { useSessionLog } from "./hooks/useSessionLog";
import { useConfig } from "./hooks/useConfig";
import { useDiscovery } from "./hooks/useDiscovery";
import { StatsOverlay } from "./components/StatsOverlay";
import { PermissionScreen } from "./components/PermissionScreen";
import { FallAlert } from "./components/FallAlert";
import { Ionicons } from "@expo/vector-icons";
import { ConfigScreen } from "./components/ConfigScreen";
import { DashboardScreen } from "./components/DashboardScreen";

function AppContent() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [showConfig, setShowConfig] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const { config, setConfig } = useConfig();
  const discoveredHosts = useDiscovery();
  const { logEvent, getTierDistribution, getTopHazards, getTimeline, getRecentEvents, clearHistory } = useSessionLog();
  const { stats, connect, disconnect, startFpsCounter, stop } = useStreamer(cameraRef, config, logEvent);
  const { fallDetected, dismiss, accelMag, fallState } = useFallDetector(config.fallDetection);

  useEffect(() => {
    const timer = startFpsCounter();
    connect();
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  // Auto-fill IP when exactly one server is discovered and no IP is configured.
  useEffect(() => {
    if (config.serverIP === "" && discoveredHosts.length === 1) {
      setConfig({ serverIP: discoveredHosts[0].host });
    }
  }, [discoveredHosts]);

  // Reconnect when serverIP is set for the first time (e.g. mDNS auto-fill).
  // The initial connect() used 127.0.0.1; now we have a real host.
  const prevServerIP = useRef(config.serverIP);
  useEffect(() => {
    const prev = prevServerIP.current;
    prevServerIP.current = config.serverIP;
    if (prev === "" && config.serverIP !== "") {
      stop();
      connect();
    }
  }, [config.serverIP]);

  const handleUnacknowledged = async () => {
    const host = resolveHost(config.serverIP);
    try {
      const loc = await Location.getLastKnownPositionAsync();
      await fetch(`http://${host}:${WS_PORT}/fall`, {
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

  const btnTop = insets.top + 8;

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={[styles.camera, { marginTop: insets.top, marginBottom: insets.bottom }]}
        facing="back"
        mute
      />
      <StatsOverlay {...stats} accelMag={accelMag} fallState={fallState} topInset={insets.top} onConnect={connect} onDisconnect={disconnect} />
      <TouchableOpacity style={[styles.iconBtn, { top: btnTop, right: 16 }]} onPress={() => setShowConfig(true)} activeOpacity={0.7}>
        <Ionicons name="settings-outline" size={22} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.iconBtn, { top: btnTop, right: 68 }]} onPress={() => setShowDashboard(true)} activeOpacity={0.7}>
        <Ionicons name="analytics-outline" size={22} color="#fff" />
      </TouchableOpacity>
      {showConfig && (
        <ConfigScreen config={config} onChange={setConfig} onClose={() => setShowConfig(false)} />
      )}
      {showDashboard && (
        <DashboardScreen
          stats={stats}
          sessionLog={{ getTierDistribution, getTopHazards, getRecentEvents, clearHistory }}
          onClose={() => setShowDashboard(false)}
        />
      )}
      {fallDetected && <FallAlert onDismiss={dismiss} onUnacknowledged={handleUnacknowledged} />}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  iconBtn: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
