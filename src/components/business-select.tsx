"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLanguage, useMessages } from "./language";
import { useBusinessDay } from "./business-date";
import {
  ensureComfortableInteractionSpace,
  focusComfortably,
} from "@/lib/comfortable-scroll";

export type SelectOption = {
  value: string;
  label: string;
  ariaLabel?: string;
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
  emptyCreateText,
  customLabel,
  onCustom,
  onCommit,
  onNoMatchEnter,
  onClose,
  onQueryChange,
  customDisabled = false,
  customValue = "",
  middleControl,
  creationControls = "always",
  preserveQueryOnClose = false,
  commitEmptyOnClose = false,
  clearable = false,
  loading = false,
  showEmptyPanel = true,
  autoFocusQuery,
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
  emptyCreateText?: string;
  customLabel?: string;
  onCustom?: (query: string) => void;
  onCommit?: (query: string) => void;
  onNoMatchEnter?: (query: string) => void;
  onClose?: () => void;
  onQueryChange?: (query: string) => void;
  customDisabled?: boolean;
  customValue?: string;
  middleControl?: ReactNode;
  creationControls?: "always" | "no-match";
  preserveQueryOnClose?: boolean;
  commitEmptyOnClose?: boolean;
  clearable?: boolean;
  loading?: boolean;
  showEmptyPanel?: boolean;
  autoFocusQuery?: string;
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
  const initialFocusApplied = useRef(false);
  const openFocusApplied = useRef(false);
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
  const createValue = trimmedQuery || customValue.trim();
  const createNeedle = createValue.toLocaleLowerCase();
  const createMatches = all.some((option) =>
    [option.label, option.secondary, option.keywords]
      .filter(Boolean)
      .some((text) => text!.toLocaleLowerCase().includes(createNeedle)),
  );
  const canCreate =
    !!createValue && !loading && !createMatches && !customDisabled;
  const showCreationControls =
    creationControls === "always" ||
    (!!trimmedQuery && !loading && visible.length === 0);
  const estimatedPanelHeight = Math.min(
    340,
    Math.max(
      52,
      visible.length * 42 + filtered.filter((group) => group.label).length * 26,
    ),
  );

  const close = useCallback(
    ({
      focus = false,
      commit = true,
    }: { focus?: boolean; commit?: boolean } = {}) => {
      const currentQuery = search.current?.value ?? query;
      if (commit && searchable) {
        if (currentQuery.trim()) onCommit?.(currentQuery.trim());
        else if (commitEmptyOnClose && open) onChange?.("");
      }
      setOpen(false);
      if (!preserveQueryOnClose) setQuery("");
      setActive(0);
      onClose?.();
      if (closingTimer.current) window.clearTimeout(closingTimer.current);
      closingTimer.current = window.setTimeout(() => setPresent(false), 180);
      if (focus)
        requestAnimationFrame(() =>
          focusComfortably(searchable ? search.current : simpleTrigger.current),
        );
    },
    [
      commitEmptyOnClose,
      onChange,
      onClose,
      onCommit,
      open,
      preserveQueryOnClose,
      query,
      searchable,
    ],
  );
  function openDropdown() {
    const element = trigger.current;
    if (!element || disabled) return;
    ensureComfortableInteractionSpace(element, {
      spaceBelow: estimatedPanelHeight,
    });
    if (closingTimer.current) window.clearTimeout(closingTimer.current);
    setPortalTarget(element.closest("dialog") ?? document.body);
    setPresent(true);
    setOpen(true);
  }
  function choose(option: SelectOption) {
    setQuery("");
    onQueryChange?.("");
    setInternalValue(option.value);
    onChange?.(option.value);
    close({ commit: false });
    if (searchable) search.current?.blur();
    else requestAnimationFrame(() => focusComfortably(simpleTrigger.current));
  }
  function move(event: KeyboardEvent, delta: number) {
    event.preventDefault();
    if (!visible.length) return;
    setActive((current) => (current + delta + visible.length) % visible.length);
  }
  function keys(event: KeyboardEvent) {
    const currentQuery =
      event.currentTarget instanceof HTMLInputElement
        ? event.currentTarget.value
        : (search.current?.value ?? query);
    const currentTrimmedQuery = currentQuery.trim();
    if (
      searchable &&
      !open &&
      currentValue &&
      !commitEmptyOnClose &&
      (event.key === "Backspace" || event.key === "Delete")
    ) {
      event.preventDefault();
      setInternalValue("");
      setQuery("");
      onQueryChange?.("");
      onChange?.("");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close({ focus: true, commit: !commitEmptyOnClose });
    } else if (event.key === "ArrowDown") move(event, 1);
    else if (event.key === "ArrowUp") move(event, -1);
    else if (
      event.key === "Enter" &&
      searchable &&
      !currentTrimmedQuery &&
      commitEmptyOnClose
    ) {
      onChange?.("");
      close({ commit: false });
    } else if (event.key === "Enter" && visible[active]) {
      choose(visible[active]);
    } else if (
      event.key === "Enter" &&
      searchable &&
      currentTrimmedQuery &&
      !visible.length &&
      onNoMatchEnter
    ) {
      onNoMatchEnter(currentTrimmedQuery);
    } else if (
      event.key === "Enter" &&
      searchable &&
      currentTrimmedQuery &&
      onCommit
    ) {
      close();
    } else if (
      event.key === "Enter" &&
      searchable &&
      currentTrimmedQuery &&
      onCustom &&
      canCreate
    ) {
      close({ commit: false });
      onCustom(currentTrimmedQuery);
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
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [close, open, panel, trigger]);
  useEffect(() => {
    if (!open) {
      openFocusApplied.current = false;
      return;
    }
    if (!searchable || openFocusApplied.current) return;
    openFocusApplied.current = true;
    requestAnimationFrame(() =>
      focusComfortably(search.current, {
        spaceBelow: estimatedPanelHeight,
      }),
    );
  }, [estimatedPanelHeight, open, searchable]);
  useEffect(() => {
    if (
      !searchable ||
      autoFocusQuery === undefined ||
      initialFocusApplied.current
    )
      return;
    const frame = requestAnimationFrame(() => {
      if (initialFocusApplied.current) return;
      const element = trigger.current;
      if (!element || disabled) return;
      initialFocusApplied.current = true;
      openFocusApplied.current = true;
      if (closingTimer.current) window.clearTimeout(closingTimer.current);
      setPortalTarget(element.closest("dialog") ?? document.body);
      setQuery(autoFocusQuery);
      onQueryChange?.(autoFocusQuery);
      setActive(0);
      setPresent(true);
      setOpen(true);
      requestAnimationFrame(() => {
        focusComfortably(search.current, {
          spaceBelow: estimatedPanelHeight,
          select: true,
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    autoFocusQuery,
    disabled,
    estimatedPanelHeight,
    onQueryChange,
    searchable,
    trigger,
  ]);
  useEffect(
    () => () => {
      if (closingTimer.current) window.clearTimeout(closingTimer.current);
    },
    [],
  );

  const inputValue =
    open || (preserveQueryOnClose && query) ? query : displayValue;
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
          className={`business-combobox-control ${showCreationControls && onCustom && customLabel ? "has-create" : ""} ${showCreationControls && middleControl ? "has-middle" : ""}`}
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
              data-comfortable-expansion={estimatedPanelHeight}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value;
                initialFocusApplied.current = true;
                setQuery(next);
                setActive(0);
                onQueryChange?.(next);
                if (next.trim()) {
                  if (!open) openDropdown();
                } else if (commitEmptyOnClose && (open || currentValue)) {
                  if (!open) openDropdown();
                  setOpen(true);
                } else {
                  setInternalValue("");
                  setOpen(false);
                  setPresent(false);
                  onChange?.("");
                }
              }}
              onKeyDown={keys}
            />
            {canClear && (
              <button
                type="button"
                className="business-combobox-clear x-icon-button"
                aria-label={open ? it.clearSearch : it.clearSelection}
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  setQuery("");
                  setActive(0);
                  onQueryChange?.("");
                  if (commitEmptyOnClose && (open || currentValue)) {
                    if (!open) openDropdown();
                    requestAnimationFrame(() =>
                      focusComfortably(search.current),
                    );
                    return;
                  }
                  setInternalValue("");
                  setOpen(false);
                  setPresent(false);
                  onChange?.("");
                  requestAnimationFrame(() => focusComfortably(search.current));
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
              else openDropdown();
            }}
          >
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {showCreationControls && middleControl}
          {showCreationControls && onCustom && customLabel && (
            <button
              type="button"
              className="business-select-create"
              aria-label={customLabel}
              disabled={disabled || !canCreate}
              onClick={(event) => {
                event.stopPropagation();
                setQuery("");
                onQueryChange?.("");
                close({ commit: false });
                onCustom(createValue);
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
          data-comfortable-expansion={estimatedPanelHeight}
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
        (showEmptyPanel || loading || visible.length > 0) &&
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
                        <div
                          id={optionId(index)}
                          role="option"
                          aria-label={option.ariaLabel}
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
                        </div>
                      );
                    })}
                  </div>
                ))}
              {!loading && !visible.length && (
                <div className="business-select-empty">
                  <strong>
                    {onCustom && customLabel
                      ? (emptyCreateText ??
                        it.noMatchesCreateHint.replace("{action}", customLabel))
                      : emptyText}
                  </strong>
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

type DatePickerType = "date" | "month" | "datetime-local";

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3] ?? 1),
  };
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const value = new Date(year, month - 1 + delta, 1);
  return { year: value.getFullYear(), month: value.getMonth() + 1 };
}

function calendarDays(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(year, month - 1, index - mondayOffset + 1);
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  });
}

