"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Download, Upload, Trash2 } from "lucide-react";
import { clearDataAction, updateBusinessClockAction } from "@/app/actions";
import { LanguageSwitch, useMessages } from "./language";
import { Button } from "./ui/button";
import { DatePicker, SimpleSelect } from "./business-select";
import { Field } from "./forms";
import {
  FaultCatalogManager,
  type FaultCatalogItem,
} from "./fault-catalog-manager";

export function SettingsTools({
  faultOptions,
  clock,
  today,
}: {
  faultOptions: FaultCatalogItem[];
  clock: { mode: "SYSTEM" | "MANUAL"; manualDate: string };
  today: string;
}) {
  const it = useMessages();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clockPending, setClockPending] = useState(false);
  const [dateMode, setDateMode] = useState(clock.mode);
  const [manualDate, setManualDate] = useState(clock.manualDate || today);

  async function saveClock() {
    setClockPending(true);
    setMessage("");
    setError("");
    const result = await updateBusinessClockAction({
      mode: dateMode,
      manualDate,
    });
    setClockPending(false);
    if (!result.ok) return setError(result.error);
    setMessage(it.businessDateSaved);
    router.refresh();
  }

  async function exportFile() {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/data/export");
      if (!response.ok) throw new Error(it.connectionError);
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? "ngt-backup.json";
      const picker = (
        window as typeof window & {
          showSaveFilePicker?: (options: {
            suggestedName: string;
            types: { description: string; accept: Record<string, string[]> }[];
          }) => Promise<{
            createWritable: () => Promise<{
              write: (value: Blob) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }
      ).showSaveFilePicker;
      if (picker) {
        const handle = await picker({
          suggestedName: filename,
          types: [
            {
              description: "Backup JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      setMessage(it.exportData);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : it.connectionError);
    } finally {
      setPending(false);
    }
  }

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
      <section className="panel padded settings-card business-date-settings">
        <div className="settings-card-title">
          <CalendarDays size={19} aria-hidden="true" />
          <h2>{it.businessDate}</h2>
        </div>
        <p>{it.businessDateHelp}</p>
        <div className="settings-date-form">
          <Field label={it.dateMode}>
            <SimpleSelect
              value={dateMode}
              onChange={(value) =>
                setDateMode(value === "MANUAL" ? "MANUAL" : "SYSTEM")
              }
              ariaLabel={it.dateMode}
              placeholder={it.systemDate}
              options={[
                { value: "SYSTEM", label: it.systemDate },
                { value: "MANUAL", label: it.manualDate },
              ]}
            />
          </Field>
          {dateMode === "MANUAL" && (
            <Field label={it.manualDate}>
              <DatePicker
                value={manualDate}
                onChange={(event) => setManualDate(event.target.value)}
              />
            </Field>
          )}
          <div className="business-date-current">
            <span>{it.currentBusinessDate}</span>
            <strong>{today.split("-").reverse().join("/")}</strong>
          </div>
          <Button
            type="button"
            disabled={clockPending || (dateMode === "MANUAL" && !manualDate)}
            onClick={() => void saveClock()}
          >
            {clockPending ? it.saving : it.save}
          </Button>
        </div>
      </section>
      <section className="panel padded settings-card">
        <h2>{it.faultCatalog}</h2>
        <p>{it.faultCatalogDescription}</p>
        <FaultCatalogManager
          items={faultOptions}
          triggerLabel={it.manageFaults}
        />
      </section>
      <section className="panel padded settings-card">
        <h2>{it.dataManagement}</h2>
        <div className="settings-action">
          <div>
            <strong>{it.exportData}</strong>
            <p>{it.exportHelp}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void exportFile()}
          >
            <Download size={17} />
            {it.exportData}
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
