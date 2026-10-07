"use client";

import { useMsal } from "@azure/msal-react";

export function UnauthorizedPage() {
  const { accounts } = useMsal();
  const email = accounts[0]?.username;

  return (
    <div className="unauthorized-panel">
      <h2>Access restricted</h2>
      <p>
        Sign in with an @allumiax.com account that an Admin has added under
        Users. Team members must also be linked to an engineer name.
      </p>
      {email ? <p className="unauthorized-email">Signed in as: {email}</p> : null}
      <p className="unauthorized-hint">Use Log out above to switch accounts.</p>
    </div>
  );
}
