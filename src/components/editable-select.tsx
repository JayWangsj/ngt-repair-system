"use client";
import { useId, useRef } from "react";
import { useMessages } from "./language";
import { uniqueOptions } from "@/lib/options";
/** Same native option menu as device type, with a text field for new values. */
export function EditableSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  readOnly = false,
  name,
  maxLength = 120,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | { value: string; label: string })[];
  required?: boolean;
  readOnly?: boolean;
  name?: string;
  maxLength?: number;
}) {
  const it = useMessages();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const unique = uniqueOptions(normalized.map((o) => o.value));
  return (
    <div className="editable-field">
      <label htmlFor={id}>{label}</label>
      <div className="editable-select">
        <input
          ref={input}
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          readOnly={readOnly}
          maxLength={maxLength}
          autoComplete="off"
          placeholder={it.manualEntry}
        />
        <select
          aria-label={it.selectOption + " " + label}
          disabled={readOnly}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
            input.current?.focus();
          }}
        >
          <option value="">{it.selectOption}</option>
          {unique.map((v) => (
            <option key={v} value={v}>
              {normalized.find((o) => o.value.toLowerCase() === v.toLowerCase())
                ?.label ?? v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
