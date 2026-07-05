import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  status: string;
  latency: number | null;
  fps: number;
  frameCount: number;
  hazard: string | null;
  dropped: number;
  serverFps?: number;
  accelMag: number;
  fallState: string;
  topInset: number;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function StatsOverlay({ status, hazard, topInset, onConnect, onDisconnect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const connected = status.startsWith("Connected");

  return (
    <>
      <View style={[styles.statusContainer, { top: topInset + 8 }]}>
        <TouchableOpacity
          style={[styles.statusBtn, !expanded && styles.statusBtnCircle]}
          onPress={() => setExpanded((e) => !e)}
          activeOpacity={0.8}
        >
          <View style={[styles.dot, { backgroundColor: connected ? "#34c759" : "#ff3b30" }]} />
          {expanded && <Text style={styles.statusTxt}>{status}</Text>}
        </TouchableOpacity>

        {expanded && (
          <TouchableOpacity
            style={[styles.actionBtn, connected ? styles.actionBtnDisconnect : styles.actionBtnConnect]}
            onPress={() => { setExpanded(false); connected ? onDisconnect() : onConnect(); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionTxt, !connected && styles.actionTxtConnect]}>{connected ? "Disconnect" : "Connect"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {hazard && (
        <View style={styles.hazardBar}>
          <Text style={styles.hazardTxt}>{hazard}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  statusContainer: {
    position: "absolute",
    left: 16,
    alignItems: "flex-start",
    gap: 6,
  },
  statusBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  statusBtnCircle: {
    width: 44,
    paddingHorizontal: 0,
    justifyContent: "center",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusTxt: { color: "#fff", fontSize: 13, maxWidth: 220 },
  actionBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionBtnDisconnect: { backgroundColor: "#ff3b30" },
  actionBtnConnect: { backgroundColor: "#fff" },
  actionTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  actionTxtConnect: { color: "#000" },
  hazardBar: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  hazardTxt: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
