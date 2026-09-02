import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { AppLicense, Issuer, IssuerEstablishment, User } from "../types";
import { compactLicenseStatusLabel, roleLabel } from "../utils/appAccess";
import { useAppTheme } from "../theme/AppTheme";
import { ThemePreference } from "../theme/themeStorage";

type ProfileModalProps = {
  visible: boolean;
  user: User;
  issuer: Issuer;
  establishment: IssuerEstablishment;
  license: AppLicense;
  canSwitchEstablishment: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricLoading: boolean;
  biometricError: string;
  onClose: () => void;
  onChangePassword: () => void;
  onSwitchEstablishment: () => void;
  onOpenLicense: () => void;
  onOpenSupport: () => void;
  onToggleBiometric: () => void;
};

export function ProfileModal(props: ProfileModalProps) {
  const { visible, user, issuer, establishment, license, canSwitchEstablishment, biometricAvailable, biometricEnabled, biometricLoading, biometricError, onClose, onChangePassword, onSwitchEstablishment, onOpenLicense, onOpenSupport, onToggleBiometric } = props;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { preference, setPreference, theme } = useAppTheme();
  const [themeError, setThemeError] = React.useState("");
  const [savingTheme, setSavingTheme] = React.useState(false);
  const safeTop = Platform.OS === "web" ? 20 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottom = Platform.OS === "web" ? 20 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTop, paddingBottom: safeBottom }]}>
        <View style={[styles.modal, { backgroundColor: theme.colors.surface }, Platform.OS !== "web" && { maxHeight: Math.max(360, height - safeTop - safeBottom), flexShrink: 1 }]}>
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}><MaterialCommunityIcons name="account-circle" size={38} color={theme.colors.primary} /></View>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>MI PERFIL</Text>
              <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>{user.name || roleLabel(user.role)}</Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.textMuted }]}>{user.email}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar perfil" style={[styles.closeButton, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.card, { borderColor: theme.colors.border }]}>
              <ProfileRow icon="account-badge-outline" label="Rol" value={roleLabel(user.role)} />
              <ProfileRow icon="office-building-outline" label="Empresa" value={issuer.tradeName || issuer.businessName || "Empresa"} />
              <ProfileRow icon="card-account-details-outline" label="RUC" value={issuer.ruc} />
              <ProfileRow icon="store-marker-outline" label="Establecimiento" value={`${establishment.name} · ${establishment.establishment}-${establishment.emissionPoint}`} last />
            </View>

            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>APARIENCIA</Text>
            <View style={[styles.themeSelector, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
              {(["light", "dark", "system"] as ThemePreference[]).map((option) => {
                const selected = preference === option;
                const labels: Record<ThemePreference, string> = { light: "Claro", dark: "Oscuro", system: "Automático" };
                const icons: Record<ThemePreference, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = { light: "white-balance-sunny", dark: "weather-night", system: "theme-light-dark" };
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={savingTheme}
                    style={[styles.themeOption, selected && { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary }]}
                    onPress={() => {
                      setSavingTheme(true);
                      setThemeError("");
                      void setPreference(option).catch(() => setThemeError("No se pudo guardar la apariencia.")).finally(() => setSavingTheme(false));
                    }}
                  >
                    <MaterialCommunityIcons name={icons[option]} size={19} color={selected ? theme.colors.primary : theme.colors.textMuted} />
                    <Text style={[styles.themeOptionText, { color: selected ? theme.colors.primary : theme.colors.textMuted }]}>{labels[option]}</Text>
                  </Pressable>
                );
              })}
            </View>
            {themeError ? <Text style={[styles.themeError, { color: theme.colors.danger }]}>{themeError}</Text> : null}

            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>SEGURIDAD</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !biometricAvailable || biometricLoading, checked: biometricEnabled }}
              disabled={!biometricAvailable || biometricLoading}
              style={({ pressed }) => [styles.biometricCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }, pressed && styles.pressed, (!biometricAvailable || biometricLoading) && styles.disabled]}
              onPress={onToggleBiometric}
            >
              <View style={[styles.actionIcon, { backgroundColor: biometricEnabled ? theme.colors.successSoft : theme.colors.primarySoft }]}>
                <MaterialCommunityIcons name="face-recognition" size={22} color={biometricEnabled ? theme.colors.success : theme.colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.actionLabel, { color: theme.colors.text }]}>Bloqueo biométrico</Text>
                <Text style={[styles.biometricDescription, { color: theme.colors.textMuted }]}>{biometricLoading ? "Comprobando dispositivo..." : biometricAvailable ? (Platform.OS === "web" ? "Permite ingresar en esta PWA con Face ID o la Passkey del dispositivo." : "Protege la aplicación al volver a abrirla.") : (Platform.OS === "web" ? "Face ID requiere una PWA instalada, HTTPS y un dispositivo compatible." : "No hay biometría segura configurada en este dispositivo.")}</Text>
              </View>
              <View style={[styles.biometricBadge, { backgroundColor: biometricEnabled ? theme.colors.successSoft : theme.colors.surfaceElevated }]}>
                <Text style={[styles.biometricBadgeText, { color: biometricEnabled ? theme.colors.success : theme.colors.textMuted }]}>{biometricEnabled ? "Activo" : "Inactivo"}</Text>
              </View>
            </Pressable>
            {biometricError ? <Text style={[styles.themeError, { color: theme.colors.danger }]}>{biometricError}</Text> : null}

            <View style={[styles.licenseCard, { backgroundColor: theme.colors.successSoft }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={24} color={theme.colors.success} />
              <View style={styles.flex}>
                <Text style={[styles.licenseTitle, { color: theme.colors.success }]}>Licencia</Text>
                <Text style={[styles.licenseText, { color: theme.colors.success }]}>{compactLicenseStatusLabel(license)}</Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>CUENTA Y AYUDA</Text>
            <ProfileAction icon="lock-reset" label="Cambiar contraseña" onPress={onChangePassword} />
            {canSwitchEstablishment ? <ProfileAction icon="swap-horizontal" label="Cambiar establecimiento" onPress={onSwitchEstablishment} /> : null}
            <ProfileAction icon="shield-check-outline" label="Ver licencia" onPress={onOpenLicense} />
            <ProfileAction icon="lifebuoy" label="Soporte" onPress={onOpenSupport} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProfileRow({ icon, label, value, last = false }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; label: string; value: string; last?: boolean }) {
  const { theme } = useAppTheme();
  return <View style={[styles.row, { borderBottomColor: theme.colors.border }, last && styles.lastRow]}>
    <MaterialCommunityIcons name={icon} size={20} color={theme.colors.primary} />
    <View style={styles.flex}><Text style={[styles.rowLabel, { color: theme.colors.textMuted }]}>{label}</Text><Text style={[styles.rowValue, { color: theme.colors.text }]}>{value || "No registrado"}</Text></View>
  </View>;
}

function ProfileAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; label: string; onPress: () => void }) {
  const { theme } = useAppTheme();
  return <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, { borderColor: theme.colors.border }, pressed && styles.pressed]} onPress={onPress}>
    <View style={[styles.actionIcon, { backgroundColor: theme.colors.primarySoft }]}><MaterialCommunityIcons name={icon} size={20} color={theme.colors.primary} /></View>
    <Text style={[styles.actionLabel, { color: theme.colors.text }]}>{label}</Text>
    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSubtle} />
  </Pressable>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.48)", padding: 12 },
  modal: { width: "100%", maxWidth: 520, maxHeight: "92%", alignSelf: "center", borderRadius: 22, overflow: "hidden", backgroundColor: "#ffffff" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  avatar: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#ecfdf5" },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#0f766e", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  title: { marginTop: 2, color: "#111827", fontSize: 20, fontWeight: "900" },
  subtitle: { marginTop: 2, color: "#64748b", fontSize: 12, fontWeight: "700" },
  closeButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  content: { padding: 16, gap: 10 },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eef2f7" },
  lastRow: { borderBottomWidth: 0 },
  flex: { flex: 1, minWidth: 0 },
  rowLabel: { color: "#64748b", fontSize: 11, fontWeight: "800" },
  rowValue: { marginTop: 2, color: "#172033", fontSize: 13, fontWeight: "800" },
  licenseCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 14, backgroundColor: "#ecfdf5" },
  licenseTitle: { color: "#064e3b", fontSize: 13, fontWeight: "900" },
  licenseText: { marginTop: 2, color: "#047857", fontSize: 12, fontWeight: "700" },
  sectionTitle: { marginTop: 6, color: "#64748b", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  action: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, paddingHorizontal: 12 },
  actionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#ecfdf5" },
  actionLabel: { flex: 1, color: "#172033", fontSize: 14, fontWeight: "800" },
  themeSelector: { flexDirection: "row", gap: 6, borderWidth: 1, borderRadius: 14, padding: 5 },
  themeOption: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: "transparent", borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 3 },
  themeOptionText: { fontSize: 11, fontWeight: "900" },
  themeError: { fontSize: 12, fontWeight: "800", textAlign: "center" },
  biometricCard: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 14, padding: 12 },
  biometricDescription: { marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  biometricBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  biometricBadgeText: { fontSize: 10, fontWeight: "900" },
  disabled: { opacity: 0.62 },
  pressed: { opacity: 0.7 }
});
