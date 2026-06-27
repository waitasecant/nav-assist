import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { AppConfig } from "../hooks/useConfig";

interface Props {
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => void;
  onClose: () => void;
}

export function ConfigScreen({ config, onChange, onClose }: Props) {
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
});
