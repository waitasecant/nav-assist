import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stats } from "../hooks/useStreamer";
import { useDashboard, TierCount, HazardCount, GpsEvent } from "../hooks/useDashboard";

const TIER_COLORS: Record<string, string> = {
  IMMEDIATE: "#ff3b30",
  CAUTION:   "#ff9500",
  AWARE:     "#34c759",
  CLEAR:     "#8e8e93",
};

interface SessionLogQueries {
  getTierDistribution: () => Promise<TierCount[]>;
  getTopHazards: (limit?: number) => Promise<HazardCount[]>;
  getRecentEvents: (limit?: number) => Promise<GpsEvent[]>;
  clearHistory: () => Promise<void>;
}

interface Props {
  stats: Stats;
  sessionLog: SessionLogQueries;
  onClose: () => void;
}

export function DashboardScreen({ stats, sessionLog, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"live" | "history">("live");
  const { tierDist, topHazards, recentEvents, refresh } = useDashboard(sessionLog);

  const currentTier = stats.hazard ? stats.hazard.split(" - ")[0] : null;
  const tierColor = currentTier ? (TIER_COLORS[currentTier] ?? "#8e8e93") : "#8e8e93";

  const confirmClear = () => {
    Alert.alert(
      "Clear history",
      "This will permanently delete all logged events. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: async () => { await sessionLog.clearHistory(); refresh(); } },
      ]
    );
  };

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "live" && styles.tabActive]}
          onPress={() => setTab("live")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabTxt, tab === "live" && styles.tabTxtActive]}>Live</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "history" && styles.tabActive]}
          onPress={() => setTab("history")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabTxt, tab === "history" && styles.tabTxtActive]}>History</Text>
        </TouchableOpacity>
      </View>

      {tab === "live" ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
          {currentTier && (
            <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
              <Text style={styles.tierTxt}>{currentTier}</Text>
            </View>
          )}
          {stats.hazard && <Text style={styles.hazardTxt}>{stats.hazard}</Text>}
          <View style={styles.grid}>
            <StatCard label="RTT"     value={stats.latency != null ? `${stats.latency} ms` : "—"} />
            <StatCard label="Client FPS" value={String(stats.fps)} />
            <StatCard label="Server FPS" value={stats.serverFps ? stats.serverFps.toFixed(1) : "—"} />
            <StatCard label="Dropped" value={String(stats.dropped)} />
            <StatCard label="Frames"  value={String(stats.frameCount)} />
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>{stats.status}</Text>
          </View>
        </ScrollView>
      ) : (
        <>
          <ScrollView style={styles.historyScroll} contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>Tier Distribution</Text>
            {tierDist.length === 0 ? (
              <Text style={styles.empty}>No data yet</Text>
            ) : (
              tierDist.map((t) => (
                <View key={t.tier} style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: TIER_COLORS[t.tier] ?? "#8e8e93" }]} />
                  <Text style={styles.rowLabel}>{t.tier}</Text>
                  <Text style={styles.rowValue}>{t.count}</Text>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>Top Hazards</Text>
            {topHazards.length === 0 ? (
              <Text style={styles.empty}>No data yet</Text>
            ) : (
              topHazards.map((h, i) => (
                <View key={h.label} style={styles.row}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={styles.rowLabel}>{h.label}</Text>
                  <Text style={styles.rowValue}>{h.count}</Text>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>Recent Events</Text>
            {recentEvents.length === 0 ? (
              <Text style={styles.empty}>No data yet</Text>
            ) : (
              recentEvents.map((e) => (
                <View key={e.ts} style={styles.eventRow}>
                  <View style={[styles.dot, { backgroundColor: TIER_COLORS[e.tier] ?? "#8e8e93" }]} />
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventLabel}>{e.label}</Text>
                    <Text style={styles.eventMeta}>
                      {new Date(e.ts).toLocaleTimeString()}
                      {e.lat != null ? `  \u{1F4CD} ${e.lat.toFixed(4)}, ${e.lon!.toFixed(4)}` : ""}
                    </Text>
                  </View>
                  <Text style={[styles.eventTier, { color: TIER_COLORS[e.tier] ?? "#8e8e93" }]}>
                    {e.tier}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={[styles.clearFooter, { paddingBottom: insets.bottom + 8 }]}>
            <TouchableOpacity style={styles.clearBtn} onPress={confirmClear} activeOpacity={0.8}>
              <Text style={styles.clearTxt}>Clear history</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#0d0d0d",
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#333",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: { color: "#aaa", fontSize: 18 },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#333",
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderColor: "#fff" },
  tabTxt: { color: "#888", fontSize: 14 },
  tabTxtActive: { color: "#fff", fontWeight: "600" },
  content: { padding: 16, gap: 12 },
  tierBadge: {
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    marginBottom: 4,
  },
  tierTxt: { color: "#fff", fontSize: 20, fontWeight: "700", letterSpacing: 1 },
  hazardTxt: { color: "#ccc", fontSize: 13, textAlign: "center", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#1c1c1e",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  cardValue: { color: "#fff", fontSize: 22, fontWeight: "600" },
  cardLabel: { color: "#888", fontSize: 11, marginTop: 2 },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1c1c1e",
    borderRadius: 10,
    padding: 12,
  },
  statusLabel: { color: "#888", fontSize: 13 },
  statusValue: { color: "#ccc", fontSize: 13, flexShrink: 1, textAlign: "right" },
  sectionTitle: { color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8 },
  empty: { color: "#555", fontSize: 13, marginLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rank: { color: "#555", fontSize: 13, width: 20, textAlign: "right" },
  rowLabel: { color: "#ddd", fontSize: 14, flex: 1 },
  rowValue: { color: "#888", fontSize: 13 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#222",
  },
  eventInfo: { flex: 1 },
  eventLabel: { color: "#ddd", fontSize: 13, fontWeight: "500" },
  eventMeta: { color: "#666", fontSize: 11, marginTop: 2 },
  eventTier: { fontSize: 11, fontWeight: "600" },
  historyScroll: { flex: 1 },
  clearFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#222",
  },
  clearBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#ff3b30",
  },
  clearTxt: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
