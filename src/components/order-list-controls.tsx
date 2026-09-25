"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  paymentAction,
  statusAction,
  updateDueDateAction,
} from "@/app/actions";
import {
  decimal,
  money,
  romeDay,
  transitions,
  type OrderStatus,
} from "@/lib/domain";
import { useMessages } from "./language";

export function OrderStatusControl({
  id,
  status,
}: {
  id: string;
  status: OrderStatus;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const choices = transitions[status].filter((next) => next !== "COMPLETED");
  return (
    <div className="inline-order-control">
      <select
        className={`status-select status-${status.toLowerCase()}`}
        aria-label={`${it.statusLabel}: ${it.status[status]}`}
        value={status}
        disabled={pending || choices.length === 0}
        onChange={(event) => {
          const next = event.target.value as OrderStatus;
          startTransition(async () => {
            const result = await statusAction(id, { status: next, note: "" });
            if (!result.ok) return setError(result.error);
            setError("");
            router.refresh();
          });
        }}
      >
        <option value={status}>{it.status[status]}</option>
        {choices.map((next) => (
          <option value={next} key={next}>
            {it.status[next]}
          </option>
        ))}
      </select>
      {error && <small className="inline-control-error">{error}</small>}
    </div>
  );
}

export function OrderDueDateControl({
  id,
  value,
  closed,
}: {
  id: string;
  value: string;
  closed: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="inline-order-control">
      <input
        className="order-due-input"
        aria-label={it.dueDate}
        type="date"
        min={romeDay()}
        defaultValue={value}
        disabled={closed || pending}
        onChange={(event) => {
          const dueDate = event.target.value;
          startTransition(async () => {
            const result = await updateDueDateAction(id, dueDate);
            if (!result.ok) return setError(result.error);
            setError("");
            router.refresh();
          });
        }}
      />
      {error && <small className="inline-control-error">{error}</small>}
    </div>
  );
}

export function OrderPaymentControl({
  id,
  due,
  balance,
  disabled,
}: {
  id: string;
  due: number;
  balance: number;
  disabled: boolean;
}) {
  const it = useMessages();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(decimal(balance));
  const [method, setMethod] = useState<"CASH" | "CARD" | "OTHER">("CASH");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const paid = due - balance;
  if (!editing)
    return (
      <button
        type="button"
        className="order-payment-trigger"
        disabled={disabled || balance <= 0}
        onClick={() => setEditing(true)}
      >
        <strong>
          {money(paid)} / {money(due)}
        </strong>
        <small>
          {it.balance}: {money(balance)}
        </small>
      </button>
    );
  return (
    <form
      className="inline-payment-form"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await paymentAction(id, {
            requestId: crypto.randomUUID(),
            amount,
            method,
            kind: "BALANCE",
          });
          if (!result.ok) return setError(result.error);
          setEditing(false);
          setError("");
          router.refresh();
        });
      }}
    >
      <input
        aria-label={it.amount}
        value={amount}
        inputMode="decimal"
        disabled={pending}
        onChange={(event) => setAmount(event.target.value)}
        autoFocus
      />
      <select
        aria-label={it.paymentMethod}
        value={method}
        disabled={pending}
        onChange={(event) => setMethod(event.target.value as typeof method)}
      >
        <option value="CASH">{it.methods.CASH}</option>
        <option value="CARD">{it.methods.CARD}</option>
        <option value="OTHER">{it.methods.OTHER}</option>
      </select>
      <button disabled={pending}>{it.save}</button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setEditing(false)}
      >
        ×
      </button>
      {error && <small className="inline-control-error">{error}</small>}
    </form>
  );
}
