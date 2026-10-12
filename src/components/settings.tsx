"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Upload,
  Trash2,
} from "lucide-react";
import { clearDataAction, updateBusinessClockAction } from "@/app/actions";
import { LanguageSwitch, useMessages } from "./language";
import { Button } from "./ui/button";
import { DatePicker, SimpleSelect } from "./business-select";
import { Field, FormDialog } from "./forms";
import {
  FaultCatalogManager,
  type FaultCatalogItem,
} from "./fault-catalog-manager";
import {
  isAlwaysMotionEnabled,
  setAlwaysMotionEnabled,
} from "@/lib/motion-preference";
import { TestTools } from "./test-tools";
import {
  readOrderViewportFollow,
  writeOrderViewportFollow,
} from "@/lib/order-motion";
import {
  DeviceModelManager,
  QuickServiceManager,
  type QuickServiceView,
  type SavedModelView,
} from "./catalog-managers";

export function SettingsTools({
  currentVersion,
  testToolsEnabled,
  faultOptions,
  clock,
  today,
  quickServices,
  savedModels,
}: {
  currentVersion: string;
  testToolsEnabled: boolean;
  faultOptions: FaultCatalogItem[];
  clock: { mode: "SYSTEM" | "MANUAL"; manualDate: string };
  today: string;
  quickServices: QuickServiceView[];
  savedModels: SavedModelView[];
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
  const [savedClock, setSavedClock] = useState({
    mode: clock.mode,
    manualDate: clock.manualDate || today,
  });
  const [updatePending, setUpdatePending] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    installed: boolean;
    currentVersion: string;
    authRequired: boolean;
    updateAvailable: boolean;
    latestVersion?: string;
  } | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [updateConfirmationOpen, setUpdateConfirmationOpen] = useState(false);
  const [githubAuth, setGitHubAuth] = useState<{
    status: "opening" | "waiting";
    verificationUrl?: string;
    userCode?: string;
  } | null>(null);
  const [alwaysMotion, setAlwaysMotion] = useState(false);
  const [followOrderMotion, setFollowOrderMotion] = useState(true);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAlwaysMotion(isAlwaysMotionEnabled());
      setFollowOrderMotion(readOrderViewportFollow());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function changeMotionPreference(enabled: boolean) {
    setAlwaysMotionEnabled(enabled);
    setAlwaysMotion(enabled);
  }

  function changeOrderMotionFollow(enabled: boolean) {
    writeOrderViewportFollow(enabled);
    setFollowOrderMotion(enabled);
  }

  async function beginGitHubLogin() {
    setUpdatePending(true);
    setUpdateError("");
    setUpdateMessage(it.updateLoginOpening);
    try {
      const response = await fetch("/api/system-update/auth", {
        method: "POST",
      });
      const result = (await response.json()) as {
        status?: string;
        verificationUrl?: string;
        userCode?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || it.updateLoginFailed);
      setGitHubAuth({
        status: result.status === "waiting" ? "waiting" : "opening",
        verificationUrl: result.verificationUrl,
        userCode: result.userCode,
      });
      await monitorGitHubLogin();
    } catch (cause) {
      setUpdateMessage("");
      setUpdateError(
        cause instanceof Error ? cause.message : it.updateLoginFailed,
      );
      setUpdatePending(false);
    }
  }

  async function monitorGitHubLogin() {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      try {
        const response = await fetch("/api/system-update/auth", {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          status?: string;
          message?: string;
          verificationUrl?: string;
          userCode?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || it.updateLoginFailed);
        if (result.status === "success") {
          setGitHubAuth(null);
          setUpdateInfo((current) =>
            current ? { ...current, authRequired: false } : current,
          );
          setUpdateMessage(it.updateLoginSuccess);
          setUpdatePending(false);
          return;
        }
        if (result.status === "failed") {
          setUpdateMessage("");
          setUpdateError(
            result.message
              ? `${it.updateLoginFailed} ${result.message}`
              : it.updateLoginFailed,
          );
          setUpdatePending(false);
          return;
        }
        const status = result.status === "waiting" ? "waiting" : "opening";
        setGitHubAuth({
          status,
          verificationUrl: result.verificationUrl,
          userCode: result.userCode,
        });
        setUpdateMessage(
          status === "waiting" ? it.updateLoginWaiting : it.updateLoginOpening,
        );
      } catch (cause) {
        setUpdateMessage("");
        setUpdateError(
          cause instanceof Error ? cause.message : it.updateLoginFailed,
        );
        setUpdatePending(false);
        return;
      }
    }
    setUpdateMessage("");
    setUpdateError(it.updateLoginTimeout);
    setUpdatePending(false);
  }

  async function copyGitHubAuth(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setUpdateMessage(it.updateLoginCopied);
      setUpdateError("");
    } catch {
      setUpdateError(it.updateLoginCopyFailed);
    }
  }

  async function checkForUpdates() {
    setUpdatePending(true);
    try {
      const response = await fetch("/api/system-update", { cache: "no-store" });
      const result = (await response.json()) as {
        installed?: boolean;
        currentVersion?: string;
        authRequired?: boolean;
        updateAvailable?: boolean;
        latestVersion?: string;
      };
      if (!response.ok) throw new Error(it.updateCheckFailed);
      const info = {
        installed: Boolean(result.installed),
        currentVersion: result.currentVersion || currentVersion,
        authRequired: Boolean(result.authRequired),
        updateAvailable: Boolean(result.updateAvailable),
        latestVersion: result.latestVersion,
      };
      setUpdateInfo(info);
      setUpdateError("");
      if (!info.installed) {
        setUpdateMessage(it.updateInstalledOnly);
      } else if (info.authRequired) {
        setUpdateMessage(it.updateAuthRequired);
      } else if (info.updateAvailable) {
        setUpdateMessage(
          it.updateAvailable.replace(
            "{version}",
            info.latestVersion || currentVersion,
          ),
        );
      } else {
        setUpdateMessage(it.updateCurrent);
      }
    } catch (cause) {
      setUpdateMessage("");
      setUpdateError(
        cause instanceof Error ? cause.message : it.updateCheckFailed,
      );
    } finally {
      setUpdatePending(false);
    }
  }

  async function monitorUpdate() {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      try {
        const response = await fetch("/api/system-update/status", {
          cache: "no-store",
        });
        if (!response.ok) continue;
        const result = (await response.json()) as {
          status?: string;
          message?: string;
        };
        if (result.status === "failed") {
          setUpdatePending(false);
          setUpdateError(result.message || it.updateFailed);
          return;
        }
        if (result.status === "complete") {
          window.location.reload();
          return;
        }
        if (result.status === "backing-up") {
          setUpdateMessage(it.updateBackingUp);
        } else if (result.status === "installing") {
          setUpdateMessage(it.updateInstalling);
        } else if (result.status === "downloading") {
          setUpdateMessage(it.updateDownloading);
        }
      } catch {
        // The local server is expected to be briefly unavailable while switching versions.
      }
    }
    setUpdatePending(false);
    setUpdateError(it.updateTimeout);
  }

  async function installUpdate() {
    const latestVersion = updateInfo?.latestVersion;
    if (!latestVersion) return;
    setUpdateConfirmationOpen(false);
    setUpdatePending(true);
    setUpdateError("");
    setUpdateMessage(it.updateStarting);
    try {
      const response = await fetch("/api/system-update", { method: "POST" });
      if (!response.ok) throw new Error(it.updateFailed);
      await monitorUpdate();
    } catch (cause) {
      setUpdatePending(false);
      setUpdateError(cause instanceof Error ? cause.message : it.updateFailed);
    }
  }

  async function saveClock() {
    if (clockPending || !clockChanged) return;
    setClockPending(true);
    setMessage("");
    setError("");
    const result = await updateBusinessClockAction({
      mode: dateMode,
      manualDate,
    });
    if (!result.ok) {
      setClockPending(false);
      return setError(result.error);
    }
    setSavedClock({ mode: dateMode, manualDate });
    setMessage(it.businessDateSaved);
    router.refresh();
    setClockPending(false);
  }

  const clockChanged =
    dateMode !== savedClock.mode ||
    (dateMode === "MANUAL" && manualDate !== savedClock.manualDate);

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
      <section className="panel padded settings-card motion-settings">
        <div className="settings-card-title">
          <Sparkles size={19} aria-hidden="true" />
          <h2>{it.interfaceMotion}</h2>
        </div>
        <div className="settings-action">
          <div>
            <strong>{it.alwaysPlayMotion}</strong>
            <p>{it.motionPreferenceHelp}</p>
          </div>
          <div className="motion-setting-control">
            <span>{alwaysMotion ? it.motionAlways : it.motionSystem}</span>
            <button
              type="button"
              className="motion-switch"
              role="switch"
              aria-checked={alwaysMotion}
              aria-label={it.alwaysPlayMotion}
              onClick={() => changeMotionPreference(!alwaysMotion)}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="settings-action">
          <div>
            <strong>{it.followRepairRowMotion}</strong>
            <p>{it.followRepairRowMotionHelp}</p>
          </div>
          <div className="motion-setting-control">
            <span>
              {followOrderMotion ? it.motionFollowOn : it.motionFollowOff}
            </span>
            <button
              type="button"
              className="motion-switch"
              role="switch"
              aria-checked={followOrderMotion}
              aria-label={it.followRepairRowMotion}
              onClick={() => changeOrderMotionFollow(!followOrderMotion)}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
      {testToolsEnabled && <TestTools />}
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
            className="settings-date-save"
            disabled={
              clockPending ||
              !clockChanged ||
              (dateMode === "MANUAL" && !manualDate)
            }
            onClick={() => void saveClock()}
          >
            {it.save}
          </Button>
        </div>
      </section>
      <section className="panel padded settings-card system-update-settings">
        <div className="settings-card-title">
          <RefreshCw size={19} aria-hidden="true" />
          <h2>{it.systemUpdate}</h2>
        </div>
        <div className="settings-action">
          <div>
            <strong>
              {it.currentVersion}:{" "}
              {updateInfo?.currentVersion || currentVersion}
            </strong>
            <p>{it.systemUpdateHelp}</p>
            {updateInfo?.latestVersion && (
              <p>
                {it.latestVersion}: {updateInfo.latestVersion}
              </p>
            )}
          </div>
          <div className="settings-update-actions">
            <Button
              type="button"
              variant="outline"
              className="system-update-check-button"
              disabled={updatePending}
              onClick={() => void checkForUpdates()}
            >
              <RefreshCw size={17} />
              {updatePending ? it.checkingUpdates : it.checkForUpdates}
            </Button>
            {updateInfo?.authRequired && (
              <Button
                type="button"
                disabled={updatePending}
                onClick={() => void beginGitHubLogin()}
              >
                {it.authorizeGitHub}
              </Button>
            )}
            {updateInfo?.updateAvailable && (
              <Button
                type="button"
                disabled={updatePending}
                onClick={() => setUpdateConfirmationOpen(true)}
              >
                <Download size={17} />
                {it.updateNow}
              </Button>
            )}
          </div>
        </div>
        <div className="system-update-feedback" aria-live="polite">
          {updateMessage && (
            <p className="message success" role="status">
              {updateMessage}
            </p>
          )}
          {updateError && (
            <p className="message error" role="alert">
              {updateError}
            </p>
          )}
          {githubAuth?.verificationUrl && (
            <div className="github-auth-fallback">
              <span>{it.updateLoginFallback}</span>
              <div>
                <Button asChild variant="outline">
                  <a
                    href={githubAuth.verificationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                    {it.updateLoginOpenLink}
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void copyGitHubAuth(
                      githubAuth.userCode || githubAuth.verificationUrl || "",
                    )
                  }
                >
                  <Copy size={16} />
                  {githubAuth.userCode || it.updateLoginCopyLink}
                </Button>
              </div>
            </div>
          )}
        </div>
        {updateConfirmationOpen && updateInfo?.latestVersion && (
          <FormDialog
            title={it.updateConfirmTitle}
            onClose={() => setUpdateConfirmationOpen(false)}
          >
            <form
              className="dialog-form confirm-update-dialog"
              data-form-dialog-body
              onSubmit={(event) => {
                event.preventDefault();
                void installUpdate();
              }}
            >
              <div className="confirm-update-icon" aria-hidden="true">
                <Download size={22} />
              </div>
              <p>
                {it.updateConfirm.replace(
                  "{version}",
                  updateInfo.latestVersion,
                )}
              </p>
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUpdateConfirmationOpen(false)}
                >
                  {it.cancel}
                </Button>
                <Button type="submit">
                  <Download size={17} />
                  {it.updateNow}
                </Button>
              </div>
            </form>
          </FormDialog>
        )}
      </section>
      <section className="panel padded settings-card">
        <h2>{it.quickService.title}</h2>
        <p>{it.quickService.description}</p>
        <QuickServiceManager items={quickServices} />
      </section>
      <section className="panel padded settings-card">
        <h2>{it.modelCatalog.title}</h2>
        <p>{it.modelCatalog.description}</p>
        <DeviceModelManager items={savedModels} />
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
