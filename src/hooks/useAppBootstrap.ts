import React, { useEffect, useState } from "react";
import { initialData, loadData, loadSession, saveSession } from "../storage";
import { AppData, User } from "../types";

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
    Promise.all([loadData(), loadSession()])
      .then(([storedData, storedSession]) => {
        setData(storedData);
        dataRef.current = storedData;
        if (storedSession?.user) {
          setSession(storedSession.user);
          sessionRef.current = storedSession.user;
          if (storedSession.user.mustChangePassword) {
            setPasswordChangeVisible(true);
            setPasswordChangeStatus({ tone: "info", message: "Por seguridad, cree una nueva contrasena para reemplazar la clave temporal." });
          }
          setBackendToken(storedSession.token || "");
          backendTokenRef.current = storedSession.token || "";
          setEmail(storedSession.user.email);
          if (storedData.issuer.ruc && storedSession.companyRuc !== storedData.issuer.ruc) {
            void saveSession(storedSession.user, storedSession.token || "", storedSession.passwordHash || "", storedData.issuer.ruc);
          }
        }
      })
      .catch(() => {
        setData(initialData);
        dataRef.current = initialData;
      })
      .finally(() => setReady(true));
  }, [backendTokenRef, dataRef, sessionRef, setBackendToken, setData, setEmail, setPasswordChangeStatus, setPasswordChangeVisible, setSession]);

  return ready;
}
