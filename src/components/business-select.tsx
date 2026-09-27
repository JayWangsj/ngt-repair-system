"use client";

import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useMessages } from "./language";

export type SelectOption = {
  value: string;
  label: string;
  secondary?: string;
  trailing?: ReactNode;
  icon?: ReactNode;
  keywords?: string;
};
export type SelectGroup = { label?: string; options: SelectOption[] };

function useDropdown(open: boolean) {
  const trigger = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  function place() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = panel.current?.offsetWidth ?? rect.width;
    const panelHeight = panel.current?.offsetHeight ?? 0;
    const gap = 5;
    const edge = 12;
    const below = rect.bottom + gap;
    const fitsBelow = below + panelHeight <= window.innerHeight - edge;
    const fitsAbove = rect.top - gap - panelHeight >= edge;
    const top =
      !fitsBelow && fitsAbove
        ? rect.top - gap - panelHeight
        : Math.min(below, window.innerHeight - panelHeight - edge);
    const left = Math.min(
      Math.max(edge, rect.left),
      Math.max(edge, window.innerWidth - panelWidth - edge),
    );
    setPosition({ top: Math.max(edge, top), left, width: rect.width });
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
  onCommit,
  onQueryChange,
  customDisabled = false,
  middleControl,
  clearable = false,
  loading = false,
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
  onCommit?: (query: string) => void;
  onQueryChange?: (query: string) => void;
  customDisabled?: boolean;
  middleControl?: ReactNode;
  clearable?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const it = useMessages();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const simpleTrigger = useRef<HTMLButtonElement>(null);
  const closingTimer = useRef<number | null>(null);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;
  const { trigger, panel, position } = useDropdown(present);
  const all = groups.flatMap((group) => group.options);
  const currentValue = value ?? internalValue;
  const selected = all.find((option) => option.value === currentValue);
  const displayValue = selected?.label ?? currentValue;
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
  const trimmedQuery = query.trim();
  const canCreate =
    !!trimmedQuery && !loading && !visible.length && !customDisabled;

  const close = useCallback(
    ({ focus = false }: { focus?: boolean } = {}) => {
      if (searchable && query.trim()) onCommit?.(query.trim());
      setOpen(false);
      setQuery("");
      setActive(0);
      if (closingTimer.current) window.clearTimeout(closingTimer.current);
      closingTimer.current = window.setTimeout(() => setPresent(false), 180);
      if (focus)
        requestAnimationFrame(() =>
          searchable ? search.current?.focus() : simpleTrigger.current?.focus(),
        );
    },
    [onCommit, query, searchable],
  );
  function openDropdown() {
    const element = trigger.current;
    if (!element || disabled) return;
    if (closingTimer.current) window.clearTimeout(closingTimer.current);
    setPortalTarget(element.closest("dialog") ?? document.body);
    setPresent(true);
    setOpen(true);
  }
  function choose(option: SelectOption) {
    setInternalValue(option.value);
    onChange?.(option.value);
    close();
    if (searchable) search.current?.blur();
    else requestAnimationFrame(() => simpleTrigger.current?.focus());
  }
  function move(event: KeyboardEvent, delta: number) {
    event.preventDefault();
    if (!visible.length) return;
    setActive((current) => (current + delta + visible.length) % visible.length);
  }
  function keys(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close({ focus: true });
    } else if (event.key === "ArrowDown") move(event, 1);
    else if (event.key === "ArrowUp") move(event, -1);
    else if (event.key === "Enter" && visible[active]) {
      event.preventDefault();
      choose(visible[active]);
    } else if (
      event.key === "Enter" &&
      searchable &&
      query.trim() &&
      onCustom
    ) {
      event.preventDefault();
      onCustom(query.trim());
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
  }, [close, open, panel, trigger]);
  useEffect(() => {
    if (open && searchable)
      requestAnimationFrame(() => search.current?.focus());
  }, [open, searchable]);
  useEffect(
    () => () => {
      if (closingTimer.current) window.clearTimeout(closingTimer.current);
    },
    [],
  );

  const inputValue = open ? query : displayValue;
  const canClear = !disabled && (open ? !!query : clearable && !!currentValue);
  const activeDescendant =
    open && visible[active] ? optionId(active) : undefined;

  return (
    <div
      ref={trigger}
      className={`business-select ${open ? "is-open" : ""} ${className}`}
      data-prevent-card-autosave
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {name && <input type="hidden" name={name} value={currentValue} />}
      {searchable ? (
        <div
          className={`business-combobox-control ${onCustom && customLabel ? "has-create" : ""} ${middleControl ? "has-middle" : ""}`}
        >
          <div className="business-combobox-input">
            <Search size={15} aria-hidden="true" />
            <input
              ref={search}
              type="text"
              role="combobox"
              value={inputValue}
              placeholder={searchPlaceholder || placeholder}
              aria-label={ariaLabel}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={id}
              aria-autocomplete="list"
              aria-activedescendant={activeDescendant}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                setActive(0);
                onQueryChange?.(next);
                if (next.trim()) {
                  if (!open) openDropdown();
                } else {
                  setOpen(false);
                  setPresent(false);
                }
              }}
              onKeyDown={keys}
            />
            {canClear && (
              <button
                type="button"
                className="business-combobox-clear"
                aria-label={open ? it.clearSearch : it.clearSelection}
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (open) {
                    setQuery("");
                    setActive(0);
                    setOpen(false);
                    setPresent(false);
                    onQueryChange?.("");
                  } else {
                    setInternalValue("");
                    onChange?.("");
                  }
                  if (open) search.current?.focus();
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            className="business-combobox-chevron"
            aria-label={open ? it.collapseOptions : it.expandOptions}
            aria-expanded={open}
            aria-controls={id}
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              if (open) close({ focus: true });
              else if (query.trim()) openDropdown();
              else search.current?.focus();
            }}
          >
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {middleControl}
          {onCustom && customLabel && (
            <button
              type="button"
              className="business-select-create"
              aria-label={customLabel}
              disabled={disabled || !canCreate}
              onClick={(event) => {
                event.stopPropagation();
                const next = query.trim();
                close();
                onCustom(next);
              }}
            >
              <Plus size={14} aria-hidden="true" />
              <span>{customLabel}</span>
            </button>
          )}
        </div>
      ) : (
        <button
          ref={simpleTrigger}
          type="button"
          className="business-select-trigger"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={id}
          disabled={disabled}
          onClick={() => {
            if (open) close();
            else openDropdown();
          }}
          onKeyDown={(event) => {
            if (["Enter", " ", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              openDropdown();
            }
          }}
        >
          <span className={displayValue ? "" : "is-placeholder"}>
            {displayValue || placeholder}
          </span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      )}
      {present &&
        portalTarget &&
        createPortal(
          <div
            ref={panel}
            className={`business-select-panel ${open ? "is-entering" : "is-leaving"}`}
            data-prevent-card-autosave
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={keys}
          >
            <div
              id={id}
              className="business-select-options"
              role="listbox"
              aria-label={ariaLabel}
            >
              {loading && (
                <p className="business-select-empty">{it.searching}</p>
              )}
              {!loading &&
                filtered.map((group) => (
                  <div
                    className="business-select-group"
                    key={group.label ?? "_"}
                  >
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
                          id={optionId(index)}
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
              {!loading && !visible.length && (
                <div className="business-select-empty">
                  <strong>{emptyText}</strong>
                </div>
              )}
            </div>
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
