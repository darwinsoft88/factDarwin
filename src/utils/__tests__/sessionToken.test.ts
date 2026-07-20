import { getJwtExpirationMs, isSessionTokenExpired } from "../sessionToken";

function jwtWithPayload(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("sessionToken", () => {
  it("reads JWT expiration in milliseconds", () => {
    const token = jwtWithPayload({ exp: 1_800 });

    expect(getJwtExpirationMs(token)).toBe(1_800_000);
  });

  it("detects expired tokens with safety skew", () => {
    const token = jwtWithPayload({ exp: 100 });

    expect(isSessionTokenExpired(token, 100_000)).toBe(true);
  });

  it("keeps valid tokens active", () => {
    const token = jwtWithPayload({ exp: 200 });

    expect(isSessionTokenExpired(token, 100_000)).toBe(false);
  });

  it("does not expire malformed tokens locally", () => {
    expect(isSessionTokenExpired("not-a-jwt", 100_000)).toBe(false);
  });
});
