import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "routing-controllers";
import { verifyAuthToken, type AuthTokenPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      /** Verified JWT payload, set by authGuard. Absent when no valid token. */
      user?: AuthTokenPayload;
    }
  }
}

// The auth JWT lives in the HttpOnly "auth_token" cookie set on the OAuth
// callback. The frontend sends it automatically via withCredentials, so the
// middleware reads it from the raw Cookie header (same parsing routing-
// controllers does internally — no cookie-parser middleware needed).
function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * Express middleware: rejects the request with a 401 unless it carries a valid
 * JWT in the "auth_token" cookie. On success the verified payload is attached
 * to `req.user` for downstream handlers.
 */
export function authGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = cookieValue(req.headers.cookie, "auth_token");
  if (!token) {
    next(new UnauthorizedError("No session cookie"));
    return;
  }
  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired session"));
  }
}
