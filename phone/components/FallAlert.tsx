import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

const COUNTDOWN_S = 5;

interface Props {
  onDismiss: () => void;
}

export function FallAlert({ onDismiss }: Props) {
  const [countdown, setCountdown] = useState(COUNTDOWN_S);

  useEffect(() => {
    if (countdown <= 0) {
      // Repeat alert and restart countdown
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Speech.speak("Fall detected. Are you okay?", { rate: 1.0, language: "en" });
      setCountdown(COUNTDOWN_S);
      return;
    }

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <View style={styles.overlay}>
      <Text style={styles.title}>Fall Detected</Text>
      <Text style={styles.subtitle}>Are you okay?</Text>
      <Text style={styles.countdown}>{countdown}</Text>
      <TouchableOpacity style={styles.btn} onPress={onDismiss} activeOpacity={0.8}>
        <Text style={styles.btnText}>I'm OK</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(160, 0, 0, 0.93)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 10,
  },
  title:     { color: "#fff",    fontSize: 36, fontWeight: "bold" },
  subtitle:  { color: "#ffcccc", fontSize: 22 },
  countdown: { color: "#fff",    fontSize: 72, fontWeight: "bold" },
  btn: {
    marginTop: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 50,
  },
  btnText: { color: "#a00000", fontSize: 20, fontWeight: "bold" },
});
