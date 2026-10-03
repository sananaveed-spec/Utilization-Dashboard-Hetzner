"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAccess } from "@/auth/accessContext";
import {
  ALLOWED_USERS_CHANGED_EVENT,
  isValidEmail,
  normalizeEmail,
  notifyAllowedUsersChanged,
} from "@/lib/allowedUsers";

type AllowedUsersResponse = {
  emails?: string[];
  error?: string;
  message?: string;
};

export function UsersPanel() {
  const { email: signedInEmail } = useAccess();
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function writeHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (signedInEmail) {
      headers["x-user-email"] = signedInEmail;
    }
    return headers;
  }

  const loadEmails = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/allowed-users", { cache: "no-store" });
      const data = (await response.json()) as AllowedUsersResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load users.");
      }
      setEmails(Array.isArray(data.emails) ? data.emails : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load users.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmails();
  }, [loadEmails]);

  useEffect(() => {
    function onChanged() {
      void loadEmails();
    }

    window.addEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(ALLOWED_USERS_CHANGED_EVENT, onChanged);
    };
  }, [loadEmails]);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = normalizeEmail(draft);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/allowed-users", {
        method: "POST",
        headers: writeHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as AllowedUsersResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to add email.");
      }
      setEmails(Array.isArray(data.emails) ? data.emails : []);
      setDraft("");
      notifyAllowedUsersChanged();
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "Failed to add email.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(email: string) {
    const confirmed = window.confirm(`Remove "${email}" from allowed users?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/allowed-users", {
        method: "DELETE",
        headers: writeHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as AllowedUsersResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to remove email.");
      }
      setEmails(Array.isArray(data.emails) ? data.emails : []);
      notifyAllowedUsersChanged();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to remove email.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="users-panel">
      <div className="analysis-header">
        <div>
          <h2 className="analysis-title">Users</h2>
          <p className="analysis-subtitle">
            Anyone with an @allumiax.com account can view the dashboard. Emails
            listed here can edit data (hours, engineers, holidays, and users).
          </p>
        </div>
      </div>

      <form className="users-add-form" onSubmit={handleAdd}>
        <label className="users-add-label" htmlFor="allowed-user-email">
          Add email
        </label>
        <div className="users-add-row">
          <input
            id="allowed-user-email"
            type="email"
            className="holidays-input"
            value={draft}
            placeholder="name@allumiax.com"
            autoComplete="email"
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="button primary button-small"
            disabled={saving || !draft.trim()}
          >
            + Add
          </button>
        </div>
      </form>

      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="holidays-table-wrap">
        <table className="holidays-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col" className="holidays-actions-col">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2} className="holidays-empty">
                  Loading users…
                </td>
              </tr>
            ) : emails.length === 0 ? (
              <tr>
                <td colSpan={2} className="holidays-empty">
                  No editors yet. Add an email to grant edit access.
                </td>
              </tr>
            ) : (
              emails.map((email) => (
                <tr key={email}>
                  <td>
                    <span className="holidays-value">{email}</span>
                  </td>
                  <td className="holidays-actions-col">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button icon-button--delete"
                        onClick={() => void handleDelete(email)}
                        disabled={saving || emails.length <= 1}
                        aria-label={`Remove ${email}`}
                        title={
                          emails.length <= 1
                            ? "At least one email is required"
                            : "Remove"
                        }
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
