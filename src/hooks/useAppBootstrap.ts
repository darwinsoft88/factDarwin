import React, { useEffect, useState } from "react";
import { clearSession, initialData, loadData, loadSession, saveSession } from "../database";
import { AppData, User } from "../types";
import { isSessionTokenExpired } from "../utils/sessionToken";

type StatusMessage = { tone: "info" | "error" | "success"; message: string } | null;

type UseAppBootstrapParams = {
  backendTokenRef: React.MutableRefObject<string>;
  dataRef: React.MutableRefObject<AppData>;
  sessionRef: React.MutableRefObject<User | null>;
  setBackendToken: React.Dispatch<React.SetStateAction<string>>;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setPasswordChangeStatus: React.Dispatch<React.SetStateAction<StatusMessage>>;
  setPasswordChangeVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSession: React.Dispatch<React.SetStateAction<User | null>>;
};

export function useAppBootstrap({
  backendTokenRef,
  dataRef,
  sessionRef,
  setBackendToken,
  setData,
  setEmail,
  setPasswordChangeStatus,
  setPasswordChangeVisible,
  setSession
}: UseAppBootstrapParams) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [storedData, storedSession] = await Promise.all([loadData(), loadSession()]);
        setData(storedData);
        dataRef.current = storedData;
        if (storedSession?.user) {
          const storedToken = storedSession.token || "";
          if (!storedToken || isSessionTokenExpired(storedToken)) {
            if (storedToken) {
              await saveSession(storedSession.user, "", storedSession.passwordHash || "", storedSession.companyRuc || storedData.issuer.ruc);
            } else {
              await clearSession();
            }
            setEmail(storedSession.user.email);
            return;
          }
          setSession(storedSession.user);
          sessionRef.current = storedSession.user;
          if (storedSession.user.mustChangePassword) {
            setPasswordChangeVisible(true);
            setPasswordChangeStatus({ tone: "info", message: "Por seguridad, cree una nueva contrasena para reemplazar la clave temporal." });
          }
          setBackendToken(storedToken);
          backendTokenRef.current = storedToken;
          setEmail(storedSession.user.email);
          if (storedData.issuer.ruc && storedSession.companyRuc !== storedData.issuer.ruc) {
            void saveSession(storedSession.user, storedToken, storedSession.passwordHash || "", storedData.issuer.ruc);
          }
        }
      } catch {
        setData(initialData);
        dataRef.current = initialData;
      } finally {
        setReady(true);
      }
    };

    void bootstrap();
  }, [backendTokenRef, dataRef, sessionRef, setBackendToken, setData, setEmail, setPasswordChangeStatus, setPasswordChangeVisible, setSession]);

  return ready;
}
