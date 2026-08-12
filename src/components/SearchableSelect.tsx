"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  id: string;
  label: string;
};

type SearchableSelectProps = {
  id?: string;
  label: string;
  placeholder: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
  /** When false, typing filters without clearing the current value and the × is hidden. */
  clearable?: boolean;
  className?: string;
};

export function SearchableSelect({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  emptyMessage = "No matches found",
  clearable = true,
  className,
}: SearchableSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.id === value) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options;
    }

    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? "");
    }
  }, [open, selected]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleSelect(option: SearchableOption) {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setQuery("");
    setOpen(true);
  }

  return (
    <div
      className={`panel${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      {label ? (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className={`searchable-select${open ? " searchable-select--open" : ""}`}>
        <input
          id={inputId}
          className="field-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${inputId}-listbox`}
          aria-label={label || placeholder}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? query : (selected?.label ?? query)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (clearable && value) {
              onChange("");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
            if (event.key === "Enter" && filtered.length === 1) {
              event.preventDefault();
              handleSelect(filtered[0]);
            }
          }}
        />

        {clearable && value && !disabled ? (
          <button
            type="button"
            className="searchable-clear"
            aria-label={`Clear ${label || "selection"}`}
            onClick={handleClear}
          >
            ×
          </button>
        ) : null}

        {open && !disabled ? (
          <ul
            id={`${inputId}-listbox`}
            className="searchable-options"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <li className="searchable-empty">{emptyMessage}</li>
            ) : (
              filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className={`searchable-option${
                      option.id === value ? " searchable-option--selected" : ""
                    }`}
                    role="option"
                    aria-selected={option.id === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
