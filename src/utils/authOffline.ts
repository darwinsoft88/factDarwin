import { AppData, User } from "../types";

export function upsertOfflineUser(data: AppData, user: User, passwordHash: string) {
  if (!passwordHash) return data;
  const email = user.email.trim().toLowerCase();
  if (!email) return data;

  const offlineUser: User = {
    ...user,
    email,
    password: undefined,
    passwordHash,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
  const users = data.users || [];
  const existingIndex = users.findIndex((item) => item.id === user.id || item.email.trim().toLowerCase() === email);
  const nextUsers = existingIndex >= 0
    ? users.map((item, index) => index === existingIndex ? { ...item, ...offlineUser, role: offlineUser.role || item.role } : item)
    : [offlineUser, ...users];

  return { ...data, users: nextUsers };
}
