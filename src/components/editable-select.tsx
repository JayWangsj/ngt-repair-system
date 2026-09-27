"use client";
import { useMessages } from "./language";
import { uniqueOptions } from "@/lib/options";
import { SearchableCombobox } from "./business-select";
export function EditableSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  readOnly = false,
  name,
  maxLength = 120,
  normalize,
  createLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | { value: string; label: string })[];
  required?: boolean;
  readOnly?: boolean;
  name?: string;
  maxLength?: number;
  normalize?: (value: string) => string;
  createLabel?: string;
}) {
  const it = useMessages();
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const unique = uniqueOptions(normalized.map((o) => o.value));
  const choices = unique.map((option) => ({
    value: option,
    label:
      normalized.find(
        (item) => item.value.toLowerCase() === option.toLowerCase(),
      )?.label ?? option,
  }));
  if (value && !choices.some((option) => option.value === value))
    choices.unshift({ value, label: value });
  return (
    <div className="editable-field">
      <label>{label}</label>
      <SearchableCombobox
        name={name}
        value={value}
        onChange={(next) => onChange(normalize ? normalize(next) : next)}
        groups={[{ options: choices }]}
        disabled={readOnly}
        placeholder={it.manualEntry}
        ariaLabel={label}
        searchPlaceholder={it.manualEntry}
        emptyText={it.noMatches}
        customLabel={createLabel ?? it.newValue}
        onCustom={(next) => {
          if (!required || next) {
            const trimmed = next.slice(0, maxLength);
            onChange(normalize ? normalize(trimmed) : trimmed);
          }
        }}
      />
    </div>
  );
}
