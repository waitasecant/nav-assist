import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { AppConfig } from "../hooks/useConfig";
import { DiscoveredHost } from "../hooks/useDiscovery";

interface Props {
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => void;
  onClose: () => void;
  discoveredHosts: DiscoveredHost[];
}

export function ConfigScreen({ config, onChange, onClose, discoveredHosts }: Props) {
  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.title}>Settings</Text>

        <ConfigRow
          label="YOLO Confidence"
          value={config.confidence}
          format={(v) => v.toFixed(2)}
          onDec={() => onChange({ confidence: round(Math.max(0.2, config.confidence - 0.05)) })}
          onInc={() => onChange({ confidence: round(Math.min(0.8, config.confidence + 0.05)) })}
        />

        <ConfigRow
          label="IMMEDIATE closeness"
          value={config.immClose}
          format={(v) => v.toFixed(2)}
          onDec={() => onChange({ immClose: round(Math.max(0.5, config.immClose - 0.05)) })}
          onInc={() => onChange({ immClose: round(Math.min(0.95, config.immClose + 0.05)) })}
        />

        <ConfigRow
          label="CAUTION closeness"
          value={config.cautClose}
          format={(v) => v.toFixed(2)}
          onDec={() => onChange({ cautClose: round(Math.max(0.2, config.cautClose - 0.05)) })}
          onInc={() => onChange({ cautClose: round(Math.min(0.7, config.cautClose + 0.05)) })}
        />

        <ConfigRow
          label="TTS Rate"
          value={config.ttsRate}
          format={(v) => `${v.toFixed(1)}×`}
          onDec={() => onChange({ ttsRate: round(Math.max(0.5, config.ttsRate - 0.1)) })}
          onInc={() => onChange({ ttsRate: round(Math.min(2.0, config.ttsRate + 0.1)) })}
        />

        <View style={styles.row}>
          <Text style={styles.label}>Server IP (empty = USB / localhost)</Text>
          <TextInput
            style={styles.ipInput}
            value={config.serverIP}
            onChangeText={(text) => onChange({ serverIP: text.trim() })}
            placeholder="e.g. 192.168.1.42"
            placeholderTextColor="#555"
            keyboardType="numeric"
            autoCorrect={false}
          />
          {discoveredHosts.length > 0 && (
            <View style={styles.suggestions}>
              <Text style={styles.suggestLabel}>Discovered:</Text>
              {discoveredHosts.map((h) => (
                <TouchableOpacity
                  key={h.host}
                  style={styles.chip}
                  onPress={() => onChange({ serverIP: h.host })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipTxt}>{h.name}  {h.host}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.closeTxt}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

interface RowProps {
  label: string;
  value: number;
  format: (v: number) => string;
  onDec: () => void;
  onInc: () => void;
}

function ConfigRow({ label, value, format, onDec, onInc }: RowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.btn} onPress={onDec} activeOpacity={0.7}>
          <Text style={styles.btnTxt}>−</Text>
        </TouchableOpacity>
        <Text style={styles.val}>{format(value)}</Text>
        <TouchableOpacity style={styles.btn} onPress={onInc} activeOpacity={0.7}>
          <Text style={styles.btnTxt}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.95)",
    zIndex: 20,
    justifyContent: "center",
  },
  inner: { padding: 28, gap: 28 },
  title: { color: "#4af", fontSize: 22, fontWeight: "bold" },
  row: { gap: 10 },
  label: { color: "#aaa", fontSize: 15 },
  controls: { flexDirection: "row", alignItems: "center", gap: 20 },
  btn: {
    backgroundColor: "#333",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTxt: { color: "#fff", fontSize: 26, lineHeight: 30 },
  val: { color: "#fff", fontSize: 20, fontWeight: "bold", minWidth: 72, textAlign: "center" },
  closeBtn: {
    marginTop: 8,
    backgroundColor: "#4af",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  closeTxt: { color: "#000", fontSize: 18, fontWeight: "bold" },
  ipInput: {
    backgroundColor: "#222",
    color: "#fff",
    fontSize: 16,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#444",
  },
  suggestions: { gap: 8, marginTop: 4 },
  suggestLabel: { color: "#888", fontSize: 13 },
  chip: {
    backgroundColor: "#1a3a5c",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#4af",
  },
  chipTxt: { color: "#4af", fontSize: 14 },
});
