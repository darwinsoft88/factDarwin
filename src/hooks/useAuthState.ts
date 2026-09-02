import { useState, Dispatch, SetStateAction } from "react";
import type { BackendCompanyOption } from "../services/backend";
import type { AppData, User } from "../types";

export type AuthMode = "login" | "register" | "forgot";

export type AuthState = {
  authMode: AuthMode;
  setAuthMode: React.Dispatch<React.SetStateAction<AuthMode>>;
  registering: boolean;
  setRegistering: React.Dispatch<React.SetStateAction<boolean>>;
  registerStatus: { tone: "info" | "error" | "success"; message: string } | null;
  setRegisterStatus: Dispatch<SetStateAction<{ tone: "info" | "error" | "success"; message: string } | null>>;
  recoveringPassword: boolean;
  setRecoveringPassword: React.Dispatch<React.SetStateAction<boolean>>;
  recoverStatus: { tone: "info" | "error" | "success"; message: string } | null;
  setRecoverStatus: Dispatch<SetStateAction<{ tone: "info" | "error" | "success"; message: string } | null>>;
  loginStatus: { tone: "info" | "error" | "success"; message: string } | null;
  setLoginStatus: Dispatch<SetStateAction<{ tone: "info" | "error" | "success"; message: string } | null>>;
  loggingIn: boolean;
  setLoggingIn: Dispatch<SetStateAction<boolean>>;
  loginErrorModalMessage: string;
  setLoginErrorModalMessage: (message: string) => void;
  passwordChangeVisible: boolean;
  setPasswordChangeVisible: React.Dispatch<React.SetStateAction<boolean>>;
  newPasswordForm: { password: string; confirm: string };
  setNewPasswordForm: Dispatch<SetStateAction<{ password: string; confirm: string }>>;
  newPasswordVisible: boolean;
  setNewPasswordVisible: Dispatch<SetStateAction<boolean>>;
  changingPassword: boolean;
  setChangingPassword: React.Dispatch<React.SetStateAction<boolean>>;
  passwordChangeStatus: { tone: "info" | "error" | "success"; message: string } | null;
  setPasswordChangeStatus: Dispatch<SetStateAction<{ tone: "info" | "error" | "success"; message: string } | null>>;
  companyOptions: BackendCompanyOption[];
  setCompanyOptions: Dispatch<SetStateAction<BackendCompanyOption[]>>;
  establishmentOptionsVisible: boolean;
  setEstablishmentOptionsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  establishmentSwitcherVisible: boolean;
  setEstablishmentSwitcherVisible: React.Dispatch<React.SetStateAction<boolean>>;
  pendingLogin: { data: AppData; user: User; token: string; passwordHash?: string; authenticationMethod?: "password" | "biometric" | "passkey" } | null;
  setPendingLogin: React.Dispatch<React.SetStateAction<{ data: AppData; user: User; token: string; passwordHash?: string; authenticationMethod?: "password" | "biometric" | "passkey" } | null>>;
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  username: string;
  setUsername: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  showLoginPassword: boolean;
  setShowLoginPassword: Dispatch<SetStateAction<boolean>>;
  recoveryIdentifier: string;
  setRecoveryIdentifier: React.Dispatch<React.SetStateAction<string>>;
  authBackendUrl: string;
  setAuthBackendUrl: React.Dispatch<React.SetStateAction<string>>;
  registerForm: {
    ruc: string;
    businessName: string;
    tradeName: string;
    adminName: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  setRegisterForm: Dispatch<SetStateAction<{
    ruc: string;
    businessName: string;
    tradeName: string;
    adminName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }>>;
  emptyRegisterForm: {
    ruc: string;
    businessName: string;
    tradeName: string;
    adminName: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
};

export function useAuthState(initialBackendUrl: string): AuthState {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [registering, setRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [recoverStatus, setRecoverStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [loginStatus, setLoginStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginErrorModalMessage, setLoginErrorModalMessage] = useState("");
  const [passwordChangeVisible, setPasswordChangeVisible] = useState(false);
  const [newPasswordForm, setNewPasswordForm] = useState({ password: "", confirm: "" });
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChangeStatus, setPasswordChangeStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [companyOptions, setCompanyOptions] = useState<BackendCompanyOption[]>([]);
  const [establishmentOptionsVisible, setEstablishmentOptionsVisible] = useState(false);
  const [establishmentSwitcherVisible, setEstablishmentSwitcherVisible] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{ data: AppData; user: User; token: string; passwordHash?: string; authenticationMethod?: "password" | "biometric" | "passkey" } | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState("");
  const [authBackendUrl, setAuthBackendUrl] = useState(initialBackendUrl);
  const [registerForm, setRegisterForm] = useState({
    ruc: "",
    businessName: "",
    tradeName: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const emptyRegisterForm = {
    ruc: "",
    businessName: "",
    tradeName: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: ""
  };

  return {
    authMode,
    setAuthMode,
    registering,
    setRegistering,
    registerStatus,
    setRegisterStatus,
    recoveringPassword,
    setRecoveringPassword,
    recoverStatus,
    setRecoverStatus,
    loginStatus,
    setLoginStatus,
    loggingIn,
    setLoggingIn,
    loginErrorModalMessage,
    setLoginErrorModalMessage,
    passwordChangeVisible,
    setPasswordChangeVisible,
    newPasswordForm,
    setNewPasswordForm,
    newPasswordVisible,
    setNewPasswordVisible,
    changingPassword,
    setChangingPassword,
    passwordChangeStatus,
    setPasswordChangeStatus,
    companyOptions,
    setCompanyOptions,
    establishmentOptionsVisible,
    setEstablishmentOptionsVisible,
    establishmentSwitcherVisible,
    setEstablishmentSwitcherVisible,
    pendingLogin,
    setPendingLogin,
    email,
    setEmail,
    username,
    setUsername,
    password,
    setPassword,
    showLoginPassword,
    setShowLoginPassword,
    recoveryIdentifier,
    setRecoveryIdentifier,
    authBackendUrl,
    setAuthBackendUrl,
    registerForm,
    setRegisterForm,
    emptyRegisterForm
  };
}
