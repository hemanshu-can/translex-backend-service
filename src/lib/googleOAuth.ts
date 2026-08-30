import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

let client: OAuth2Client | null = null;
export function getOAuth2Client(): OAuth2Client {
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI must be set in the environment",
    );
  }
  client ??= new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return client;
}
