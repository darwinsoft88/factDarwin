let authenticatedAccountKey = "";

function accountKey(companyId: string, userId: string) {
  return `${companyId.trim()}::${userId.trim()}`;
}

export function markBiometricAuthenticationCompleted(companyId: string, userId: string) {
  authenticatedAccountKey = accountKey(companyId, userId);
}

export function consumeBiometricAuthentication(companyId: string, userId: string) {
  const expected = accountKey(companyId, userId);
  if (!expected || authenticatedAccountKey !== expected) return false;
  authenticatedAccountKey = "";
  return true;
}
