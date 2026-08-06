import React from "react";
import { AuthState } from "../hooks/useAuthState";
import { normalizedEstablishments } from "../utils/establishments";
import { AuthScreen } from "./AuthScreen";

type AppAuthGateProps = {
  authState: AuthState;
  chooseLoginEstablishment: (id: string) => Promise<void> | void;
  login: (companyId?: string) => Promise<void> | void;
  recoverPassword: () => Promise<void> | void;
  registerTenant: () => Promise<void> | void;
};

export function AppAuthGate({
  authState,
  chooseLoginEstablishment,
  login,
  recoverPassword,
  registerTenant
}: AppAuthGateProps) {
  return (
    <AuthScreen
      authMode={authState.authMode}
      authBackendUrl={authState.authBackendUrl}
      setAuthBackendUrl={authState.setAuthBackendUrl}
      email={authState.email}
      setEmail={authState.setEmail}
      username={authState.username}
      setUsername={authState.setUsername}
      password={authState.password}
      setPassword={authState.setPassword}
      showLoginPassword={authState.showLoginPassword}
      setShowLoginPassword={authState.setShowLoginPassword}
      login={login}
      loggingIn={authState.loggingIn}
      loginStatus={authState.loginStatus}
      loginErrorModalMessage={authState.loginErrorModalMessage}
      setLoginErrorModalMessage={authState.setLoginErrorModalMessage}
      companyOptions={authState.companyOptions}
      registerForm={authState.registerForm}
      setRegisterForm={authState.setRegisterForm}
      registering={authState.registering}
      registerStatus={authState.registerStatus}
      registerTenant={registerTenant}
      recoveryIdentifier={authState.recoveryIdentifier}
      setRecoveryIdentifier={authState.setRecoveryIdentifier}
      recoverPassword={recoverPassword}
      recoverStatus={authState.recoverStatus}
      recoveringPassword={authState.recoveringPassword}
      onOpenRegister={() => authState.setAuthMode("register")}
      onOpenForgot={() => {
        authState.setRecoveryIdentifier(authState.email);
        authState.setRecoverStatus(null);
        authState.setAuthMode("forgot");
      }}
      onCancelRegister={() => {
        authState.setAuthMode("login");
        authState.setRegisterStatus(null);
        authState.setRegistering(false);
      }}
      onCancelForgot={() => {
        authState.setAuthMode("login");
        authState.setRecoverStatus(null);
        authState.setRecoveringPassword(false);
      }}
      establishments={authState.pendingLogin ? normalizedEstablishments(authState.pendingLogin.data.issuer).filter((item) => item.active !== false) : []}
      establishmentOptionsVisible={authState.establishmentOptionsVisible}
      chooseLoginEstablishment={chooseLoginEstablishment}
      onCancelEstablishmentSelection={() => {
        authState.setPendingLogin(null);
        authState.setEstablishmentOptionsVisible(false);
        authState.setCompanyOptions([]);
        authState.setLoginStatus(null);
        authState.setLoginErrorModalMessage("");
      }}
    />
  );
}
