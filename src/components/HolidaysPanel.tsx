"use client";

import { useState } from "react";
import type { UtilizationStore } from "@/hooks/useUtilizationStore";
import {
  createHoliday,
  formatHolidayDate,
  getHolidayDayName,
  type Holiday,
} from "@/lib/holidays";

type HolidaysPanelProps = {
  store: UtilizationStore;
};

export function HolidaysPanel({ store }: HolidaysPanelProps) {
  const { holidays, updateHolidays } = store;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; date: string } | null>(
    null,
  );

  function handleAdd() {
    if (editingId) {
      return;
    }

    const holiday = createHoliday();
    updateHolidays([...holidays, holiday]);
    setEditingId(holiday.id);
    setDraft({ name: holiday.name, date: holiday.date });
  }

  function handleDelete(holiday: Holiday) {
    const label = holiday.name.trim() || "this holiday";
    const confirmed = window.confirm(`Delete "${label}"?`);
    if (!confirmed) {
      return;
    }

    if (editingId === holiday.id) {
      setEditingId(null);
      setDraft(null);
    }

    updateHolidays(holidays.filter((item) => item.id !== holiday.id));
  }

  function handleMove(id: string, direction: -1 | 1) {
    if (editingId) {
      return;
    }

    const index = holidays.findIndex((holiday) => holiday.id === id);
    if (index < 0) {
      return;
    }

    const target = index + direction;
    if (target < 0 || target >= holidays.length) {
      return;
    }

    const next = [...holidays];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    updateHolidays(next);
  }

  function startEditing(holiday: Holiday) {
    setEditingId(holiday.id);
    setDraft({ name: holiday.name, date: holiday.date });
  }

  function cancelEditing() {
    if (!editingId) {
      return;
    }

    const current = holidays.find((holiday) => holiday.id === editingId);
    if (current && !current.name.trim() && !current.date) {
      updateHolidays(holidays.filter((holiday) => holiday.id !== editingId));
    }

    setEditingId(null);
    setDraft(null);
  }

  function saveEditing() {
    if (!editingId || !draft) {
      return;
    }

    updateHolidays(
      holidays.map((holiday) =>
        holiday.id === editingId
          ? {
              ...holiday,
              name: draft.name.trim(),
              date: draft.date,
            }
          : holiday,
      ),
    );
    setEditingId(null);
    setDraft(null);
  }

  return (
    <div className="holidays-panel">
      <div className="analysis-header">
        <div>
          <h2 className="analysis-title">Holidays</h2>
          <p className="analysis-subtitle">
            Add company holidays with a name and date. Weekends and these
            holidays are excluded from Total Forecasted Hours.
          </p>
        </div>
        <button
          type="button"
          className="button primary button-small"
          onClick={handleAdd}
          disabled={Boolean(editingId)}
        >
          + Add holiday
        </button>
      </div>

      <div className="holidays-table-wrap">
        <table className="holidays-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Date</th>
              <th scope="col">Day</th>
              <th scope="col" className="holidays-actions-col">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr>
                <td colSpan={4} className="holidays-empty">
                  No holidays yet. Click “+ Add holiday” to create one (for
                  example Independence Day on 14-08-2026).
                </td>
              </tr>
            ) : (
              holidays.map((holiday, index) => {
                const isEditing = editingId === holiday.id;
                const nameValue = isEditing
                  ? (draft?.name ?? holiday.name)
                  : holiday.name;
                const dateValue = isEditing
                  ? (draft?.date ?? holiday.date)
                  : holiday.date;
                const dayName = getHolidayDayName(dateValue);

                return (
                  <tr key={holiday.id}>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          className="holidays-input"
                          value={nameValue}
                          placeholder="Event Name"
                          aria-label="Holiday name"
                          onChange={(event) =>
                            setDraft((current) => ({
                              name: event.target.value,
                              date: current?.date ?? holiday.date,
                            }))
                          }
                        />
                      ) : (
                        <span className="holidays-value">
                          {holiday.name.trim() || "—"}
                        </span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          className="holidays-input holidays-date"
                          value={dateValue}
                          aria-label="Holiday date"
                          onChange={(event) =>
                            setDraft((current) => ({
                              name: current?.name ?? holiday.name,
                              date: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <span className="holidays-value">
                          {holiday.date
                            ? formatHolidayDate(holiday.date)
                            : "—"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="holidays-value">
                        {dayName || "—"}
                      </span>
                    </td>
                    <td className="holidays-actions-col">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleMove(holiday.id, -1)}
                          disabled={Boolean(editingId) || index === 0}
                          title="Move up"
                          aria-label="Move holiday up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleMove(holiday.id, 1)}
                          disabled={
                            Boolean(editingId) ||
                            index === holidays.length - 1
                          }
                          title="Move down"
                          aria-label="Move holiday down"
                        >
                          ↓
                        </button>
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="icon-button icon-button--save"
                              onClick={saveEditing}
                              aria-label="Save"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="icon-button icon-button--cancel"
                              onClick={cancelEditing}
                              aria-label="Cancel"
                              title="Cancel"
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="icon-button icon-button--edit"
                              onClick={() => startEditing(holiday)}
                              disabled={Boolean(editingId)}
                              aria-label="Edit"
                              title="Edit"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="icon-button icon-button--delete"
                              onClick={() => handleDelete(holiday)}
                              disabled={
                                Boolean(editingId) && editingId !== holiday.id
                              }
                              aria-label="Delete"
                              title="Delete"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
