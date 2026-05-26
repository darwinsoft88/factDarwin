import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Input, PrimaryButton } from "./common";
import { EstablishmentPickerModal } from "./EstablishmentPickerModal";
import { LoginErrorModal } from "./LoginErrorModal";
import { PasswordVisibilityButton } from "./inputActions";
import type { BackendCompanyOption } from "../services/backend";
import type { IssuerEstablishment } from "../types";
import { APP_BRAND } from "../constants/app";

export type AuthScreenProps = {
  authMode: "login" | "register" | "forgot";
  authBackendUrl: string;
  setAuthBackendUrl: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showLoginPassword: boolean;
  setShowLoginPassword: (value: boolean) => void;
  login: (companyId?: string) => Promise<void> | void;
  loginStatus: { tone: "info" | "error" | "success"; message: string } | null;
  loginErrorModalMessage: string;
  setLoginErrorModalMessage: (message: string) => void;
  companyOptions: BackendCompanyOption[];
  registerForm: {
    ruc: string;
    businessName: string;
    tradeName: string;
    adminName: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  setRegisterForm: React.Dispatch<React.SetStateAction<{
    ruc: string;
    businessName: string;
    tradeName: string;
    adminName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }>>;
  registering: boolean;
  registerStatus: { tone: "info" | "error" | "success"; message: string } | null;
  registerTenant: () => Promise<void> | void;
  recoveryIdentifier: string;
  setRecoveryIdentifier: (value: string) => void;
  recoverPassword: () => Promise<void> | void;
  recoverStatus: { tone: "info" | "error" | "success"; message: string } | null;
  recoveringPassword: boolean;
  onOpenRegister: () => void;
  onOpenForgot: () => void;
  onCancelRegister: () => void;
  onCancelForgot: () => void;
  establishments: IssuerEstablishment[];
  establishmentOptionsVisible: boolean;
  chooseLoginEstablishment: (id: string) => Promise<void> | void;
  onCancelEstablishmentSelection: () => void;
};

export function AuthScreen({
  authMode,
  authBackendUrl,
  setAuthBackendUrl,
  email,
  setEmail,
  password,
  setPassword,
  showLoginPassword,
  setShowLoginPassword,
  login,
  loginStatus,
  loginErrorModalMessage,
  setLoginErrorModalMessage,
  companyOptions,
  registerForm,
  setRegisterForm,
  registering,
  registerStatus,
  registerTenant,
  recoveryIdentifier,
  setRecoveryIdentifier,
  recoverPassword,
  recoverStatus,
  recoveringPassword,
  onOpenRegister,
  onOpenForgot,
  onCancelRegister,
  onCancelForgot,
  establishments,
  establishmentOptionsVisible,
  chooseLoginEstablishment,
  onCancelEstablishmentSelection
}: AuthScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <ExpoStatusBar style="dark" />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.loginPanel} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
          <View style={styles.loginBrandRow}>
            <View style={styles.loginBrandMark}>
              <Text style={styles.loginBrandMarkText}>FD</Text>
            </View>
            <Text style={styles.loginBrand}>{APP_BRAND}</Text>
          </View>
          {authMode === "login" ? (
            <>
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>INICIAR SESION</Text>
                <Input label="URL del servidor" value={authBackendUrl} onChangeText={setAuthBackendUrl} autoCapitalize="none" />
                <Input label="Correo o RUC" value={email} onChangeText={setEmail} autoCapitalize="none" />
                <Input
                  label="Clave"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showLoginPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  rightElement={<PasswordVisibilityButton visible={showLoginPassword} onPress={() => setShowLoginPassword(!showLoginPassword)} />}
                />
                <PrimaryButton label="Ingresar" onPress={() => login()} />
                {loginStatus ? <Text style={[styles.authFeedback, loginStatus.tone === "error" && styles.authFeedbackError, loginStatus.tone === "success" && styles.authFeedbackSuccess]}>{loginStatus.message}</Text> : null}
                {companyOptions.length > 0 ? (
                  <View style={styles.companyChoiceList}>
                    {companyOptions.map((company) => (
                      <Pressable key={company.id} style={styles.companyChoice} onPress={() => login(company.id)}>
                        <Text style={styles.companyChoiceTitle}>{company.tradeName || company.businessName || "Empresa"}</Text>
                        <Text style={styles.companyChoiceMeta}>RUC {company.ruc} | {company.role || "usuario"}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <Pressable style={styles.authLinkButton} onPress={onOpenRegister}>
                <Text style={styles.authLinkText}>No tienes cuenta? Registrate</Text>
              </Pressable>
              <Pressable style={styles.authLinkButton} onPress={onOpenForgot}>
                <Text style={styles.authMutedLink}>Olvide contrasena</Text>
              </Pressable>
            </>
          ) : authMode === "register" ? (
            <>
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>CREAR CUENTA</Text>
                <Text style={styles.authSubtitle}>Registre su propia empresa con RUC activo en el SRI</Text>
                <Input label="URL del servidor" value={authBackendUrl} onChangeText={setAuthBackendUrl} autoCapitalize="none" />
                <Input label="RUC" value={registerForm.ruc} onChangeText={(ruc) => setRegisterForm({ ...registerForm, ruc })} keyboardType="number-pad" />
                <Input label="Razon social o nombre del negocio" value={registerForm.businessName} onChangeText={(businessName) => setRegisterForm({ ...registerForm, businessName })} placeholder="Ej. Comercial Andina" />
                <Input label="Nombre comercial (opcional)" value={registerForm.tradeName} onChangeText={(tradeName) => setRegisterForm({ ...registerForm, tradeName })} placeholder="Ej. Market Andina" />
                <Input label="Nombre de quien administrara la cuenta" value={registerForm.adminName} onChangeText={(adminName) => setRegisterForm({ ...registerForm, adminName })} placeholder="Ej. Maria Torres" />
                <Input label="Correo del administrador" value={registerForm.email} onChangeText={(value) => setRegisterForm({ ...registerForm, email: value })} autoCapitalize="none" placeholder="correo@empresa.com" />
                <Input label="Contrasena" value={registerForm.password} onChangeText={(value) => setRegisterForm({ ...registerForm, password: value })} secureTextEntry />
                <Input label="Confirmar contrasena" value={registerForm.confirmPassword} onChangeText={(value) => setRegisterForm({ ...registerForm, confirmPassword: value })} secureTextEntry />
                <View style={styles.authActionRow}>
                  <Pressable style={[styles.authActionPrimary, registering && styles.disabledButton]} onPress={registerTenant} disabled={registering}>
                    <Text style={styles.primaryButtonText}>{registering ? "Creando..." : "Crear cuenta"}</Text>
                  </Pressable>
                  <Pressable style={styles.authActionSecondary} onPress={onCancelRegister}>
                    <Text style={styles.authActionSecondaryText}>Regresar</Text>
                  </Pressable>
                </View>
                {registerStatus ? <Text style={[styles.authFeedback, registerStatus.tone === "error" && styles.authFeedbackError, registerStatus.tone === "success" && styles.authFeedbackSuccess]}>{registerStatus.message}</Text> : null}
              </View>
            </>
          ) : (
            <>
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>RECUPERAR CONTRASENA</Text>
                <Text style={styles.authSubtitle}>Recibira una clave temporal en el correo registrado</Text>
                <Input label="URL del servidor" value={authBackendUrl} onChangeText={setAuthBackendUrl} autoCapitalize="none" />
                <Input label="Correo o RUC" value={recoveryIdentifier} onChangeText={setRecoveryIdentifier} autoCapitalize="none" />
                <PrimaryButton label={recoveringPassword ? "Enviando..." : "Enviar clave temporal"} onPress={recoverPassword} />
                {recoverStatus ? <Text style={[styles.authFeedback, recoverStatus.tone === "error" && styles.authFeedbackError, recoverStatus.tone === "success" && styles.authFeedbackSuccess]}>{recoverStatus.message}</Text> : null}
              </View>
              <Pressable style={styles.authLinkButton} onPress={onCancelForgot}>
                <Text style={styles.authLinkText}>Volver a iniciar sesion</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <LoginErrorModal message={loginErrorModalMessage} onClose={() => setLoginErrorModalMessage("")} />
      <EstablishmentPickerModal
        visible={establishmentOptionsVisible}
        title="Elija establecimiento"
        subtitle="Seleccione con que sucursal o punto de emision va a trabajar."
        establishments={establishments}
        cancelLabel="Cancelar"
        onSelect={(id) => { void chooseLoginEstablishment(id); }}
        onCancel={onCancelEstablishmentSelection}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  keyboardAvoiding: {
    flex: 1
  },
  loginPanel: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f7f9fc"
  },
  loginBrandRow: {
    marginBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  loginBrandMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  loginBrandMarkText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  loginBrand: {
    color: "#0f2f66",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900"
  },
  authCard: {
    borderRadius: 14,
    padding: 26,
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf1f7",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  authTitle: {
    marginBottom: 10,
    color: "#1f2937",
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "900",
    textAlign: "center"
  },
  authSubtitle: {
    marginTop: -10,
    marginBottom: 2,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  authActionRow: {
    marginTop: 6,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  authActionPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  authActionSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 14
  },
  authActionSecondaryText: {
    color: "#0f5f59",
    fontWeight: "900",
    fontSize: 13
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  authFeedback: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700"
  },
  authFeedbackError: {
    color: "#b91c1c"
  },
  authFeedbackSuccess: {
    color: "#0f766e"
  },
  authLinkButton: {
    marginTop: 14,
    alignSelf: "center"
  },
  authLinkText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800"
  },
  authMutedLink: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800"
  },
  companyChoiceList: {
    marginTop: 12,
    gap: 10
  },
  companyChoice: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 14
  },
  companyChoiceTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  companyChoiceMeta: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  disabledButton: {
    opacity: 0.6
  }
});
