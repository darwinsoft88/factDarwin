import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppLegalFooter } from "./AppLegalFooter";
import { Input, PrimaryButton } from "./common";
import { EstablishmentPickerModal } from "./EstablishmentPickerModal";
import { LoginErrorModal } from "./LoginErrorModal";
import { PasswordVisibilityButton } from "./inputActions";
import type { BackendCompanyOption } from "../services/backend";
import type { IssuerEstablishment } from "../types";
import { APP_BRAND } from "../constants/app";
import { AUTH_KEYBOARD_BOTTOM_PADDING, KEYBOARD_AVOIDING_BEHAVIOR } from "../constants/layout";
import { PRODUCTION_BACKEND_URL } from "../database";
import { sanitizeIntegerInput } from "../utils/numbers";

export type AuthScreenProps = {
  authMode: "login" | "register" | "forgot";
  authBackendUrl: string;
  setAuthBackendUrl: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showLoginPassword: boolean;
  setShowLoginPassword: (value: boolean) => void;
  login: (companyId?: string) => Promise<void> | void;
  loggingIn: boolean;
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
  username,
  setUsername,
  password,
  setPassword,
  showLoginPassword,
  setShowLoginPassword,
  login,
  loggingIn,
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
  const [serverSettingsVisible, setServerSettingsVisible] = useState(false);
  const uniqueCompanyOptions = useMemo(() => dedupeCompanyOptions(companyOptions), [companyOptions]);
  const isRucLogin = /^\d{13}$/.test(email.trim());
  const serverUrlInput = __DEV__ ? (
    <View style={styles.serverUrlBlock}>
      <Pressable style={styles.serverUrlToggle} onPress={() => setServerSettingsVisible((visible) => !visible)}>
        <Text style={styles.serverUrlResetText}>{serverSettingsVisible ? "Ocultar servidor de pruebas" : "Servidor de pruebas"}</Text>
      </Pressable>
      {serverSettingsVisible ? (
        <>
          <Input label="URL del servidor" value={authBackendUrl} onChangeText={setAuthBackendUrl} autoCapitalize="none" autoCorrect={false} autoComplete="url" keyboardType="url" textContentType="URL" />
          {authBackendUrl.trim() !== PRODUCTION_BACKEND_URL ? (
            <Pressable style={styles.serverUrlReset} onPress={() => setAuthBackendUrl(PRODUCTION_BACKEND_URL)}>
              <Text style={styles.serverUrlResetText}>Usar servidor oficial</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  ) : null;

  return (
    <LinearGradient
      colors={["#eef8f7", "#f7f9fc", "#eef4ff"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.screen}
    >
      <ExpoStatusBar style="dark" />
      <View style={styles.backgroundCircleTop} />
      <View style={styles.backgroundCircleBottom} />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <ScrollView
          contentContainerStyle={[
            styles.loginPanel,
            authMode !== "login" && styles.loginPanelForm,
            { paddingBottom: authMode === "login" ? 90 : AUTH_KEYBOARD_BOTTOM_PADDING }
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.loginHeader}>

            <View style={styles.loginBrandRow}>
              <View style={styles.loginBrandMark}>
                <Text style={styles.loginBrandMarkText}>FD</Text>
              </View>

              <Text style={styles.loginBrand}>
                {APP_BRAND}
              </Text>
            </View>

            <Text style={styles.loginSlogan}>
              Facturación inteligente para tu negocio.
            </Text>

          </View>

          {authMode === "login" ? (
            <>
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>INICIAR SESION</Text>
                {serverUrlInput}
                <Input label="Empresa (RUC o correo)" value={email} onChangeText={(value) => {
                  setEmail(value);

                  if (!/^\d{13}$/.test(value.trim())) {
                    setUsername("");
                  }
                }}
                  autoCapitalize="none" autoCorrect={false}
                  placeholder="Correo electrónico o RUC" />

                {isRucLogin ? (
                  <Input
                    label="Usuario"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Ej. darwin, vendedor, caja1"
                  />
                ) : null}

                <Input
                  label="Clave"

                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showLoginPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  rightElement={<PasswordVisibilityButton visible={showLoginPassword} onPress={() => setShowLoginPassword(!showLoginPassword)} />}
                  placeholder="Contraseña"
                />
                <PrimaryButton
                  label={loggingIn ? "Ingresando..." : "Ingresar"}
                  onPress={() => login()}
                  disabled={loggingIn}
                />
                {loginStatus ? <Text style={[styles.authFeedback, loginStatus.tone === "error" && styles.authFeedbackError, loginStatus.tone === "success" && styles.authFeedbackSuccess]}>{loginStatus.message}</Text> : null}
                {uniqueCompanyOptions.length > 0 ? (
                  <View style={styles.companyChoiceList}>
                    {uniqueCompanyOptions.map((company) => (
                      <Pressable
                        key={company.id}
                        style={[styles.companyChoice, loggingIn && styles.disabledButton]}
                        onPress={() => login(company.id)}
                        disabled={loggingIn}
                      >
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
                {serverUrlInput}
                <Input label="RUC" value={registerForm.ruc} onChangeText={(ruc) => setRegisterForm({ ...registerForm, ruc: sanitizeIntegerInput(ruc).slice(0, 13) })} keyboardType="number-pad" />
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
                {serverUrlInput}
                <Input label="Correo o RUC" value={recoveryIdentifier} onChangeText={setRecoveryIdentifier} autoCapitalize="none" />
                <PrimaryButton label={recoveringPassword ? "Enviando..." : "Enviar clave temporal"} onPress={recoverPassword} />
                {recoverStatus ? <Text style={[styles.authFeedback, recoverStatus.tone === "error" && styles.authFeedbackError, recoverStatus.tone === "success" && styles.authFeedbackSuccess]}>{recoverStatus.message}</Text> : null}
              </View>
              <Pressable style={styles.authLinkButton} onPress={onCancelForgot}>
                <Text style={styles.authLinkText}>Volver a iniciar sesion</Text>
              </Pressable>
            </>
          )}
          <AppLegalFooter compact />
        </ScrollView>
      </KeyboardAvoidingView>
      <LoginErrorModal message={loginErrorModalMessage} onClose={() => setLoginErrorModalMessage("")} />
      <EstablishmentPickerModal
        visible={establishmentOptionsVisible}
        title="Elija establecimiento"
        subtitle="Seleccione con que sucursal o punto de emision va a trabajar."
        establishments={establishments}
        cancelLabel="Cancelar"
        onSelect={chooseLoginEstablishment}
        onCancel={onCancelEstablishmentSelection}
      />
    </LinearGradient>
  );
}

function dedupeCompanyOptions(options: BackendCompanyOption[]) {
  const seen = new Set<string>();
  return options.filter((company) => {
    const key = company.id || company.ruc;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    justifyContent: "flex-start",
    paddingTop: 120,

    paddingHorizontal: 18,
    paddingVertical: 24
  },

  loginPanelForm: {
    justifyContent: "flex-start",
    paddingTop: 34
  },
  loginBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  loginBrandMark: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  loginBrandMarkText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  loginBrand: {
    color: "#0f2f66",
    fontSize: 34,
    letterSpacing: -0.5,
    lineHeight: 36,
    fontWeight: "900"
  },
  /* authCard: {
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
   },*/

  authCard: {
    width: "92%",
    alignSelf: "center",
    borderRadius: 16,
    padding: 24,
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf1f7",
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10
    },

    elevation: 8
  },

  serverUrlBlock: {
    gap: 4
  },
  serverUrlToggle: {
    alignSelf: "flex-start",
    paddingVertical: 2
  },
  serverUrlReset: {
    alignSelf: "flex-start",
    paddingVertical: 2
  },
  serverUrlResetText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
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
  backgroundCircleTop: {
    position: "absolute",

    width: 180,
    height: 180,

    borderRadius: 90,

    backgroundColor: "rgba(15,118,110,0.05)",

    top: -60,
    right: -60
  },

  backgroundCircleBottom: {
    position: "absolute",

    width: 160,
    height: 160,

    borderRadius: 80,

    backgroundColor: "rgba(15,47,102,0.04)",

    bottom: -60,
    left: -60
  },
  loginHeader: {
    alignItems: "center",
    marginBottom: 28
  },
  disabledButton: {
    opacity: 0.6
  },
  loginSlogan: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center"
  }
});
