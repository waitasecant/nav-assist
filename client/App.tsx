import React, { useRef, useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
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
import { AccountScreen } from "./components/AccountScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { useAccount } from "./hooks/useAccount";

function AppContent() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const permRequestedRef = useRef(false);
  const [permAttempted, setPermAttempted] = useState(false);
  const [locationSettled, setLocationSettled] = useState(false);

  useEffect(() => {
    if (!hasPermission && !permRequestedRef.current) {
      permRequestedRef.current = true;
      requestPermission().then(() => setPermAttempted(true));
    }
    if (hasPermission) {
      Location.requestForegroundPermissionsAsync()
        .finally(() => setLocationSettled(true));
    }
  }, [hasPermission]);
  const [showConfig, setShowConfig] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const { config, setConfig } = useConfig();
  const { account, setAccount, loaded: accountLoaded } = useAccount();
  const discoveredHosts = useDiscovery();
  const { logEvent, getTierDistribution, getTopHazards, getTimeline, getRecentEvents, clearHistory } = useSessionLog();
  const { stats, connect, disconnect, startFpsCounter, stop } = useStreamer(cameraRef, config, account.emergencyContact, logEvent);
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
  // Only switch if not already connected — avoids killing a working adb-reverse tunnel.
  const prevServerIP = useRef(config.serverIP);
  useEffect(() => {
    const prev = prevServerIP.current;
    prevServerIP.current = config.serverIP;
    if (prev === "" && config.serverIP !== "" && !stats.status.startsWith("Connect")) {
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

  if (!hasPermission && !permAttempted) return <View style={styles.container} />;

  if (!hasPermission) {
    return <PermissionScreen canAskAgain={false} onRequest={requestPermission} />;
  }

  if (!locationSettled) return <View style={styles.container} />;

  if (!accountLoaded || !account.onboardingComplete) {
    return (
      <OnboardingScreen
        onComplete={(name, emergencyContact) =>
          setAccount({ name, emergencyContact, onboardingComplete: true })
        }
      />
    );
  }

  const btnTop = insets.top + 8;

  return (
    <View style={styles.container}>
      {device && (
        <Camera
          ref={cameraRef}
          style={[styles.camera, { marginTop: insets.top, marginBottom: insets.bottom }]}
          device={device}
          isActive={true}
          photo={true}
          audio={false}
        />
      )}
      <StatsOverlay {...stats} accelMag={accelMag} fallState={fallState} topInset={insets.top} onConnect={connect} onDisconnect={disconnect} />
      <TouchableOpacity style={[styles.iconBtn, { top: btnTop, right: 16 }]} onPress={() => setShowConfig(true)} activeOpacity={0.7}>
        <Ionicons name="settings-outline" size={22} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.iconBtn, { top: btnTop, right: 68 }]} onPress={() => setShowDashboard(true)} activeOpacity={0.7}>
        <Ionicons name="analytics-outline" size={22} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.iconBtn, { top: btnTop, right: 120 }]} onPress={() => setShowAccount(true)} activeOpacity={0.7}>
        <Ionicons name="person-outline" size={22} color="#fff" />
      </TouchableOpacity>
      {showAccount && (
        <AccountScreen account={account} onSave={setAccount} onClose={() => setShowAccount(false)} />
      )}
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
