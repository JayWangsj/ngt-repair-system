"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { renameDeviceModelAction, saveQuickServiceAction } from "@/app/actions";
import { cents, decimal } from "@/lib/domain";
import { useMessages } from "./language";
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
            <div className="catalog-manager-actions">
              <Button type="button" variant="outline" onClick={() => editor()}>
                <Plus size={16} /> {it.quickService.new}
              </Button>
            </div>
            {drafts.length ? (
              <div className="catalog-manager-list">
                {drafts.map((item) => (
                  <button
                    type="button"
                    className="catalog-manager-row"
                    key={item.id}
                    onClick={() => editor(item)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.notes || "—"}</small>
                    </span>
                    <span>{decimal(item.defaultPrice)}</span>
                    <em>{item.enabled ? it.enabledState : it.disabledState}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">{it.quickService.noServices}</p>
            )}
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
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(items);
  const [editing, setEditing] = useState<SavedModelView | null>(null);
  const [replacement, setReplacement] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const groups = useMemo(
    () =>
      [...new Set(drafts.map((item) => item.brand))].sort().map((brand) => ({
        brand,
        items: drafts.filter((item) => item.brand === brand),
      })),
    [drafts],
  );

  function save() {
    if (!editing || !replacement.trim()) return;
    startTransition(async () => {
      const result = await renameDeviceModelAction({
        ...editing,
        from: editing.model,
        to: replacement,
      });
      if (!result.ok) return setError(result.error);
      setDrafts((current) =>
        current.map((item) =>
          item.category === editing.category &&
          item.brand === editing.brand &&
          item.model === editing.model
            ? { ...item, model: replacement.trim() }
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
          onClose={() => setOpen(false)}
        >
          <div className="model-manager" data-form-dialog-body>
            {groups.map((group) => (
              <section key={group.brand}>
                <h3>{group.brand}</h3>
                <div>
                  {group.items.map((item) => (
                    <button
                      type="button"
                      key={`${item.category}:${item.model}`}
                      onClick={() => {
                        setEditing(item);
                        setReplacement(item.model);
                        setError("");
                      }}
                    >
                      {item.model}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </FormDialog>
      )}
      {editing && (
        <FormDialog
          title={it.modelCatalog.rename}
          onClose={() => setEditing(null)}
        >
          <form
            className="dialog-form"
            data-form-dialog-body
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Field label={it.modelCatalog.current}>
              <input value={`${editing.brand} ${editing.model}`} readOnly />
            </Field>
            <Field label={it.modelCatalog.replacement}>
              <input
                value={replacement}
                required
                onChange={(event) => setReplacement(event.target.value)}
              />
            </Field>
            {error && <p className="message error">{error}</p>}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                {it.cancel}
              </Button>
              <Button disabled={pending}>{it.save}</Button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}
