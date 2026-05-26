import { Alert, Platform } from "react-native";
import { useMemo } from "react";
import { loginBackend, registerBackend, requestPasswordReset, restoreAppData, changeBackendPassword } from "../services/backend";
import { hashPassword } from "../services/security";
import { isBackendConnectionError, loginErrorMessage } from "../utils/errors";
import { normalizedEstablishments, issuerWithEstablishment } from "../utils/establishments";
import { showMessage } from "../utils/dialogs";
import { generateId } from "../utils/id";
import { sanitizeAppData, isValidUrl } from "../validation";
import { clearSession, loadSession, saveData, saveSession, initialData } from "../storage";
import type { AppData, User, UserRole } from "../types";
import type { SyncState } from "../utils/support";
import type { AuthState } from "./useAuthState";
import type { AppTab } from "../utils/appAccess";

export type UseAuthActionsParams = {
  authState: AuthState;
  dataRef: React.MutableRefObject<AppData>;
  sessionRef: React.MutableRefObject<User | null>;
  backendTokenRef: React.MutableRefObject<string>;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  setSession: React.Dispatch<React.SetStateAction<User | null>>;
  setBackendToken: React.Dispatch<React.SetStateAction<string>>;
  setSyncState: React.Dispatch<React.SetStateAction<SyncState>>;
  setAppMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setEstablishmentSwitcherVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setTab: React.Dispatch<React.SetStateAction<AppTab>>;
  setOnboardingVisible: React.Dispatch<React.SetStateAction<boolean>>;
};

export type AuthActions = {
  login: (companyId?: string) => Promise<void>;
  registerTenant: () => Promise<void>;
  recoverPassword: () => Promise<void>;
  chooseLoginEstablishment: (establishmentId: string) => Promise<void>;
  submitNewPassword: () => Promise<void>;
  logout: () => void;
};

