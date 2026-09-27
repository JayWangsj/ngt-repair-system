"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  secondary?: string;
  trailing?: string;
  icon?: ReactNode;
  keywords?: string;
};
export type SelectGroup = { label?: string; options: SelectOption[] };

function useDropdown(open: boolean) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  function place() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect)
      setPosition({ top: rect.bottom + 5, left: rect.left, width: rect.width });
  }
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  return { trigger, panel, position };
}

export function SelectDropdown({
  value,
  defaultValue = "",
  onChange,
  groups,
  name,
  placeholder,
  ariaLabel,
  disabled = false,
  searchable = false,
  searchPlaceholder = "",
  emptyText = "",
  customLabel,
  onCustom,
  className = "",
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  groups: SelectGroup[];
  name?: string;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  customLabel?: string;
  onCustom?: (query: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const { trigger, panel, position } = useDropdown(open);
  const all = groups.flatMap((group) => group.options);
  const currentValue = value ?? internalValue;
  const selected = all.find((option) => option.value === currentValue);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) =>
        [option.label, option.secondary, option.keywords]
          .filter(Boolean)
          .some((text) => text!.toLocaleLowerCase().includes(needle)),
      ),
    }))
    .filter((group) => group.options.length);
  const visible = filtered.flatMap((group) => group.options);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }
  function openDropdown(element: HTMLButtonElement) {
    setPortalTarget(element.closest("dialog") ?? document.body);
    setOpen(true);
  }
  function choose(option: SelectOption) {
    setInternalValue(option.value);
    onChange?.(option.value);
    close();
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function move(event: KeyboardEvent, delta: number) {
    event.preventDefault();
    if (!visible.length) return;
    setActive((current) => (current + delta + visible.length) % visible.length);
  }
  function keys(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      trigger.current?.focus();
    } else if (event.key === "ArrowDown") move(event, 1);
    else if (event.key === "ArrowUp") move(event, -1);
    else if (event.key === "Enter" && visible[active]) {
      event.preventDefault();
      choose(visible[active]);
    }
  }
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !trigger.current?.contains(target) &&
        !panel.current?.contains(target)
      )
        close();
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, panel, trigger]);
  useEffect(() => {
    if (open && searchable)
      requestAnimationFrame(() => search.current?.focus());
  }, [open, searchable]);

  return (
    <div
      className={`business-select ${open ? "is-open" : ""} ${className}`}
      data-prevent-card-autosave
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        ref={trigger}
        type="button"
        className="business-select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id}
        disabled={disabled}
        onClick={(event) => {
          if (open) close();
          else openDropdown(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (["Enter", " ", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            openDropdown(event.currentTarget);
          }
        }}
      >
        <span className={selected ? "" : "is-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open &&
        portalTarget &&
        createPortal(
          <div
            ref={panel}
            id={id}
            className="business-select-panel"
            role="listbox"
            aria-label={ariaLabel}
            data-prevent-card-autosave
            style={{
              top: position.top,
              left: position.left,
              minWidth: position.width,
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={keys}
          >
            {searchable && (
              <label className="business-select-search">
                <Search size={15} aria-hidden="true" />
                <input
                  ref={search}
                  type="search"
                  value={query}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                />
              </label>
            )}
            <div className="business-select-options">
              {filtered.map((group) => (
                <div className="business-select-group" key={group.label ?? "_"}>
                  {group.label && (
                    <div className="business-select-group-label">
                      {group.label}
                    </div>
                  )}
                  {group.options.map((option) => {
                    const index = visible.indexOf(option);
                    const checked = option.value === currentValue;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        className={`business-select-option ${checked ? "is-selected" : ""} ${index === active ? "is-active" : ""}`}
                        key={option.value}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(option)}
                      >
                        {option.icon && (
                          <span className="business-select-option-icon">
                            {option.icon}
                          </span>
                        )}
                        <span className="business-select-option-copy">
                          <strong>{option.label}</strong>
                          {option.secondary && (
                            <small>{option.secondary}</small>
                          )}
                        </span>
                        {option.trailing && (
                          <span className="business-select-option-trailing">
                            {option.trailing}
                          </span>
                        )}
                        {checked && <Check size={15} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {!visible.length && (
                <p className="business-select-empty">{emptyText}</p>
              )}
            </div>
            {onCustom && customLabel && (
              <button
                type="button"
                className="business-select-custom"
                onClick={() => {
                  onCustom(query.trim());
                  close();
                }}
              >
                + {customLabel}
                {query.trim() ? ` “${query.trim()}”` : ""}
              </button>
            )}
          </div>,
          portalTarget,
        )}
    </div>
  );
}

export function SimpleSelect(
  props: Omit<Parameters<typeof SelectDropdown>[0], "groups" | "searchable"> & {
    options: SelectOption[];
  },
) {
  const { options, ...rest } = props;
  return <SelectDropdown {...rest} groups={[{ options }]} />;
}

export function SearchableCombobox(
  props: Omit<Parameters<typeof SelectDropdown>[0], "searchable">,
) {
  return <SelectDropdown {...props} searchable />;
}
