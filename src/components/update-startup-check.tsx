"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useMessages } from "./language";
import {
  readAutoUpdateCheck,
  UPDATE_CHECKED_SESSION_KEY,
} from "@/lib/update-preference";

export function UpdateStartupCheck() {
  const it = useMessages();
  const path = usePathname();
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (path.startsWith("/settings/system-update")) return;
    if (!readAutoUpdateCheck()) return;
    if (window.sessionStorage.getItem(UPDATE_CHECKED_SESSION_KEY)) return;
    window.sessionStorage.setItem(UPDATE_CHECKED_SESSION_KEY, "true");
    const controller = new AbortController();
    void fetch("/api/system-update", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as {
          updateAvailable?: boolean;
          latestVersion?: string;
        };
        if (result.updateAvailable && result.latestVersion) {
          setVersion(result.latestVersion);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
    // One check per application session; navigation must not start polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!version) return null;
  return (
    <aside className="update-notification" aria-live="polite">
      <Link href="/settings/system-update">
        {it.updateAvailable.replace("{version}", version)}
      </Link>
      <button
        type="button"
        aria-label={it.close}
        onClick={() => setVersion("")}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
