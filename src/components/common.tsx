import React, { useRef } from "react";
import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, shadowColor: theme.colors.shadow }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

export function CollapsibleSection({ title, children, defaultOpen = false, embedded = false, headerAccessory, open: controlledOpen, onOpenChange }: { title: string; children: React.ReactNode; defaultOpen?: boolean; embedded?: boolean; headerAccessory?: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const { theme } = useAppTheme();
  const toggle = () => {
    const next = !open;
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <View style={[embedded ? styles.collapsibleEmbedded : styles.section, { backgroundColor: embedded ? theme.colors.surfaceMuted : theme.colors.surface, borderColor: theme.colors.border, shadowColor: theme.colors.shadow }]}>
      <View style={styles.collapsibleHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${open ? "Cerrar" : "Abrir"} ${title}`} style={styles.collapsibleHeaderToggle} onPress={toggle}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        </Pressable>
        {headerAccessory}
        <Pressable accessibilityRole="button" accessibilityLabel={`${open ? "Cerrar" : "Abrir"} ${title}`} style={[styles.collapsibleIcon, { backgroundColor: theme.colors.primarySoft }]} onPress={toggle}>
          <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={20} color={theme.colors.primary} />
        </Pressable>
      </View>
      {open ? children : null}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput> & { label: string; rightElement?: React.ReactNode }) {
  const { label, rightElement, style, onChange, onChangeText, ...rest } = props;
  const { theme } = useAppTheme();
  const themedInput = { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.borderStrong, color: theme.colors.text };

  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      {rightElement ? (
        <View style={styles.inputShell}>
          <TextInput style={[styles.input, themedInput, styles.inputWithRightElement, style]} placeholderTextColor={theme.colors.textSubtle} selectionColor={theme.colors.primary} onChange={onChange} onChangeText={onChangeText} {...rest} />
          <View style={styles.inputRightElement}>{rightElement}</View>
        </View>
      ) : (
        <TextInput style={[styles.input, themedInput, style]} placeholderTextColor={theme.colors.textSubtle} selectionColor={theme.colors.primary} onChange={onChange} onChangeText={onChangeText} {...rest} />
      )}
    </View>
  );
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.selectRow}>
          {options.map((option) => (
            <Pressable key={option.value} style={[styles.choice, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.borderStrong }, value === option.value && [styles.choiceActive, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary }]]} onPress={() => onChange(option.value)}>
              <Text style={[styles.choiceText, { color: theme.colors.textMuted }, value === option.value && [styles.choiceTextActive, { color: theme.colors.primary }]]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function PrimaryButton({ disabled = false, label, onPress, icon }: { disabled?: boolean; label: string; onPress: () => void | Promise<void>; icon?: MaterialIconName }) {
  const pressLockedRef = useRef(false);
  const resolvedIcon = icon || primaryButtonIcon(label);
  const { theme } = useAppTheme();

  const handlePress = () => {
    if (disabled || pressLockedRef.current) return;
    pressLockedRef.current = true;
    const unlock = () => {
      setTimeout(() => {
        pressLockedRef.current = false;
      }, 700);
    };

    try {
      const result = onPress();
      if (result && typeof result.finally === "function") {
        result.finally(unlock);
      } else {
        unlock();
      }
    } catch (error) {
      unlock();
      throw error;
    }
  };

  return (
    <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, disabled && styles.primaryButtonDisabled]} onPress={handlePress} disabled={disabled}>
      {resolvedIcon ? <MaterialCommunityIcons name={resolvedIcon} size={19} color={theme.colors.onPrimary} /> : null}
      <Text style={[styles.primaryButtonText, { color: theme.colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function LoadMoreButton({ label, onPress, icon = "chevron-down" }: { label: string; onPress: () => void; icon?: MaterialIconName }) {
  const { theme } = useAppTheme();
  return (
    <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={17} color={theme.colors.primaryStrong} />
      <Text style={[styles.smallButtonText, { color: theme.colors.primaryStrong }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const { theme } = useAppTheme();
  return <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{text}</Text>;
}

function primaryButtonIcon(label: string): MaterialIconName | undefined {
  const value = label.toLowerCase();
  if (value.includes("guardar")) return "content-save-outline";
  if (value.includes("emitir")) return "file-send-outline";
  if (value.includes("agregar")) return "plus-circle-outline";
  if (value.includes("crear")) return "account-plus-outline";
  if (value.includes("subir")) return "cloud-upload-outline";
  if (value.includes("probar") || value.includes("conexion")) return "connection";
  if (value.includes("escanear")) return "barcode-scan";
  if (value.includes("actualizar")) return "refresh";
  if (value.includes("sincronizar")) return "sync";
  if (value.includes("correo")) return "email-outline";
  if (value.includes("cerrar")) return "close";
  return undefined;
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e7f0",
    gap: 9,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  collapsibleEmbedded: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 9,
    backgroundColor: "#fbfdff"
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1f2937"
  },
  collapsibleHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  collapsibleHeaderToggle: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    justifyContent: "center"
  },
  collapsibleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  inputGroup: {
    gap: 6
  },
  label: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "700"
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "#111827",
    backgroundColor: "#fbfdff"
  },
  inputShell: {
    position: "relative",
    justifyContent: "center"
  },
  inputWithRightElement: {
    paddingRight: 96
  },
  inputRightElement: {
    position: "absolute",
    right: 6,
    top: 6,
    bottom: 6,
    justifyContent: "center"
  },
  selectRow: {
    flexDirection: "row",
    gap: 8
  },
  choice: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfdff"
  },
  choiceActive: {
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb"
  },
  choiceText: {
    color: "#4b5563",
    fontWeight: "700"
  },
  choiceTextActive: {
    color: "#0f766e"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8
  },
  primaryButtonDisabled: {
    opacity: 0.62
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  hint: {
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8
  }
});
