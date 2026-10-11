"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { renameDeviceModelAction, saveQuickServiceAction } from "@/app/actions";
import { categories, type Category } from "@/lib/catalog";
import { cents, decimal } from "@/lib/domain";
import { useLanguage, useMessages } from "./language";
import { Button } from "./ui/button";
import { Field, FormDialog } from "./forms";

export type QuickServiceView = {
  id: string;
  name: string;
  defaultPrice: number;
  notes: string;
  enabled: boolean;
};

export type SavedModelView = {
  category: string;
  brand: string;
  model: string;
};

export function QuickServiceEditor({
  item,
  onSaved,
  onCancel,
}: {
  item?: QuickServiceView;
  onSaved: (item: QuickServiceView) => void;
  onCancel: () => void;
}) {
  const it = useMessages();
  const [draft, setDraft] = useState<QuickServiceView>(
    item ?? {
      id: "",
      name: "",
      defaultPrice: 0,
      notes: "",
      enabled: true,
    },
  );
  const [priceDraft, setPriceDraft] = useState(
    decimal(item?.defaultPrice ?? 0),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function save() {
    startTransition(async () => {
      const result = await saveQuickServiceAction(draft.id || null, {
        name: draft.name,
        defaultPrice: priceDraft,
        notes: draft.notes,
        enabled: draft.enabled,
      });
      if (!result.ok || !result.id)
        return setError(result.ok ? it.connectionError : result.error);
      onSaved({
        ...draft,
        id: result.id,
        defaultPrice: cents(priceDraft),
      });
    });
  }

  return (
    <form
      className="dialog-form"
      data-form-dialog-body
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Field label={it.quickService.name}>
        <input
          value={draft.name}
          maxLength={120}
          required
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field label={it.quickService.defaultPrice}>
        <input
          value={priceDraft}
          inputMode="decimal"
          required
          onChange={(event) => setPriceDraft(event.target.value)}
        />
      </Field>
      <Field label={it.quickService.notes}>
        <textarea
          value={draft.notes}
          maxLength={2000}
          onChange={(event) =>
            setDraft({ ...draft, notes: event.target.value })
          }
        />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) =>
            setDraft({ ...draft, enabled: event.target.checked })
          }
        />
        {it.quickService.enabled}
      </label>
      {error && <p className="message error">{error}</p>}
      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={onCancel}>
          {it.cancel}
        </Button>
        <Button disabled={pending}>{it.save}</Button>
      </div>
    </form>
  );
}

