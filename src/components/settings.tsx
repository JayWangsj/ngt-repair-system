"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, Trash2 } from "lucide-react";
import { clearDataAction } from "@/app/actions";
import { LanguageSwitch, useMessages } from "./language";
import { Button } from "./ui/button";

export function SettingsTools() {
  const it = useMessages();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function importFile(file: File) {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const result = (await response.json()) as {
        imported?: number;
        skipped?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || it.connectionError);
      setMessage(
        it.importSuccess +
          " " +
          String(result.imported ?? 0) +
          " / " +
          String(result.skipped ?? 0),
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : it.connectionError);
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  async function clearAll() {
    if (!window.confirm(it.clearDataConfirm)) return;
    setPending(true);
    setMessage("");
    setError("");
    try {
      const result = await clearDataAction();
      if (!result.ok) throw new Error(result.error);
      setMessage(it.clearDataSuccess);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : it.connectionError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="settings-grid">
      <section className="panel padded settings-card">
        <h2>{it.language}</h2>
        <LanguageSwitch />
      </section>
      <section className="panel padded settings-card">
        <h2>{it.dataManagement}</h2>
        <div className="settings-action">
          <div>
            <strong>{it.exportData}</strong>
            <p>{it.exportHelp}</p>
          </div>
          <Button asChild variant="outline">
            <a href="/api/data/export">
              <Download size={17} />
              {it.exportData}
            </a>
          </Button>
        </div>
        <div className="settings-action">
          <div>
            <strong>{it.importData}</strong>
            <p>{it.importHelp}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <Upload size={17} />
            {it.chooseBackup}
          </Button>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </div>
        <div className="settings-action danger-zone">
          <div>
            <strong>{it.clearData}</strong>
            <p>{it.clearDataHelp}</p>
          </div>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => void clearAll()}
          >
            <Trash2 size={17} />
            {it.clearData}
          </Button>
        </div>
        {message && (
          <p className="message success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
