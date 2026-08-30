import {
  Controller,
  CookieParam,
  Get,
  Post,
  QueryParam,
  Res,
  UnauthorizedError,
} from "routing-controllers";
import { CookieOptions, Response } from "express";
import { google } from "googleapis";
import { getOAuth2Client } from "../lib/googleOAuth.js";
import {
  signAuthToken,
  signOAuthState,
  verifyAuthToken,
  verifyOAuthState,
  type AuthUser,
} from "../lib/jwt.js";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// Cookie options must be identical on set and clear. SameSite must be "none"
// (with Secure) for cross-site delivery: the Vercel frontend and Render
// backend are different registrable domains, and Lax cookies are never sent on
// cross-site XHR — which is why /auth/me returned 401 in prod. In dev both are
// localhost (same-site), where Lax works and None would be rejected by Chrome
// because the cookie isn't Secure.
function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };
}

@Controller("/auth")
export class AuthController {
  @Get("/me")
  me(@CookieParam("auth_token") token: string): AuthUser {
    // The frontend calls this once on page load (withCredentials) to decide
    // whether to show the workbench (200 -> user) or the login gate (401).
    if (!token) {
      throw new UnauthorizedError("No session cookie");
    }
    try {
      const payload = verifyAuthToken(token);
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    } catch {
      // Malformed, expired or tampered token — same 401 as no cookie.
      throw new UnauthorizedError("Invalid or expired session");
    }
  }

  @Post("/logout")
  logout(@Res() res: Response): Response {
    // Match the options the cookie was set with (secure, sameSite, path) so
    // the browser actually deletes it — clearCookie with mismatched options
    // can silently leave the cookie in place.
    res.clearCookie("auth_token", authCookieOptions());
    return res;
  }

  @Get("/google")
  startGoogleAuth(@Res() res: Response): Response {
    const state = signOAuthState();
    const url = getOAuth2Client().generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      include_granted_scopes: true,
      state,
    });
    res.redirect(url);
    // Returning the response tells routing-controllers the request is fully
    // handled -- otherwise it treats the void result as "no response sent"
    // and throws NotFoundError, crashing with ERR_HTTP_HEADERS_SENT.
    return res;
  }

  @Get("/google/callback")
  async handleGoogleCallback(
    @QueryParam("code") code: string,
    @QueryParam("state") state: string,
    @Res() res: Response,
  ): Promise<Response> {
    // NOTE: these params are deliberately typed `string` (not `string |
    // undefined`). A union erases to design:type Object, which makes
    // routing-controllers try JSON.parse() on the raw value — Google's
    // auth code and the state JWT are not JSON, so the callback 400'd in
    // prod. Absence is handled by the `!code` / `!state` guards below.
    const startedAt = Date.now();
    try {
      // 1. Validate OAuth state (CSRF protection)
      console.log(
        `OAuth callback received: code=${code ? "yes" : "no"} state=${state ? "yes" : "no"}`,
      );
      if (!state) {
        throw new Error("Missing state parameter");
      }

      verifyOAuthState(state);
      console.log(`OAuth callback: state verified elapsedMs=${Date.now() - startedAt}`);

      // 2. Validate authorization code
      if (!code) {
        throw new Error("Missing code parameter");
      }

      // 3. Exchange authorization code for Google tokens
      const client = getOAuth2Client();
      const { tokens } = await client.getToken(code);
      console.log(
        `OAuth callback: tokens obtained refreshToken=${tokens.refresh_token ? "yes" : "no"} elapsedMs=${Date.now() - startedAt}`,
      );

      client.setCredentials(tokens);

      // 4. Get authenticated user's Google identity
      const oauth2 = google.oauth2({
        auth: client,
        version: "v2",
      });

      const { data: user } = await oauth2.userinfo.get();
      console.log(
        `OAuth callback: user fetched id=${user.id} email=${user.email} elapsedMs=${Date.now() - startedAt}`,
      );

      if (!user.id || !user.email) {
        throw new Error("Google userinfo did not return required user information");
      }

      // 5. Create your application's own JWT
      const authToken = signAuthToken({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      });
      console.log(`OAuth callback: jwt signed elapsedMs=${Date.now() - startedAt}`);

      // 6. Store your JWT in a secure, HttpOnly cookie
      res.cookie("auth_token", authToken, {
        ...authCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      console.log(`OAuth callback: auth_token cookie set elapsedMs=${Date.now() - startedAt}`);

      // 7. Redirect back to the frontend
      res.redirect(FRONTEND_URL);
      console.log(`OAuth callback: redirecting to frontend elapsedMs=${Date.now() - startedAt}`);
      return res;
    } catch (error) {
      // Never log the OAuth code, tokens, or request config.
      console.error(
        "Google OAuth callback failed:",
        error instanceof Error ? error.message : error
      );

      // Redirect to frontend with a generic error.
      res.redirect(
        `${FRONTEND_URL}?error=access_denied`
      );
      return res;
    }
  }
}
