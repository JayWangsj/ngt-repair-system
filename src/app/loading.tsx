"use client";
import { useMessages } from "@/components/language";
export default function Loading() {
  const it = useMessages();
  return (
    <div className="standalone" role="status">
      {it.loading}
    </div>
  );
}
