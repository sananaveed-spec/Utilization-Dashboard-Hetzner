"use client";

import { useMemo, useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";

type EmployeeOption = {
  id: string;
  name: string;
  email: string;
};

type AddEngineerDialogProps = {
  candidates: EmployeeOption[];
  onSave: (name: string) => void;
  onClose: () => void;
};

export function AddEngineerDialog({
  candidates,
  onSave,
  onClose,
}: AddEngineerDialogProps) {
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      candidates.map((employee) => ({
        id: employee.id,
        label: employee.name,
      })),
    [candidates],
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const selected = candidates.find((employee) => employee.id === selectedId);
    if (!selected) {
      setError("Select an employee to add.");
      return;
    }

    onSave(selected.name);
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel dialog-panel--add-engineer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-engineer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-engineer-title" className="dialog-title">
          Add Engineer
        </h2>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <SearchableSelect
            id="add-engineer-name"
            label="Employee"
            placeholder="Search engineer name"
            options={options}
            value={selectedId}
            onChange={(value) => {
              setSelectedId(value);
              setError(null);
            }}
            emptyMessage="No employees available to add"
            defaultOpen
          />

          {candidates.length === 0 ? (
            <p className="hint">All active employees are already on the list.</p>
          ) : null}

          {error ? (
            <p className="form-message error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={candidates.length === 0}
            >
              Add Engineer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
