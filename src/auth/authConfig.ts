import type { Configuration } from "@azure/msal-browser";
import { azureClientId } from "./env";

/**
 * Multi-tenant / organizations authority for Microsoft 365 sign-in.
 * Access is further restricted to allowed email domains in organization.ts.
 * Override with NEXT_PUBLIC_AZURE_AUTHORITY if needed.
 */
const azureAuthority =
  process.env.NEXT_PUBLIC_AZURE_AUTHORITY?.trim() ||
  "https://login.microsoftonline.com/organizations";

export function getMsalConfig(): Configuration {
  return {
    auth: {
      clientId: azureClientId,
      authority: azureAuthority,
      redirectUri:
        typeof window !== "undefined" ? window.location.origin : "/",
      postLogoutRedirectUri:
        typeof window !== "undefined" ? window.location.origin : "/",
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  };
}

export const loginRequest = {
  scopes: ["User.Read"],
};
