import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  onComplete: (name: string, emergencyContact: string) => void;
}

export function OnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else {
      const fullContact = contact.length === 10 ? `+91${contact}` : "";
      onComplete(name.trim(), fullContact);
    }
  };

  const contactInvalid = contact.length > 0 && contact.length < 10;
  const step2Disabled = contactInvalid;
  const step1Disabled = step === 1 && !name.trim();

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.appName}>NavAssist</Text>

        <View style={styles.stepDots}>
          <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
          <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
        </View>

        {step === 1 ? (
          <>
            <Text style={styles.heading}>Welcome</Text>
            <Text style={styles.sub}>What should we call you?</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#555"
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => name.trim() && setStep(2)}
            />
          </>
        ) : (
          <>
            <Text style={styles.heading}>Emergency Contact</Text>
            <Text style={styles.sub}>
              If a fall is detected and unacknowledged, NavAssist can send an SMS alert to this number.
            </Text>
            <View style={styles.prefixRow}>
              <View style={styles.prefix}>
                <Text style={styles.prefixTxt}>+91</Text>
              </View>
              <TextInput
                style={styles.prefixInput}
                value={contact}
                onChangeText={(t) => setContact(t.replace(/\D/g, "").slice(0, 10))}
                placeholder="Your 10-digit number (optional)"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleNext}
              />
            </View>
            {contactInvalid && (
              <Text style={styles.warning}>Emergency number should be 10 digits</Text>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.nextBtn, (step1Disabled || step2Disabled) && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={step1Disabled || step2Disabled}
          activeOpacity={0.8}
        >
          <Text style={[styles.nextTxt, (step1Disabled || step2Disabled) && styles.nextTxtDisabled]}>
            {step === 2 ? "Get Started" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  inner: {
    paddingHorizontal: 32,
    gap: 16,
  },
  appName: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  stepDots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  stepDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#333",
  },
  stepDotActive: { backgroundColor: "#fff" },
  heading: { color: "#d4d4d4", fontSize: 28, fontWeight: "700" },
  sub: { color: "#bbb", fontSize: 15, lineHeight: 22 },
  nameInput: {
    backgroundColor: "#111",
    color: "#d4d4d4",
    fontSize: 17,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginTop: 4,
  },
  prefixRow: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginTop: 4,
    overflow: "hidden",
  },
  prefix: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderColor: "#2a2a2a",
    justifyContent: "center",
  },
  prefixTxt: { color: "#aaa", fontSize: 16 },
  prefixInput: {
    flex: 1,
    color: "#d4d4d4",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  warning: { color: "#ff9500", fontSize: 12, marginTop: -4 },
  nextBtn: {
    backgroundColor: "#d4d4d4",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  nextBtnDisabled: { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  nextTxt: { color: "#000", fontSize: 16, fontWeight: "700" },
  nextTxtDisabled: { color: "#444" },
});
