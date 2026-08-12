"use client";

import { useMsal } from "@azure/msal-react";

export function UnauthorizedPage() {
  const { accounts } = useMsal();
  const email = accounts[0]?.username;

  return (
    <div className="unauthorized-panel">
      <h2>Access restricted</h2>
      <p>
        This application is only available to Microsoft 365 accounts that have
        been added under the Users tab.
      </p>
      {email ? <p className="unauthorized-email">Signed in as: {email}</p> : null}
      <p className="unauthorized-hint">Use Log out above to switch accounts.</p>
    </div>
  );
}
