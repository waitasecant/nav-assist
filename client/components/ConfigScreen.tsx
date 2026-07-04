import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppConfig, DEFAULTS } from "../hooks/useConfig";

interface Props {
  config: AppConfig;
  onChange: (patch: Partial<AppConfig>) => void;
  onClose: () => void;
}

const DESCRIPTIONS: Record<string, string> = {
  confidence:
    "Minimum AI confidence required to flag an object as a hazard. Lower catches more objects but increases false alarms. Higher is more selective. (0.20\u20130.80)",
  immClose:
    "Closeness score an object must reach to trigger an IMMEDIATE alert with strong vibration. Higher means it must be nearly on you; lower fires earlier. (0.50\u20130.95)",
  cautClose:
    "Closeness score threshold for a CAUTION alert with gentle vibration. Should be lower than Immediate Closeness. (0.20\u20130.70)",
  voiceAlerts:
    "Spoken announcements when a hazard is detected. Turn off for silent environments without disabling vibration.",
  hapticAlerts:
    "Vibration feedback on hazard detection. Turn off to use voice-only mode.",
  minAlertTier:
    "Lowest tier that triggers alerts. CAUTION+ notifies for both warning and danger. IMMEDIATE only reserves alerts for the most urgent threats, reducing interruptions.",
  fallDetection:
    "Uses the accelerometer to detect sudden falls. Disable if you experience false triggers from sitting down quickly or dropping the phone.",
};

export function ConfigScreen({ config, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<AppConfig>({ ...config });
  const [selected, setSelected] = useState<string | null>(null);

  const patch = (p: Partial<AppConfig>) => setDraft((d) => ({ ...d, ...p }));
  const sel = (key: string) => setSelected(key);

  const handleDone = () => { onChange(draft); onClose(); };

  return (
    <View style={styles.overlay}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.rows}>
          <ConfigRow
            label="Detection Confidence"
            value={draft.confidence} format={(v) => v.toFixed(2)}
            onDec={() => { sel("confidence"); patch({ confidence: round(Math.max(0.2, draft.confidence - 0.05)) }); }}
            onInc={() => { sel("confidence"); patch({ confidence: round(Math.min(0.8, draft.confidence + 0.05)) }); }}
            selected={selected === "confidence"} onSelect={() => sel("confidence")}
          />
          <ConfigRow
            label="Immediate Closeness"
            value={draft.immClose} format={(v) => v.toFixed(2)}
            onDec={() => { sel("immClose"); patch({ immClose: round(Math.max(0.5, draft.immClose - 0.05)) }); }}
            onInc={() => { sel("immClose"); patch({ immClose: round(Math.min(0.95, draft.immClose + 0.05)) }); }}
            selected={selected === "immClose"} onSelect={() => sel("immClose")}
          />
          <ConfigRow
            label="Caution Closeness"
            value={draft.cautClose} format={(v) => v.toFixed(2)}
            onDec={() => { sel("cautClose"); patch({ cautClose: round(Math.max(0.2, draft.cautClose - 0.05)) }); }}
            onInc={() => { sel("cautClose"); patch({ cautClose: round(Math.min(0.7, draft.cautClose + 0.05)) }); }}
            selected={selected === "cautClose"} onSelect={() => sel("cautClose")}
          />

          <View style={styles.divider} />

          <ToggleRow label="Voice Alerts" value={draft.voiceAlerts}
            onToggle={() => patch({ voiceAlerts: !draft.voiceAlerts })}
            selected={selected === "voiceAlerts"} onSelect={() => sel("voiceAlerts")}
          />
          <ToggleRow label="Haptic Alerts" value={draft.hapticAlerts}
            onToggle={() => patch({ hapticAlerts: !draft.hapticAlerts })}
            selected={selected === "hapticAlerts"} onSelect={() => sel("hapticAlerts")}
          />
          <SegmentRow
            label="Minimum Alert Level" value={draft.minAlertTier}
            options={[{ label: "CAUTION+", value: "CAUTION" }, { label: "IMMEDIATE", value: "IMMEDIATE" }]}
            onChange={(v) => patch({ minAlertTier: v as AppConfig["minAlertTier"] })}
            selected={selected === "minAlertTier"} onSelect={() => sel("minAlertTier")}
          />
          <ToggleRow label="Fall Detection" value={draft.fallDetection}
            onToggle={() => patch({ fallDetection: !draft.fallDetection })}
            selected={selected === "fallDetection"} onSelect={() => sel("fallDetection")}
          />
        </View>

        <View style={styles.descPanel}>
          <Text style={styles.descText}>
            {selected ? DESCRIPTIONS[selected] : "Tap any setting to see a description."}
          </Text>
        </View>

        <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={styles.resetBtn}
            onPress={() => { setDraft({ ...DEFAULTS, serverIP: config.serverIP }); setSelected(null); }}
            activeOpacity={0.8}
          >
            <Text style={styles.resetTxt}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.8}>
            <Text style={styles.doneTxt}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function ConfigRow({ label, value, format, onDec, onInc, selected, onSelect }: {
  label: string; value: number; format: (v: number) => string;
  onDec: () => void; onInc: () => void; selected: boolean; onSelect: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.row, selected && styles.rowSelected]} onPress={onSelect} activeOpacity={0.6}>
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
    </TouchableOpacity>
  );
}

