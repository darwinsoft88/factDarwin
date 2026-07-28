import { loginErrorMessage } from "../errors";

describe("loginErrorMessage", () => {
  it("hides internal postgres authentication errors", () => {
    expect(loginErrorMessage(new Error("la autentificacion password fallo para el usuario postgres"))).toBe(
      "El servidor no pudo validar el acceso en este momento. Revise que el backend tenga configurada correctamente la base de datos e intente nuevamente."
    );
  });

  it("keeps friendly invalid account messages", () => {
    expect(loginErrorMessage(new Error("Credenciales invalidas"))).toBe(
      "No encontramos una cuenta activa con esos datos. Revise el correo/RUC o registre la empresa."
    );
  });

  it("reports a verified login followed by a failed native migration", () => {
    const cause = Object.assign(new Error("migration failed"), { code: "SNAPSHOT_MIGRATION_FAILED" });
    expect(loginErrorMessage(cause)).toBe(
      "El acceso fue validado, pero no se pudo migrar la información de este dispositivo. Los datos anteriores se conservaron intactos."
    );
  });

  it("finds storage codes wrapped by a recovery error", () => {
    const nativeCause = Object.assign(new Error("file corrupted"), { code: "SNAPSHOT_FILE_CORRUPTED" });
    const wrapper = Object.assign(new Error("storage recovery"), {
      code: "STORAGE_RECOVERY_REQUIRED",
      cause: nativeCause
    });
    expect(loginErrorMessage(wrapper)).toBe(
      "La información local está dañada o incompleta. Los archivos se conservaron para recuperación; no se creó una empresa vacía."
    );
  });
});
