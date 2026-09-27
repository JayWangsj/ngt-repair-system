"use client";

import { Check } from "lucide-react";
import {
  FaultCatalogManager,
  type FaultCatalogItem,
} from "./fault-catalog-manager";
import { useMessages } from "./language";

export function FaultSelector({
  category,
  items,
  selected,
  disabled = false,
  onChange,
  onItemsChange,
}: {
  category: string;
  items: FaultCatalogItem[];
  selected: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
  onItemsChange?: (items: FaultCatalogItem[]) => void;
}) {
  const it = useMessages();
  const visible = items
    .filter((item) => item.category === category && !item.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      <div className="fault-options-heading">
        <strong>{it.reportedFaults}</strong>
        <FaultCatalogManager
          items={items}
          initialCategory={category}
          onChanged={(next) => {
            onItemsChange?.(next);
            onChange(
              selected.filter((id) =>
                next.some((item) => item.id === id && !item.hidden),
              ),
            );
          }}
        />
      </div>
      <div className="fault-chip-grid">
        {visible.map((fault) => {
          const checked = selected.includes(fault.id);
          return (
            <label
              className={`fault-choice ${checked ? "is-selected" : ""}`}
              key={fault.id}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, fault.id]
                      : selected.filter((id) => id !== fault.id),
                  )
                }
              />
              <span>
                {checked && <Check size={14} />}
                {fault.name}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}
