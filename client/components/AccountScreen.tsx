import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Account } from "../hooks/useAccount";

interface Props {
  account: Account;
  onSave: (patch: Partial<Account>) => void;
  onClose: () => void;
}

export function AccountScreen({ account, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(account.name);
  // Strip +91 prefix for display — user only sees/edits the 10 digits
  const [contact, setContact] = useState(
    account.emergencyContact.startsWith("+91")
      ? account.emergencyContact.slice(3)
      : account.emergencyContact
  );

  const nameInvalid = !name.trim();
  const contactInvalid = contact.length > 0 && contact.length < 10;
  const saveDisabled = nameInvalid || contactInvalid;

  const handleSave = () => {
    const fullContact = contact.length === 10 ? `+91${contact}` : "";
    onSave({ name: name.trim(), emergencyContact: fullContact });
    onClose();
  };

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Account</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={[styles.input, nameInvalid && name.length > 0 === false && styles.inputEmpty]}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#555"
            autoCorrect={false}
            returnKeyType="next"
          />
          {name.length === 0 && (
            <Text style={styles.warning}>Name is required</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Emergency Contact</Text>
          <Text style={styles.hint}>
            Receives an SMS if a fall is detected and unacknowledged. Requires Twilio configured on the server.
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
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>
          {contactInvalid && (
            <Text style={styles.warning}>Emergency number should be 10 digits</Text>
          )}
        </View>

        <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saveDisabled}
            activeOpacity={0.8}
          >
            <Text style={[styles.saveTxt, saveDisabled && styles.saveTxtDisabled]}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  body: { flex: 1, padding: 24, gap: 28 },
  field: { gap: 8 },
  label: { color: "#bbb", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  hint: { color: "#555", fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: "#111",
    color: "#fff",
    fontSize: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  inputEmpty: {},
  prefixRow: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },
  prefix: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRightWidth: 1,
    borderColor: "#2a2a2a",
    justifyContent: "center",
  },
  prefixTxt: { color: "#aaa", fontSize: 16 },
  prefixInput: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  warning: { color: "#ff9500", fontSize: 12, marginTop: -2 },
  bottomRow: { marginTop: "auto" as any },
  saveBtn: {
    backgroundColor: "#d4d4d4",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  saveTxt: { color: "#000", fontSize: 16, fontWeight: "700" },
  saveTxtDisabled: { color: "#444" },
});
