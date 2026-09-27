"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  deleteFaultAction,
  reorderFaultsAction,
  saveFaultAction,
} from "@/app/actions";
import { categories, type Category } from "@/lib/catalog";
import { useLanguage, useMessages } from "./language";
import { Field, FormDialog } from "./forms";
import { Button } from "./ui/button";

export type FaultCatalogItem = {
  id: string;
  category: string;
  name: string;
  note: string;
  hidden: boolean;
  sortOrder: number;
  usageCount: number;
};

type Draft = FaultCatalogItem & { created?: boolean };

function similarity(a: string, b: string) {
  const left = a.trim().toLocaleLowerCase("it");
  const right = b.trim().toLocaleLowerCase("it");
  if (!left || !right) return 0;
  const table = Array.from({ length: left.length + 1 }, (_, i) =>
    Array.from({ length: right.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  );
  for (let i = 1; i <= left.length; i++)
    for (let j = 1; j <= right.length; j++)
      table[i][j] = Math.min(
        table[i - 1][j] + 1,
        table[i][j - 1] + 1,
        table[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
  return (
    1 - table[left.length][right.length] / Math.max(left.length, right.length)
  );
}

export function findSimilarFault(
  name: string,
  items: Pick<FaultCatalogItem, "id" | "name">[],
) {
  const exact = items.find(
    (item) =>
      item.name.trim().toLocaleLowerCase("it") ===
      name.trim().toLocaleLowerCase("it"),
  );
  if (exact) return { kind: "exact" as const, item: exact };
  const similar = items
    .map((item) => ({ item, score: similarity(name, item.name) }))
    .sort((a, b) => b.score - a.score)[0];
  return similar && similar.score >= 0.72
    ? { kind: "similar" as const, item: similar.item }
    : null;
}

export function FaultCatalogManager({
  items,
  initialCategory = "PHONE",
  triggerLabel,
  onChanged,
}: {
  items: FaultCatalogItem[];
  initialCategory?: string;
  triggerLabel?: string;
  onChanged?: (items: FaultCatalogItem[]) => void;
}) {
  const it = useMessages();
  const { locale } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const category = initialCategory;
  const [drafts, setDrafts] = useState<Draft[]>(items);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dragId, setDragId] = useState("");
  const scoped = useMemo(
    () =>
      drafts
        .filter((item) => item.category === category)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [category, drafts],
  );
  const visible = scoped.filter((item) =>
    `${item.name} ${item.note}`
      .toLocaleLowerCase("it")
      .includes(query.toLocaleLowerCase("it")),
  );

  function move(id: string, delta: number) {
    const index = scoped.findIndex((item) => item.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= scoped.length) return;
    const reordered = [...scoped];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    setDrafts((current) => [
      ...current.filter((item) => item.category !== category),
      ...reordered.map((item, sortOrder) => ({ ...item, sortOrder })),
    ]);
  }

  async function saveAll() {
    setPending(true);
    setError("");
    try {
      const saved: FaultCatalogItem[] = [];
      for (const draft of drafts) {
        let next: FaultCatalogItem = draft;
        const original = items.find((item) => item.id === draft.id);
        if (
          draft.created ||
          !original ||
          draft.name !== original.name ||
          draft.note !== original.note ||
          draft.hidden !== original.hidden
        ) {
          const result = await saveFaultAction(
            draft.created ? null : draft.id,
            {
              category: draft.category,
              name: draft.name,
              note: draft.note,
              hidden: draft.hidden,
            },
          );
          if (!result.ok) throw new Error(result.error);
          if (draft.created && result.id) {
            next = {
              id: result.id,
              category: draft.category,
              name: draft.name,
              note: draft.note,
              hidden: draft.hidden,
              sortOrder: draft.sortOrder,
              usageCount: draft.usageCount,
            };
          }
        }
        saved.push(next);
      }
      const ids = saved
        .filter((item) => item.category === category)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.id);
      if (ids.length) {
        const result = await reorderFaultsAction(category, ids);
        if (!result.ok) throw new Error(result.error);
      }
      setDrafts(saved);
      onChanged?.(saved);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : it.connectionError);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {triggerLabel ?? it.manageFaults}
      </Button>
      {open && (
        <FormDialog
          title={it.manageFaults}
          subtitle={it.manageFaultsFor.replace(
            "{device}",
            categories[category as Category]?.[locale === "zh" ? 1 : 0] ??
              category,
          )}
          onClose={() => setOpen(false)}
        >
          {editing ? (
            <form
              className="dialog-form"
              data-form-dialog-body
              onSubmit={(event) => {
                event.preventDefault();
                const duplicate = drafts.find(
                  (item) =>
                    item.id !== editing.id &&
                    item.category === editing.category &&
                    item.name.trim().toLocaleLowerCase("it") ===
                      editing.name.trim().toLocaleLowerCase("it"),
                );
                if (duplicate) return setError(it.faultAlreadyExists);
                setDrafts((current) =>
                  current.some((item) => item.id === editing.id)
                    ? current.map((item) =>
                        item.id === editing.id ? editing : item,
                      )
                    : [...current, editing],
                );
                setEditing(null);
                setError("");
              }}
            >
              <Field label={it.faultName}>
                <input
                  required
                  maxLength={120}
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({ ...editing, name: event.target.value })
                  }
                />
              </Field>
              <Field label={it.faultCatalogNote}>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={editing.note}
                  onChange={(event) =>
                    setEditing({ ...editing, note: event.target.value })
                  }
                />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!editing.hidden}
                  onChange={(event) =>
                    setEditing({ ...editing, hidden: !event.target.checked })
                  }
                />
                {it.showInNewOrder}
              </label>
              {(() => {
                const match = findSimilarFault(
                  editing.name,
                  drafts.filter(
                    (item) =>
                      item.id !== editing.id &&
                      item.category === editing.category,
                  ),
                );
                return match?.kind === "similar" ? (
                  <p className="message warning">
                    {it.similarFault}: {match.item.name}
                  </p>
                ) : null;
              })()}
              {error && <p className="message error">{error}</p>}
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  {it.cancel}
                </Button>
                <Button>{editing.created ? it.addFault : it.save}</Button>
              </div>
            </form>
          ) : (
            <div className="fault-manager" data-form-dialog-body>
              <div className="catalog-toolbar fault-manager-toolbar">
                <label className="fault-search">
                  <Search size={15} />
                  <input
                    value={query}
                    placeholder={it.faultSearch}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  onClick={() =>
                    setEditing({
                      id: `new-${crypto.randomUUID()}`,
                      category,
                      name: "",
                      note: "",
                      hidden: false,
                      sortOrder: scoped.length,
                      usageCount: 0,
                      created: true,
                    })
                  }
                >
                  <Plus size={16} /> {it.addFault}
                </Button>
              </div>
              <div className="fault-manager-list" role="table">
                {visible.map((item) => (
                  <div
                    className="fault-manager-row"
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      const from = scoped.findIndex(
                        (candidate) => candidate.id === dragId,
                      );
                      const to = scoped.findIndex(
                        (candidate) => candidate.id === item.id,
                      );
                      if (from >= 0 && to >= 0) move(dragId, to - from);
                      setDragId("");
                    }}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                    <strong>{item.name}</strong>
                    <label className="fault-enabled-switch">
                      <input
                        type="checkbox"
                        checked={!item.hidden}
                        onChange={() =>
                          setDrafts((current) =>
                            current.map((candidate) =>
                              candidate.id === item.id
                                ? { ...candidate, hidden: !candidate.hidden }
                                : candidate,
                            ),
                          )
                        }
                      />
                      <span>
                        {item.hidden ? it.disabledState : it.enabledState}
                      </span>
                    </label>
                    <div className="fault-row-actions">
                      <button
                        type="button"
                        aria-label={`${it.edit} ${item.name}`}
                        onClick={() => setEditing(item)}
                      >
                        <Pencil size={15} />
                      </button>
                      {item.usageCount === 0 && !item.created && (
                        <button
                          type="button"
                          aria-label={`${it.remove} ${item.name}`}
                          onClick={async () => {
                            if (!window.confirm(it.permanentFaultDeleteConfirm))
                              return;
                            const result = await deleteFaultAction(item.id);
                            if (!result.ok) return setError(result.error);
                            setDrafts((current) =>
                              current.filter(
                                (candidate) => candidate.id !== item.id,
                              ),
                            );
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {error && <p className="message error">{error}</p>}
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  {it.cancel}
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void saveAll()}
                >
                  {pending ? it.saving : it.saveChanges}
                </Button>
              </div>
            </div>
          )}
        </FormDialog>
      )}
    </>
  );
}