function ToggleRow({ label, value, onToggle, selected, onSelect }: {
  label: string; value: boolean; onToggle: () => void; selected: boolean; onSelect: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.row, selected && styles.rowSelected]} onPress={onSelect} activeOpacity={0.6}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={[styles.toggle, value && styles.toggleOn]}>
        <Text style={[styles.toggleTxt, value && styles.toggleTxtOn]}>{value ? "ON" : "OFF"}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SegmentRow({ label, value, options, onChange, selected, onSelect }: {
  label: string; value: string; options: { label: string; value: string }[];
  onChange: (v: string) => void; selected: boolean; onSelect: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.row, selected && styles.rowSelected]} onPress={onSelect} activeOpacity={0.6}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segment}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segBtn, value === opt.value && styles.segBtnActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.segTxt, value === opt.value && styles.segTxtActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#000",
    zIndex: 20,
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 28,
    paddingRight: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#333",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeTxt: { color: "#aaa", fontSize: 18 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  rows: { gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#222", marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  rowSelected: { backgroundColor: "#161616" },
  label: { color: "#aaa", fontSize: 14, flex: 1 },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  btn: {
    backgroundColor: "#2a2a2a",
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  btnTxt: { color: "#fff", fontSize: 20, lineHeight: 24 },
  val: { color: "#fff", fontSize: 15, fontWeight: "600", minWidth: 48, textAlign: "center" },
  toggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: "#2a2a2a" },
  toggleOn: { borderColor: "#444", backgroundColor: "#1e1e1e" },
  toggleTxt: { color: "#555", fontSize: 12, fontWeight: "600" },
  toggleTxtOn: { color: "#fff" },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: "#2a2a2a", borderRadius: 8, overflow: "hidden" },
  segBtn: { paddingHorizontal: 9, paddingVertical: 6 },
  segBtnActive: { backgroundColor: "#2a2a2a" },
  segTxt: { color: "#555", fontSize: 11, fontWeight: "600" },
  segTxtActive: { color: "#fff" },
  descPanel: {
    flex: 1, marginTop: 12,
    backgroundColor: "#0d0d0d", borderRadius: 12,
    padding: 16, justifyContent: "center",
  },
  descText: { color: "#888", fontSize: 14, lineHeight: 22 },
  bottomRow: { flexDirection: "row", gap: 12, paddingTop: 12 },
  resetBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: "center", borderWidth: 1, borderColor: "#333",
  },
  resetTxt: { color: "#666", fontSize: 15 },
  doneBtn: {
    flex: 1, backgroundColor: "#2a2a2a",
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  doneTxt: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