export function useAuthActions({ authState, dataRef, sessionRef, backendTokenRef, setData, setSession, setBackendToken, setSyncState, setAppMenuVisible, setEstablishmentSwitcherVisible, setTab, setOnboardingVisible }: UseAuthActionsParams): AuthActions {
  const authActions = useMemo(() => {
    const enterSession = async (nextData: AppData, nextUser: User, token: string, passwordHash = "") => {
      let sessionToken = token;
      if (!sessionToken) {
        const storedSession = await loadSession();
        const sameUser = storedSession?.user && (
          storedSession.user.id === nextUser.id ||
          storedSession.user.email.trim().toLowerCase() === nextUser.email.trim().toLowerCase() ||
          (storedSession.companyRuc && storedSession.companyRuc === nextData.issuer.ruc)
        );
        if (sameUser && storedSession?.token) sessionToken = storedSession.token;
      }

      await saveData(nextData);
      await saveSession(nextUser, sessionToken, passwordHash, nextData.issuer.ruc);
      setData(nextData);
      dataRef.current = nextData;
      setBackendToken(sessionToken);
      backendTokenRef.current = sessionToken;
      setSession(nextUser);
      sessionRef.current = nextUser;
      setSyncState("synced");
      authState.setLoginStatus(null);
      authState.setCompanyOptions([]);
      authState.setPendingLogin(null);
      authState.setEstablishmentOptionsVisible(false);

      if (nextUser.mustChangePassword) {
        authState.setNewPasswordForm({ password: "", confirm: "" });
        authState.setPasswordChangeStatus({ tone: "info", message: "Por seguridad, cree una nueva contrasena para reemplazar la clave temporal." });
        authState.setPasswordChangeVisible(true);
      }
    };

    const chooseLoginEstablishment = async (establishmentId: string) => {
      if (!authState.pendingLogin) return;
      authState.setLoginErrorModalMessage("");
      authState.setLoginStatus(null);
      const establishment = normalizedEstablishments(authState.pendingLogin.data.issuer).find((item) => item.id === establishmentId);
      if (!establishment) return;
      const nextIssuer = issuerWithEstablishment({ ...authState.pendingLogin.data.issuer, activeEstablishmentId: establishment.id }, establishment);
      await enterSession({ ...authState.pendingLogin.data, issuer: nextIssuer }, authState.pendingLogin.user, authState.pendingLogin.token, authState.pendingLogin.passwordHash || "");
    };

    const login = async (companyId = "") => {
      const identifier = authState.email.trim();
      const backendUrl = authState.authBackendUrl.trim();
      const normalizedIdentifier = identifier.toLowerCase();
      authState.setLoginStatus(null);
      authState.setLoginErrorModalMessage("");
      authState.setCompanyOptions([]);
      authState.setPendingLogin(null);
      authState.setEstablishmentOptionsVisible(false);
      if (!identifier || !authState.password) {
        const message = "Ingrese correo o RUC y clave para iniciar sesion.";
        authState.setLoginStatus({ tone: "error", message });
        authState.setLoginErrorModalMessage(message);
        return;
      }
      if (/^\d+$/.test(identifier) && identifier.length !== 13) {
        const message = "El RUC debe tener 13 digitos. Revise el numero e intente nuevamente.";
        authState.setLoginStatus({ tone: "error", message });
        authState.setLoginErrorModalMessage(message);
        return;
      }
      if (!isValidUrl(backendUrl)) {
        const message = "Ingrese una URL valida del servidor.";
        authState.setLoginStatus({ tone: "error", message });
        authState.setLoginErrorModalMessage(message);
        return;
      }

      try {
        authState.setLoginStatus({ tone: "info", message: "Validando acceso..." });
        const result = await loginBackend(backendUrl, identifier, authState.password, companyId);
        const snapshot = await restoreAppData<AppData>(backendUrl, result.token || "");
        if (!result.user || !snapshot?.data) {
          const message = "El servidor valido el acceso, pero no devolvio los datos de la empresa. Intente nuevamente.";
          authState.setLoginStatus({ tone: "error", message });
          Alert.alert("No se pudo cargar la empresa", message);
          return;
        }

        const restored = sanitizeAppData({
          ...snapshot.data,
          backendUrl,
          autoBackupEnabled: true,
          autoBackupLastAt: snapshot.updatedAt,
          autoBackupLastError: ""
        });
        const loginRuc = /^\d{13}$/.test(identifier) ? identifier : "";
        const restoredRuc = restored.issuer.ruc.replace(/\D/g, "");
        if (loginRuc && restoredRuc && restoredRuc !== loginRuc) {
          const message = `El servidor devolvio datos del RUC ${restoredRuc}, pero usted ingreso ${loginRuc}. Se cancelo el ingreso para evitar mezcla de empresas.`;
          authState.setLoginStatus({ tone: "error", message });
          authState.setLoginErrorModalMessage(message);
          return;
        }

        await saveData(restored);
        setData(restored);
        dataRef.current = restored;
        const remoteUser = {
          id: result.user.id,
          companyId: result.user.companyId,
          name: result.user.name,
          email: result.user.email,
          role: (result.user.role || "vendedor") as User["role"],
          mustChangePassword: Boolean(result.user.mustChangePassword)
        } as User;
        const token = result.token || "";
        const passwordHash = await hashPassword(authState.password);
        const establishments = normalizedEstablishments(restored.issuer).filter((item) => item.active !== false);
        if (establishments.length > 1) {
          authState.setPendingLogin({ data: restored, user: remoteUser, token, passwordHash });
          authState.setEstablishmentOptionsVisible(true);
          authState.setLoginStatus(null);
          authState.setCompanyOptions([]);
          return;
        }

        await enterSession(restored, remoteUser, token, passwordHash);
        return;
      } catch (error) {
        const options = error instanceof Error ? (error as Error & { companyOptions?: { id: string; ruc: string; tradeName?: string; businessName?: string; role?: string }[] }).companyOptions : undefined;
        if (options?.length) {
          authState.setCompanyOptions(options);
          authState.setLoginStatus({ tone: "info", message: "Elija la empresa con la que desea trabajar." });
          return;
        }
        const message = loginErrorMessage(error);
        if (!isBackendConnectionError(error)) {
          const friendly = /^\d{13}$/.test(identifier) && message.includes("No encontramos")
            ? "No encontramos una empresa activa con ese RUC o la clave no coincide."
            : message;
          authState.setLoginStatus({ tone: "error", message: friendly });
          authState.setLoginErrorModalMessage(friendly);
          return;
        }
        authState.setLoginStatus({ tone: "info", message: "Sin conexion con el servidor. Validando sesion guardada en este dispositivo..." });
      }

      const passwordHash = await hashPassword(authState.password);
      const storedSession = await loadSession();
      if (storedSession?.user) {
        const storedEmailMatches = storedSession.user.email.trim().toLowerCase() === normalizedIdentifier;
        const rucMatches = /^\d{13}$/.test(identifier) && (storedSession.companyRuc === identifier || dataRef.current.issuer.ruc === identifier);
        const passwordMatches = storedSession.passwordHash ? storedSession.passwordHash === passwordHash : Boolean(storedSession.token);
        if ((storedEmailMatches || rucMatches) && passwordMatches) {
          const localData = sanitizeAppData({ ...dataRef.current, backendUrl, autoBackupEnabled: true, autoBackupLastError: "" });
          await enterSession(localData, storedSession.user, storedSession.token || "", storedSession.passwordHash || passwordHash);
          return;
        }
      }

      const found = dataRef.current.users.find((user) => {
        const emailMatches = user.email.trim().toLowerCase() === normalizedIdentifier;
        return emailMatches && (user.passwordHash === passwordHash || user.password === authState.password);
      });
      const rucUser = /^\d{13}$/.test(identifier) && dataRef.current.issuer.ruc === identifier
        ? dataRef.current.users.find((user) => user.passwordHash === passwordHash || user.password === authState.password)
        : undefined;
      const localUser = found || rucUser;
      if (!localUser) {
        const message = "No hay conexion con el servidor y no existe una sesion local valida para esos datos.";
        authState.setLoginStatus({ tone: "error", message });
        authState.setLoginErrorModalMessage(message);
        return;
      }
      const localEstablishments = normalizedEstablishments(dataRef.current.issuer).filter((item) => item.active !== false);
      const localData = sanitizeAppData({ ...dataRef.current, backendUrl, autoBackupEnabled: true, autoBackupLastError: "" });
      if (localEstablishments.length > 1) {
        authState.setPendingLogin({ data: localData, user: localUser, token: "", passwordHash });
        authState.setEstablishmentOptionsVisible(true);
        authState.setLoginStatus(null);
        return;
      }
      await enterSession(localData, localUser, "", passwordHash);
    };

    const registerTenant = async () => {
      if (authState.registering) return;
      authState.setRegisterStatus(null);
      const backendUrl = authState.authBackendUrl.trim();
      const form = {
        ...authState.registerForm,
        ruc: authState.registerForm.ruc.trim(),
        businessName: authState.registerForm.businessName.trim(),
        tradeName: authState.registerForm.tradeName.trim(),
        adminName: authState.registerForm.adminName.trim(),
        email: authState.registerForm.email.trim().toLowerCase()
      };
      if (!form.ruc || !form.businessName || !form.adminName || !form.email || !form.password) {
        authState.setRegisterStatus({ tone: "error", message: "Complete RUC, negocio, administrador, correo y contrasena." });
        Alert.alert("Datos incompletos", "Ingrese RUC, nombre del negocio, nombre del administrador, correo y contrasena.");
        return;
      }
      if (!isValidUrl(backendUrl)) {
        authState.setRegisterStatus({ tone: "error", message: "Ingrese una URL valida del servidor." });
        Alert.alert("URL del servidor", "Ingrese una URL valida del servidor para crear la cuenta.");
        return;
      }
      if (form.password.length < 8) {
        authState.setRegisterStatus({ tone: "error", message: "La contrasena debe tener al menos 8 caracteres." });
        Alert.alert("Contrasena corta", "Use al menos 8 caracteres para proteger la cuenta.");
        return;
      }
      if (form.password !== form.confirmPassword) {
        authState.setRegisterStatus({ tone: "error", message: "Las contrasenas no coinciden." });
        Alert.alert("Contrasenas distintas", "Confirme la misma contrasena.");
        return;
      }

      authState.setRegistering(true);
      authState.setRegisterStatus({ tone: "info", message: "Creando cuenta y preparando la empresa..." });

      try {
        const result = await registerBackend<AppData>(backendUrl, {
          company: {
            ruc: form.ruc,
            businessName: form.businessName,
            tradeName: form.tradeName || form.businessName,
            address: "Ecuador"
          },
          admin: {
            name: form.adminName,
            email: form.email,
            password: form.password
          },
          device: {
            deviceId: `${Platform.OS}-${generateId()}`,
            deviceLabel: Platform.OS,
            platform: Platform.OS
          }
        });

        const snapshot = result.snapshot!;
        const registeredData = sanitizeAppData({
          ...initialData,
          ...snapshot.data,
          backendUrl,
          autoBackupEnabled: true,
          autoBackupLastAt: snapshot.updatedAt,
          autoBackupLastError: "",
          pendingSync: []
        });
        await saveData(registeredData);
        const user = {
          id: result.user!.id,
          name: result.user!.name,
          email: result.user!.email,
          role: (result.user!.role || "admin") as User["role"]
        } as User;
        const passwordHash = await hashPassword(form.password);

        const enterApp = () => {
          setData(registeredData);
          dataRef.current = registeredData;
          setBackendToken(result.token || "");
          backendTokenRef.current = result.token || "";
          setSession(user);
          sessionRef.current = user;
          void saveSession(user, result.token || "", passwordHash, registeredData.issuer.ruc);
          authState.setEmail(form.email);
          authState.setPassword("");
          authState.setAuthMode("login");
          authState.setRegisterForm(authState.emptyRegisterForm);
          authState.setRegisterStatus(null);
          authState.setRegistering(false);
          setSyncState("synced");
          setOnboardingVisible(true);
        };

        authState.setRegisterStatus({ tone: "success", message: "Cuenta creada. Demo activa por 30 dias." });
        enterApp();
        showMessage("Cuenta creada", "Demo activa por 30 dias. Ya puede configurar su empresa y empezar a vender.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Revise los datos e intente nuevamente.";
        authState.setRegistering(false);
        authState.setRegisterStatus({ tone: "error", message });
        Alert.alert("No se pudo crear la cuenta", message);
      }
    };

    const recoverPassword = async () => {
      if (authState.recoveringPassword) return;
      const backendUrl = authState.authBackendUrl.trim();
      const identifier = authState.recoveryIdentifier.trim() || authState.email.trim();
      authState.setRecoverStatus(null);

      if (!isValidUrl(backendUrl)) {
        authState.setRecoverStatus({ tone: "error", message: "Ingrese una URL valida del servidor." });
        return;
      }
      if (!identifier) {
        authState.setRecoverStatus({ tone: "error", message: "Ingrese el correo o RUC de la cuenta." });
        return;
      }

      authState.setRecoveringPassword(true);
      authState.setRecoverStatus({ tone: "info", message: "Enviando clave temporal..." });
      try {
        const result = await requestPasswordReset(backendUrl, identifier);
        authState.setRecoverStatus({ tone: "success", message: result.message || `Clave temporal enviada a ${result.email || "su correo"}.` });
        authState.setEmail(identifier);
        authState.setPassword("");
      } catch (error) {
        authState.setRecoverStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo recuperar la contrasena." });
      } finally {
        authState.setRecoveringPassword(false);
      }
    };

    const submitNewPassword = async () => {
      const nextPassword = authState.newPasswordForm.password.trim();
      if (nextPassword.length < 8) {
        authState.setPasswordChangeStatus({ tone: "error", message: "La nueva contrasena debe tener al menos 8 caracteres." });
        return;
      }
      if (nextPassword !== authState.newPasswordForm.confirm.trim()) {
        authState.setPasswordChangeStatus({ tone: "error", message: "Las contrasenas no coinciden." });
        return;
      }
      if (!sessionRef.current) return;
      authState.setChangingPassword(true);
      authState.setPasswordChangeStatus({ tone: "info", message: "Guardando nueva contrasena..." });
      try {
        const result = await changeBackendPassword(dataRef.current.backendUrl, nextPassword, backendTokenRef.current);
        const changedUser = result.user!;
        const passwordHash = await hashPassword(nextPassword);
        const updatedUser: User = {
          ...sessionRef.current,
          ...changedUser,
          role: (changedUser.role || sessionRef.current.role) as UserRole,
          passwordHash,
          mustChangePassword: false
        };
        const nextUsers = dataRef.current.users.map((user) =>
          user.id === updatedUser.id || user.email.trim().toLowerCase() === updatedUser.email.trim().toLowerCase()
            ? { ...user, password: undefined, passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() }
            : user
        );
        const nextData = { ...dataRef.current, users: nextUsers };
        await saveData(nextData);
        await saveSession(updatedUser, result.token || backendTokenRef.current, passwordHash, nextData.issuer.ruc);
        setData(nextData);
        dataRef.current = nextData;
        setSession(updatedUser);
        sessionRef.current = updatedUser;
        setBackendToken(result.token || backendTokenRef.current);
        backendTokenRef.current = result.token || backendTokenRef.current;
        authState.setPasswordChangeVisible(false);
        authState.setPasswordChangeStatus(null);
        Alert.alert("Contrasena actualizada", "Su nueva contrasena quedo guardada correctamente.");
      } catch (error) {
        authState.setPasswordChangeStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo cambiar la contrasena." });
      } finally {
        authState.setChangingPassword(false);
      }
    };

        const logout = () => {
          setAppMenuVisible(false);
          setOnboardingVisible(false);
          setEstablishmentSwitcherVisible(false);
          authState.setPendingLogin(null);
          authState.setPasswordChangeVisible(false);
          authState.setNewPasswordForm({ password: "", confirm: "" });
          authState.setPasswordChangeStatus(null);
          setBackendToken("");
          backendTokenRef.current = "";
          setSession(null);
          sessionRef.current = null;
          void clearSession();
          setTab("dashboard");
          authState.setAuthMode("login");
          authState.setRegistering(false);
          authState.setRegisterStatus(null);
          authState.setRegisterForm(authState.emptyRegisterForm);
        };

        return {
          login,
          registerTenant,
          recoverPassword,
          chooseLoginEstablishment,
          submitNewPassword,
          logout
        };
  }, [
    authState,
    dataRef,
    sessionRef,
    backendTokenRef,
    setData,
    setSession,
    setBackendToken,
    setSyncState,
    setAppMenuVisible,
    setEstablishmentSwitcherVisible,
    setOnboardingVisible,
    setTab
  ]);

  return authActions;
}
