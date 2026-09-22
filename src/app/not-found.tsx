"use client";
import Link from "next/link";
import { useMessages } from "@/components/language";
export default function NotFound() {
  const it = useMessages();
  return (
    <main className="standalone">
      <h1>404</h1>
      <p>{it.notFound}</p>
      <Link className="button button-outline" href="/">
        {it.backHome}
      </Link>
    </main>
  );
}
