import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";

interface Props {
  canAskAgain: boolean;
  onRequest: () => void;
}

export function PermissionScreen({ canAskAgain, onRequest }: Props) {
  if (canAskAgain) {
    // Auto-triggered by App.tsx — show blank while OS dialog is loading
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera access denied</Text>
      <Text style={styles.body}>
        NavAssist needs camera access to detect hazards. Enable it in your device settings.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => Linking.openSettings()} activeOpacity={0.8}>
        <Text style={styles.btnText}>Open Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", padding: 32, gap: 20 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", textAlign: "center" },
  body: { color: "#888", fontSize: 14, textAlign: "center", lineHeight: 22 },
  btn: { backgroundColor: "#333", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
