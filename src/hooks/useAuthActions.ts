import { Alert, Platform } from "react-native";
import { useMemo, useRef } from "react";
import { authenticateWithPasskey, loginBackend, registerBackend, requestPasswordReset, restoreAppData, changeBackendPassword } from "../services/backend";
import { hashPassword } from "../services/security";
import { upsertOfflineUser } from "../utils/authOffline";
import { isBackendConnectionError, loginErrorMessage } from "../utils/errors";
import { normalizedEstablishments, issuerWithEstablishment } from "../utils/establishments";
import { showMessage } from "../utils/dialogs";
import { isSessionTokenExpired } from "../utils/sessionToken";
import { mergeAppDataSnapshots } from "../utils/dataMerge";
import { sanitizeAppData, isValidUrl } from "../validation";
import { clearSession, loadSession, saveData, saveSession, initialData, PRODUCTION_BACKEND_URL } from "../database";
import type { AppData, User, UserRole } from "../types";
import type { SyncState } from "../utils/support";
import type { AuthState } from "./useAuthState";
import type { AppTab } from "../utils/appAccess";
import toast from "../services/toast";
import { getIncrementalDeviceId } from "../services/incrementalDeviceIdentity";
import { clearBiometricCredential, loadBiometricAccountHint, loadLegacyBiometricCredential } from "../services/biometricCredentialStorage";
import { saveBiometricLockEnabled } from "../services/biometricLockStorage";
import { markBiometricAuthenticationCompleted } from "../services/biometricAuthenticationSession";
import { refreshRegisteredDeviceSession, registerCurrentDeviceSession, shouldInvalidateDeviceCredential } from "../services/deviceSessionCoordinator";
import { loadPasskeyAccountHint } from "../services/passkeyHintStorage";

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
  loginWithBiometrics: () => Promise<void>;
  registerTenant: () => Promise<void>;
  recoverPassword: () => Promise<void>;
  chooseLoginEstablishment: (establishmentId: string) => Promise<void>;
  submitNewPassword: () => Promise<void>;
  logout: () => void;
};

