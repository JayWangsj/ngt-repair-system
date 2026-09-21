"use client";
import { useMessages } from "@/components/language";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const it = useMessages();
  return (
    <section className="standalone">
      <h1>{it.errorTitle}</h1>
      <p>{it.connectionError}</p>
      <button className="button button-primary" onClick={reset}>
        {it.retry}
      </button>
    </section>
  );
}
