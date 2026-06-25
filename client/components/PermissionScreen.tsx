import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

interface Props {
  onRequest: () => void;
}

export function PermissionScreen({ onRequest }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Camera permission required.</Text>
      <TouchableOpacity style={styles.btn} onPress={onRequest}>
        <Text style={styles.btnText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  text: { color: "#333", fontSize: 16 },
  btn: { backgroundColor: "#4af", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "bold" },
});