export function useAuthActions({ authState, dataRef, sessionRef, backendTokenRef, setData, setSession, setBackendToken, setSyncState, setAppMenuVisible, setEstablishmentSwitcherVisible, setTab, setOnboardingVisible }: UseAuthActionsParams): AuthActions {
  const choosingLoginEstablishmentRef = useRef(false);
  const loginRunningRef = useRef(false);
  const registrationRunningRef = useRef(false);
  const authActions = useMemo(() => {
    const enterSession = async (nextData: AppData, nextUser: User, token: string, passwordHash = "", connectionMode: "online" | "offline" = "online"
    ) => {
      let sessionToken = token;
      if (!sessionToken) {
        const storedSession = await loadSession();
        const sameUser = storedSession?.user && (
          storedSession.user.id === nextUser.id ||
          storedSession.user.email.trim().toLowerCase() === nextUser.email.trim().toLowerCase() ||
          (storedSession.companyRuc && storedSession.companyRuc === nextData.issuer.ruc)
        );
        if (sameUser && storedSession?.token && !isSessionTokenExpired(storedSession.token)) sessionToken = storedSession.token;
      }

      await saveData(nextData);
      await saveSession(nextUser, sessionToken, passwordHash, nextData.issuer.ruc);
      if (Platform.OS !== "web" && connectionMode === "online" && sessionToken) {
        const legacyCredential = await loadLegacyBiometricCredential();
        if (legacyCredential && legacyCredential.companyId === nextUser.companyId && legacyCredential.userId === nextUser.id) {
          try {
            await registerCurrentDeviceSession({
              backendUrl: nextData.backendUrl,
              accessToken: sessionToken,
              companyRuc: nextData.issuer.ruc,
              establishmentId: nextData.issuer.activeEstablishmentId || "",
              user: nextUser,
              platform: Platform.OS
            });
          } catch {
            toast.warning("Biometría pendiente", "Ingresó correctamente, pero falta confirmar la migración biométrica desde Mi perfil.");
          }
        }
      }
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
      toast.success(`¡Bienvenido, ${nextUser.name}!`, connectionMode === "offline" ? "Ingresaste en modo sin conexión. Tus cambios se guardarán en este dispositivo." : "Inicio de sesión exitoso.");

    };

    const chooseLoginEstablishment = async (establishmentId: string) => {
      if (choosingLoginEstablishmentRef.current || !authState.pendingLogin) return;
      choosingLoginEstablishmentRef.current = true;
      try {
        authState.setLoginErrorModalMessage("");
        authState.setLoginStatus(null);
        const pendingLogin = authState.pendingLogin;
        const establishment = normalizedEstablishments(pendingLogin.data.issuer).find((item) => item.id === establishmentId);
        if (!establishment) return;
        const nextIssuer = issuerWithEstablishment({ ...pendingLogin.data.issuer, activeEstablishmentId: establishment.id }, establishment);
        if (pendingLogin.authenticationMethod === "biometric") {
          markBiometricAuthenticationCompleted(pendingLogin.user.companyId || pendingLogin.data.issuer.ruc, pendingLogin.user.id);
        }
        await enterSession({ ...pendingLogin.data, issuer: nextIssuer }, pendingLogin.user, pendingLogin.token, pendingLogin.passwordHash || "");
      } finally {
        choosingLoginEstablishmentRef.current = false;
      }
    };

    const loginWithBiometrics = async () => {
      if (loginRunningRef.current) return;
      loginRunningRef.current = true;
      authState.setLoggingIn(true);
      authState.setLoginStatus({ tone: "info", message: "Confirmando identidad..." });
      authState.setLoginErrorModalMessage("");
      try {
        if (Platform.OS === "web") {
          const hint = await loadPasskeyAccountHint();
          if (!hint) throw new Error("Active primero Face ID desde Mi perfil.");
          const result = await authenticateWithPasskey(hint.backendUrl);
          if (!result.user || !result.token) throw new Error("El servidor no devolvio una sesion valida.");
          if (result.user.id !== hint.userId || result.user.companyId !== hint.companyId) {
            throw new Error("La Passkey pertenece a una cuenta diferente.");
          }
          const snapshot = await restoreAppData<AppData>(hint.backendUrl, result.token);
          if (!snapshot?.data) throw new Error("El servidor no devolvio los datos de la empresa.");
          const remoteRuc = String(snapshot.data.issuer?.ruc || "").replace(/\D/g, "");
          if (!remoteRuc || remoteRuc !== hint.companyRuc.replace(/\D/g, "")) {
            throw new Error("La empresa recibida no coincide con la Passkey.");
          }
          const remoteUser = {
            id: result.user.id,
            companyId: result.user.companyId,
            name: result.user.name,
            email: result.user.email,
            role: (result.user.role || "vendedor") as User["role"],
            mustChangePassword: Boolean(result.user.mustChangePassword),
            supportAccess: Boolean(result.user.supportAccess)
          } as User;
          const restoredBase = {
            ...snapshot.data,
            backendUrl: hint.backendUrl,
            autoBackupEnabled: true,
            autoBackupLastAt: snapshot.updatedAt,
            autoBackupLastError: ""
          };
          const localBeforeLogin = dataRef.current;
          const sameCompany = String(localBeforeLogin.issuer?.ruc || "").replace(/\D/g, "") === remoteRuc;
          const restored = sanitizeAppData(sameCompany
            ? { ...mergeAppDataSnapshots(restoredBase, localBeforeLogin), backendUrl: hint.backendUrl, autoBackupEnabled: true }
            : restoredBase);
          const establishments = normalizedEstablishments(restored.issuer).filter((item) => item.active !== false);
          if (establishments.length > 1) {
            authState.setPendingLogin({ data: restored, user: remoteUser, token: result.token, authenticationMethod: "passkey" });
            authState.setEstablishmentOptionsVisible(true);
            authState.setLoginStatus(null);
            return;
          }
          await enterSession(restored, remoteUser, result.token);
          return;
        }
        const accountHint = await loadBiometricAccountHint();
        if (accountHint?.version === 1) {
          throw new Error("Actualice su acceso biométrico ingresando una última vez con su contraseña.");
        }
        const renewed = await refreshRegisteredDeviceSession();
        const credential = renewed.credential;
        const snapshot = await restoreAppData<AppData>(credential.backendUrl, renewed.token);
        if (!snapshot?.data) throw new Error("El servidor no devolvió los datos de la empresa.");
        const remoteRuc = String(snapshot.data.issuer?.ruc || "").replace(/\D/g, "");
        const expectedRuc = credential.companyRuc.replace(/\D/g, "");
        if (!remoteRuc || remoteRuc !== expectedRuc) {
          throw new Error("La empresa recibida no coincide con la cuenta biométrica protegida.");
        }
        const establishments = normalizedEstablishments(snapshot.data.issuer);
        const remembered = establishments.find((item) => item.id === credential.establishmentId && item.active !== false);
        const issuer = remembered
          ? issuerWithEstablishment({ ...snapshot.data.issuer, activeEstablishmentId: remembered.id }, remembered)
          : snapshot.data.issuer;
        const restoredBase = {
          ...snapshot.data,
          issuer,
          backendUrl: credential.backendUrl,
          autoBackupEnabled: true,
          autoBackupLastAt: snapshot.updatedAt,
          autoBackupLastError: ""
        };
        const localBeforeLogin = dataRef.current;
        const sameCompany = String(localBeforeLogin.issuer?.ruc || "").replace(/\D/g, "") === expectedRuc;
        const restored = sanitizeAppData(sameCompany
          ? { ...mergeAppDataSnapshots(restoredBase, localBeforeLogin), backendUrl: credential.backendUrl, autoBackupEnabled: true }
          : restoredBase);
        const activeEstablishments = normalizedEstablishments(restored.issuer).filter((item) => item.active !== false);
        if (activeEstablishments.length > 1) {
          authState.setPendingLogin({
            data: restored,
            user: credential.user,
            token: renewed.token,
            authenticationMethod: "biometric"
          });
          authState.setEstablishmentOptionsVisible(true);
          authState.setLoginStatus(null);
          return;
        }
        markBiometricAuthenticationCompleted(credential.companyId, credential.userId);
        await enterSession(restored, renewed.user, renewed.token);
      } catch (error) {
        if (shouldInvalidateDeviceCredential(error)) {
          const accountHint = await loadBiometricAccountHint();
          await clearBiometricCredential();
          if (accountHint) await saveBiometricLockEnabled(accountHint.companyId, accountHint.userId, false);
        }
        const message = error instanceof Error ? error.message : "No se pudo iniciar con biometría.";
        authState.setLoginStatus({ tone: "error", message });
        authState.setLoginErrorModalMessage(message);
      } finally {
        loginRunningRef.current = false;
        authState.setLoggingIn(false);
      }
    };

    const loginAttempt = async (companyId = "") => {
      const identifier = authState.email.trim();
      const isRucLogin = /^\d{13}$/.test(identifier);
      const username = authState.username.trim();

      if (isRucLogin && !username) {
        const message =
          "Ingrese el usuario para iniciar sesión con el RUC.";

        authState.setLoginStatus({
          tone: "error",
          message
        });

        authState.setLoginErrorModalMessage(message);
       // toast.error("No se pudo iniciar sesión", message);
        return;
      }
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
        //toast.error("No se pudo iniciar sesión", message);
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
        const deviceId = await getIncrementalDeviceId();
        const result = await loginBackend(
          backendUrl,
          identifier,
          authState.password,
          isRucLogin ? username : "",
          companyId,
          { deviceId, deviceLabel: Platform.OS, platform: Platform.OS }
        );
        authState.setLoginStatus({ tone: "info", message: "Acceso validado. Cargando datos de la empresa..." });
        const snapshot = await restoreAppData<AppData>(backendUrl, result.token || "");
        if (!result.user || !snapshot?.data) {
          const message = "El servidor valido el acceso, pero no devolvio los datos de la empresa. Intente nuevamente.";
          authState.setLoginStatus({ tone: "error", message });
          //Alert.alert("No se pudo cargar la empresa", message);
          authState.setLoginErrorModalMessage(message);
          return;
        }

        const passwordHash = await hashPassword(authState.password);
        const remoteUser = {
          id: result.user.id,
          companyId: result.user.companyId,
          name: result.user.name,
          email: result.user.email,
          role: (result.user.role || "vendedor") as User["role"],
          mustChangePassword: Boolean(result.user.mustChangePassword),
          supportAccess: Boolean(result.user.supportAccess)
        } as User;
        const restoredBase = {
          ...snapshot.data,
          backendUrl,
          autoBackupEnabled: true,
          autoBackupLastAt: snapshot.updatedAt,
          autoBackupLastError: ""
        };
        const localBeforeLogin = dataRef.current;
        const sameCompany = String(localBeforeLogin.issuer?.ruc || "").replace(/\D/g, "") === String(restoredBase.issuer?.ruc || "").replace(/\D/g, "");
        const restoredSource = sameCompany ? { ...mergeAppDataSnapshots(restoredBase, localBeforeLogin), backendUrl, autoBackupEnabled: true } : restoredBase;
        const restored = sanitizeAppData(remoteUser.supportAccess ? restoredSource : upsertOfflineUser(restoredSource, remoteUser, passwordHash));
        const loginRuc = /^\d{13}$/.test(identifier) ? identifier : "";
        const restoredRuc = restored.issuer.ruc.replace(/\D/g, "");
        if (loginRuc && restoredRuc && restoredRuc !== loginRuc) {
          const message = `El servidor devolvio datos del RUC ${restoredRuc}, pero usted ingreso ${loginRuc}. Se cancelo el ingreso para evitar mezcla de empresas.`;
          authState.setLoginStatus({ tone: "error", message });
          authState.setLoginErrorModalMessage(message);
          return;
        }

        const token = result.token || "";
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
          const uniqueOptions = uniqueCompanyOptions(options);
          if (!companyId && /^\d{13}$/.test(identifier) && uniqueOptions.length === 1) {
            const singleCompany = uniqueOptions[0];
            if (!singleCompany) return;
            await loginAttempt(singleCompany.id);
            return;
          }
          authState.setCompanyOptions(uniqueOptions);
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
      const normalizedUsername = authState.username.trim().toLowerCase();
      const storedSession = await loadSession();
      if (storedSession?.user) {
        const validStoredToken = storedSession.token && !isSessionTokenExpired(storedSession.token) ? storedSession.token : "";
        const storedEmailMatches = storedSession.user.email.trim().toLowerCase() === normalizedIdentifier;
        const rucMatches = /^\d{13}$/.test(identifier) && (storedSession.companyRuc === identifier || dataRef.current.issuer.ruc === identifier);
        const passwordMatches = storedSession.passwordHash ? storedSession.passwordHash === passwordHash : Boolean(validStoredToken);
        const storedUserMatches =
          !isRucLogin ||
          storedSession.user.name.trim().toLowerCase() === normalizedUsername ||
          storedSession.user.email
            .trim()
            .toLowerCase()
            .split("@")[0] === normalizedUsername;
        if (
          (storedEmailMatches || (rucMatches && storedUserMatches)) &&
          passwordMatches
        ) {
          const localData = sanitizeAppData({ ...dataRef.current, backendUrl, autoBackupEnabled: true, autoBackupLastError: "" });
          await enterSession(localData, storedSession.user, validStoredToken, storedSession.passwordHash || passwordHash, "offline");
          return;
        }
      }


      const found = dataRef.current.users.find((user) => {
        const emailMatches =
          user.email.trim().toLowerCase() === normalizedIdentifier;

        const passwordMatches =
          user.passwordHash === passwordHash ||
          user.password === authState.password;

        return emailMatches && passwordMatches;
      });

      const rucUser =
        isRucLogin &&
          dataRef.current.issuer.ruc.replace(/\D/g, "") === identifier
          ? dataRef.current.users.find((user) => {
            const nameMatches =
              user.name.trim().toLowerCase() === normalizedUsername;

            const emailUsername =
              user.email.trim().toLowerCase().split("@")[0] || "";

            const emailUsernameMatches =
              emailUsername === normalizedUsername;

            const passwordMatches =
              user.passwordHash === passwordHash ||
              user.password === authState.password;

            return (
              (nameMatches || emailUsernameMatches) &&
              passwordMatches
            );
          })
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
      await enterSession(localData, localUser, "", passwordHash, "offline");
    };

    const login = async (companyId = "") => {
      if (loginRunningRef.current) return;
      loginRunningRef.current = true;
      authState.setLoggingIn(true);
      try {
        await loginAttempt(companyId);
      } finally {
        loginRunningRef.current = false;
        authState.setLoggingIn(false);
      }
    };

    const registerTenant = async () => {
      if (registrationRunningRef.current) return;
      registrationRunningRef.current = true;
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
      if (__DEV__ && Platform.OS === "web" && backendUrl === PRODUCTION_BACKEND_URL) {
        const message = "Registro bloqueado: una prueba local no puede crear empresas en el servidor de produccion.";
        authState.setRegisterStatus({ tone: "error", message });
        Alert.alert("Servidor de produccion bloqueado", "Use http://localhost:4000 para realizar pruebas locales.");
        registrationRunningRef.current = false;
        return;
      }
      if (!form.ruc || !form.businessName || !form.adminName || !form.email || !form.password) {
        authState.setRegisterStatus({ tone: "error", message: "Complete RUC, negocio, administrador, correo y contrasena." });
        Alert.alert("Datos incompletos", "Ingrese RUC, nombre del negocio, nombre del administrador, correo y contrasena.");
        registrationRunningRef.current = false;
        return;
      }
      if (!isValidUrl(backendUrl)) {
        authState.setRegisterStatus({ tone: "error", message: "Ingrese una URL valida del servidor." });
        Alert.alert("URL del servidor", "Ingrese una URL valida del servidor para crear la cuenta.");
        registrationRunningRef.current = false;
        return;
      }
      if (form.password.length < 8) {
        authState.setRegisterStatus({ tone: "error", message: "La contrasena debe tener al menos 8 caracteres." });
        Alert.alert("Contrasena corta", "Use al menos 8 caracteres para proteger la cuenta.");
        registrationRunningRef.current = false;
        return;
      }
      if (form.password !== form.confirmPassword) {
        authState.setRegisterStatus({ tone: "error", message: "Las contrasenas no coinciden." });
        Alert.alert("Contrasenas distintas", "Confirme la misma contrasena.");
        registrationRunningRef.current = false;
        return;
      }

      authState.setRegistering(true);
      authState.setRegisterStatus({ tone: "info", message: "Creando cuenta y preparando la empresa..." });

      try {
        const deviceId = await getIncrementalDeviceId();
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
            deviceId,
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
          companyId: result.user!.companyId || result.company?.id,
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

        authState.setRegisterStatus({ tone: "success", message: "Cuenta creada. Demo activa por 3 meses." });
        enterApp();
        showMessage("Cuenta creada", "Demo activa por 3 meses. Ya puede configurar su empresa y empezar a vender.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Revise los datos e intente nuevamente.";
        authState.setRegisterStatus({ tone: "error", message });
        Alert.alert("No se pudo crear la cuenta", message);
      } finally {
        registrationRunningRef.current = false;
        authState.setRegistering(false);
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
        //Alert.alert("Contrasena actualizada", "Su nueva contrasena quedo guardada correctamente.");
        toast.success("Contraseña actualizada", "Su nueva contraseña quedó guardada correctamente."
        );
      } catch (error) {
        authState.setPasswordChangeStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo cambiar la contrasena." });
      } finally {
        authState.setChangingPassword(false);
      }
    };

    const logout = () => {
      const pendingCount = dataRef.current.pendingSync?.length || 0;
      const hasBackupError = Boolean(dataRef.current.autoBackupLastError);
      if (pendingCount > 0 || hasBackupError) {
        setAppMenuVisible(false);
        Alert.alert(
          "Sincronizacion pendiente",
          pendingCount > 0
            ? `Este dispositivo tiene ${pendingCount} cambio(s) pendiente(s) por subir. Sincronice antes de cerrar sesion para no perder documentos locales.`
            : "Este dispositivo tiene cambios locales pendientes por subir. Sincronice antes de cerrar sesion."
        );
        return;
      }
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
      loginWithBiometrics,
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

function uniqueCompanyOptions<T extends { id: string; ruc: string }>(options: T[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.id || option.ruc;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
