import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "7d";
const STATE_EXPIRY = "10m";

function getSecret(): string {
  if (!secret) {
    throw new Error("JWT_SECRET is not set in the environment");
  }
  return secret;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
}

export interface AuthTokenPayload {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

// Stateless session JWT: carries the user's Google identity, signed with
// JWT_SECRET. The frontend stores it and sends it on later requests; no
// server-side session storage is needed.
export function signAuthToken(user: AuthUser): string {
  return jwt.sign(
    { email: user.email, name: user.name, picture: user.picture },
    getSecret(),
    { subject: user.id, expiresIn: TOKEN_EXPIRY },
  );
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const payload = jwt.verify(token, getSecret());
  if (typeof payload === "string" || !payload.sub) {
    throw new Error("Invalid auth token payload");
  }
  return payload as AuthTokenPayload;
}

// Stateless OAuth CSRF state: a short-lived signed nonce. The callback only
// needs to verify the signature to know this request corresponds to a login
// this app initiated (and that it is still fresh) -- no server-side storage.
export function signOAuthState(): string {
  return jwt.sign({ nonce: randomBytes(16).toString("hex") }, getSecret(), {
    expiresIn: STATE_EXPIRY,
  });
}

// Throws if the state was not issued by this app or has expired.
export function verifyOAuthState(state: string): void {
  jwt.verify(state, getSecret());
}
