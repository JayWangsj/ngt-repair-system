"use client";

import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { OrderStatus } from "@/lib/domain";

type Option = { value: OrderStatus; label: string };

export function StatusDropdown({
  value,
  label,
  options,
  disabled = false,
  readonly = false,
  onChange,
  size = "sm",
}: {
  value: OrderStatus;
  label: string;
  options: Option[];
  disabled?: boolean;
  readonly?: boolean;
  onChange: (value: OrderStatus) => void;
  size?: "sm";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const interactive = !disabled && !readonly && options.length > 0;

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
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target))
        setOpen(false);
    }
    function reposition() {
      place();
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!interactive) return;
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() =>
        menu.current?.querySelector<HTMLButtonElement>("button")?.focus(),
      );
    }
  }

  return (
    <span
      className={`status-dropdown status-dropdown-${size} ${open ? "is-open" : ""}`}
      data-prevent-card-autosave
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={trigger}
        type="button"
        className={`status-dropdown-trigger status-${value.toLowerCase()}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={interactive ? menuId : undefined}
        disabled={disabled}
        onClick={() => interactive && setOpen((current) => !current)}
        onKeyDown={keyboard}
      >
        <span className="status-dropdown-dot" aria-hidden="true" />
        <span>{label}</span>
        {interactive && <ChevronDown size={13} aria-hidden="true" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            className="status-dropdown-menu"
            role="listbox"
            aria-label={label}
            data-prevent-card-autosave
            style={{
              top: position.top,
              left: position.left,
              minWidth: position.width,
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                trigger.current?.focus();
              }
            }}
          >
            {options.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                className={`status-dropdown-option status-${option.value.toLowerCase()}`}
                key={option.value}
                onClick={() => {
                  setOpen(false);
                  onChange(option.value);
                }}
              >
                <span className="status-dropdown-dot" aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
