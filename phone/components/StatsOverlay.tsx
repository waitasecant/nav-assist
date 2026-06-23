import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { PC_IP, WS_PORT } from "../hooks/useStreamer";

interface Props {
  status: string;
  latency: number | null;
  fps: number;
  frameCount: number;
}

export function StatsOverlay({ status, latency, fps, frameCount }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>NavAssist — Phase 1</Text>
      <StatRow label="Server" value={`${PC_IP}:${WS_PORT}`} />
      <StatRow label="Status" value={status} />
      <StatRow label="RTT Latency" value={latency != null ? `${latency} ms` : "—"} />
      <StatRow label="FPS" value={String(fps)} />
      <StatRow label="Total Frames" value={String(frameCount)} />
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.row}>
      {label}: <Text style={styles.value}>{value}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 48,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  title: { color: "#4af", fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  row: { color: "#ccc", fontSize: 14 },
  value: { color: "#fff", fontWeight: "bold" },
});