export function QuickServiceManager({ items }: { items: QuickServiceView[] }) {
  const it = useMessages();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(items);
  const [editing, setEditing] = useState<QuickServiceView | null>(null);

  function editor(item?: QuickServiceView) {
    setEditing(
      item ?? {
        id: "",
        name: "",
        defaultPrice: 0,
        notes: "",
        enabled: true,
      },
    );
  }

  return (
    <>
      <button
        type="button"
        className="fault-manager-trigger"
        onClick={() => setOpen(true)}
      >
        <span>{it.quickService.manage}</span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      {open && (
        <FormDialog
          title={it.quickService.manage}
          onClose={() => setOpen(false)}
        >
          <div className="catalog-manager" data-form-dialog-body>
            {drafts.length ? (
              <div className="catalog-manager-list">
                {drafts.map((item) => (
                  <button
                    type="button"
                    className="catalog-manager-row business-list-row"
                    key={item.id}
                    onClick={() => editor(item)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.notes || "—"}</small>
                    </span>
                    <span>{decimal(item.defaultPrice)}</span>
                    <em>{item.enabled ? it.enabledState : it.disabledState}</em>
                    <span className="record-actions" aria-hidden="true">
                      <span className="record-icon">
                        <Pencil size={15} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">{it.quickService.noServices}</p>
            )}
            <button
              type="button"
              className="quick-service-service-add"
              onClick={() => editor()}
            >
              <Plus size={18} /> {it.quickService.new}
            </button>
          </div>
        </FormDialog>
      )}
      {editing && (
        <FormDialog
          title={editing.id ? it.edit : it.quickService.new}
          onClose={() => setEditing(null)}
        >
          <QuickServiceEditor
            item={editing}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              setDrafts((current) =>
                [
                  ...current.filter((entry) => entry.id !== saved.id),
                  saved,
                ].sort((a, b) => a.name.localeCompare(b.name)),
              );
              setEditing(null);
            }}
          />
        </FormDialog>
      )}
    </>
  );
}

export function DeviceModelManager({ items }: { items: SavedModelView[] }) {
  const it = useMessages();
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(items);
  const [editing, setEditing] = useState<SavedModelView | null>(null);
  const [replacement, setReplacement] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const editingInput = useRef<HTMLInputElement>(null);
  const cancelling = useRef(false);
  const groups = useMemo(() => {
    const grouped = new Map<string, SavedModelView[]>();
    for (const item of drafts) {
      const key = `${item.brand}\u0000${item.category}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return [...grouped.entries()]
      .map(([key, groupItems]) => ({
        key,
        brand: groupItems[0].brand,
        category: groupItems[0].category,
        items: groupItems.sort((a, b) =>
          a.model.localeCompare(b.model, undefined, { numeric: true }),
        ),
      }))
      .sort((a, b) =>
        `${a.brand} ${a.category}`.localeCompare(`${b.brand} ${b.category}`),
      );
  }, [drafts]);

  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      editingInput.current?.focus();
      editingInput.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  function save() {
    if (cancelling.current) {
      cancelling.current = false;
      return;
    }
    if (!editing || !replacement.trim()) return;
    const nextModel = replacement.trim();
    const duplicate = drafts.some(
      (item) =>
        item !== editing &&
        item.category === editing.category &&
        item.brand.toLocaleLowerCase("it") ===
          editing.brand.toLocaleLowerCase("it") &&
        item.model.toLocaleLowerCase("it") ===
          nextModel.toLocaleLowerCase("it"),
    );
    if (duplicate) {
      setError(it.modelCatalog.duplicate);
      return;
    }
    if (nextModel === editing.model) {
      setEditing(null);
      return;
    }
    startTransition(async () => {
      const result = await renameDeviceModelAction({
        ...editing,
        from: editing.model,
        to: nextModel,
      });
      if (!result.ok) return setError(result.error);
      setDrafts((current) =>
        current.map((item) =>
          item.category === editing.category &&
          item.brand === editing.brand &&
          item.model === editing.model
            ? { ...item, model: nextModel }
            : item,
        ),
      );
      setEditing(null);
      setReplacement("");
    });
  }

  return (
    <>
      <button
        type="button"
        className="fault-manager-trigger"
        onClick={() => setOpen(true)}
      >
        <span>{it.modelCatalog.manage}</span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      {open && (
        <FormDialog
          title={it.modelCatalog.title}
          subtitle={it.modelCatalog.description}
          onClose={() => {
            setEditing(null);
            setError("");
            setOpen(false);
          }}
        >
          <div className="model-manager" data-form-dialog-body>
            {groups.map((group) => (
              <section key={group.key}>
                <button
                  type="button"
                  className="model-group-heading"
                  aria-expanded={!collapsed.has(group.key)}
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                >
                  <span>
                    <strong>{group.brand}</strong>
                    <small>
                      {categories[group.category as Category]?.[
                        locale === "zh" ? 1 : 0
                      ] ?? group.category}
                    </small>
                  </span>
                  <ChevronDown size={17} aria-hidden="true" />
                </button>
                {!collapsed.has(group.key) && (
                  <div className="model-group-items">
                    {group.items.map((item) =>
                      editing === item ? (
                        <input
                          ref={editingInput}
                          className="model-inline-name"
                          key={`${item.category}:${item.model}`}
                          value={replacement}
                          disabled={pending}
                          aria-label={it.modelCatalog.replacement}
                          onChange={(event) => {
                            setReplacement(event.target.value);
                            setError("");
                          }}
                          onBlur={save}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelling.current = true;
                              setEditing(null);
                              setError("");
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="model-name-button"
                          key={`${item.category}:${item.model}`}
                          onClick={() => {
                            cancelling.current = false;
                            setEditing(item);
                            setReplacement(item.model);
                            setError("");
                          }}
                        >
                          {item.model}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </section>
            ))}
            {error && (
              <p className="message error" role="alert">
                {error}
              </p>
            )}
          </div>
        </FormDialog>
      )}
    </>
  );
}
