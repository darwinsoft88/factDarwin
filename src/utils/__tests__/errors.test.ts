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
});
