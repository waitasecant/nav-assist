import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  status: string;
  latency: number | null;
  fps: number;
  frameCount: number;
  hazard: string | null;
  dropped: number;
  accelMag: number;
  fallState: string;
  topInset: number;
}

export function StatsOverlay({ status, hazard, topInset }: Props) {
  const [expanded, setExpanded] = useState(false);
  const connected = status.startsWith("Connected");

  return (
    <>
      <TouchableOpacity
        style={[styles.statusBtn, { top: topInset + 8 }]}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <View style={[styles.dot, { backgroundColor: connected ? "#34c759" : "#ff3b30" }]} />
        {expanded && <Text style={styles.statusTxt}>{status}</Text>}
      </TouchableOpacity>

      {hazard && (
        <View style={styles.hazardBar}>
          <Text style={styles.hazardTxt}>{hazard}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  statusBtn: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusTxt: { color: "#fff", fontSize: 13, maxWidth: 220 },
  hazardBar: {
    position: "absolute",
    bottom: 48,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  hazardTxt: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