export const DatePicker = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function DatePicker(props, forwardedRef) {
  const {
    className = "",
    defaultValue,
    disabled,
    max,
    min,
    onBlur,
    onChange,
    onClick,
    onFocus,
    required,
    type = "date",
    value,
    ...rest
  } = props;
  const pickerType = type as DatePickerType;
  const { locale } = useLanguage();
  const today = useBusinessDay();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(
    String(defaultValue ?? ""),
  );
  const currentValue = String(value ?? internalValue);
  const initial = dateParts(currentValue) ?? dateParts(today)!;
  const [view, setView] = useState({
    year: initial.year,
    month: initial.month,
  });
  const { trigger, panel, position } = useDropdown(open);
  const language = locale === "zh" ? "zh-CN" : "it-IT";
  const copy =
    locale === "zh"
      ? {
          clear: "清空",
          today: "今天",
          previous: "上一个月",
          next: "下一个月",
          choose: "选择日期",
        }
      : {
          clear: "Svuota",
          today: "Oggi",
          previous: "Mese precedente",
          next: "Mese successivo",
          choose: "Scegli data",
        };

  function openPicker() {
    const selected = dateParts(currentValue) ?? dateParts(today)!;
    setView({ year: selected.year, month: selected.month });
    setOpen(true);
  }

  function togglePicker() {
    if (open) setOpen(false);
    else openPicker();
  }

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (
        trigger.current?.contains(event.target) ||
        panel.current?.contains(event.target)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, panel, trigger]);

  function setInputRef(element: HTMLInputElement | null) {
    input.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }

  function emitValue(next: string, close = true) {
    const element = input.current;
    if (!element) return;
    if (value === undefined) setInternalValue(next);
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(element, next);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    if (close) setOpen(false);
    window.setTimeout(() => {
      if (!onBlur || !input.current) return;
      onBlur({
        currentTarget: input.current,
        target: input.current,
      } as FocusEvent<HTMLInputElement>);
    }, 0);
  }

  function chooseDate(year: number, month: number, day: number) {
    const selected = isoDate(year, month, day);
    if (pickerType === "datetime-local") {
      const time = currentValue.slice(11, 16) || "09:00";
      emitValue(`${selected}T${time}`, false);
      setView({ year, month });
      return;
    }
    emitValue(selected);
  }

  const selected = dateParts(currentValue);
  const minimum = typeof min === "string" ? min.slice(0, 10) : "";
  const maximum = typeof max === "string" ? max.slice(0, 10) : "";
  const monthLabel = new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "long",
  }).format(new Date(view.year, view.month - 1, 1));
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(language, { weekday: "narrow" }).format(
      new Date(2024, 0, index + 1),
    ),
  );
  const monthOptions = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(language, { month: "short" }).format(
      new Date(view.year, index, 1),
    ),
  );

  return (
    <div
      ref={trigger}
      className={`date-picker ${className}${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`.trim()}
    >
      <CalendarDays className="date-picker-leading-icon" size={17} />
      <input
        {...rest}
        ref={setInputRef}
        className="date-picker-input"
        type={pickerType}
        value={currentValue}
        disabled={disabled}
        min={min}
        max={max}
        required={required}
        onChange={(event) => {
          if (value === undefined) setInternalValue(event.target.value);
          onChange?.(event);
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !disabled) togglePicker();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !disabled) {
            event.preventDefault();
            openPicker();
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <button
        type="button"
        className="date-picker-toggle"
        aria-label={copy.choose}
        aria-expanded={open}
        disabled={disabled}
        onClick={togglePicker}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            className="date-picker-popover"
            role="dialog"
            aria-label={copy.choose}
            style={{
              top: position.top,
              left: position.left,
              minWidth: Math.max(position.width, 310),
            }}
            data-prevent-card-autosave
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                input.current?.focus();
              }
            }}
          >
            <div className="date-picker-header">
              <button
                type="button"
                aria-label={copy.previous}
                onClick={() =>
                  setView((current) =>
                    shiftMonth(
                      current.year,
                      current.month,
                      pickerType === "month" ? -12 : -1,
                    ),
                  )
                }
              >
                <ChevronLeft size={18} />
              </button>
              <strong>{pickerType === "month" ? view.year : monthLabel}</strong>
              <button
                type="button"
                aria-label={copy.next}
                onClick={() =>
                  setView((current) =>
                    shiftMonth(
                      current.year,
                      current.month,
                      pickerType === "month" ? 12 : 1,
                    ),
                  )
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {pickerType === "month" ? (
              <div className="date-picker-months">
                {monthOptions.map((label, index) => {
                  const next = `${view.year}-${String(index + 1).padStart(2, "0")}`;
                  const unavailable =
                    (typeof min === "string" && next < min.slice(0, 7)) ||
                    (typeof max === "string" && next > max.slice(0, 7));
                  return (
                    <button
                      type="button"
                      key={next}
                      className={currentValue === next ? "is-selected" : ""}
                      disabled={unavailable}
                      onClick={() => emitValue(next)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="date-picker-weekdays" aria-hidden="true">
                  {weekdays.map((weekday, index) => (
                    <span key={`${weekday}-${index}`}>{weekday}</span>
                  ))}
                </div>
                <div className="date-picker-days">
                  {calendarDays(view.year, view.month).map((day) => {
                    const next = isoDate(day.year, day.month, day.day);
                    const unavailable =
                      (minimum && next < minimum) ||
                      (maximum && next > maximum);
                    return (
                      <button
                        type="button"
                        key={next}
                        className={`${day.month !== view.month ? "is-outside" : ""}${selected && next === isoDate(selected.year, selected.month, selected.day) ? " is-selected" : ""}${next === today ? " is-today" : ""}`.trim()}
                        disabled={Boolean(unavailable)}
                        onClick={() => chooseDate(day.year, day.month, day.day)}
                      >
                        {day.day}
                      </button>
                    );
                  })}
                </div>
                {pickerType === "datetime-local" && (
                  <label className="date-picker-time">
                    <span>{locale === "zh" ? "时间" : "Ora"}</span>
                    <input
                      type="time"
                      value={currentValue.slice(11, 16) || "09:00"}
                      onChange={(event) => {
                        const day = currentValue.slice(0, 10) || today;
                        emitValue(`${day}T${event.target.value}`, false);
                      }}
                    />
                  </label>
                )}
              </>
            )}
            <div className="date-picker-footer">
              {!required && (
                <button type="button" onClick={() => emitValue("")}>
                  <Trash2 size={15} /> {copy.clear}
                </button>
              )}
              <button
                type="button"
                className="date-picker-today"
                onClick={() => {
                  if (pickerType === "month") emitValue(today.slice(0, 7));
                  else if (pickerType === "datetime-local")
                    emitValue(
                      `${today}T${currentValue.slice(11, 16) || "09:00"}`,
                    );
                  else emitValue(today);
                }}
              >
                {copy.today}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});
