"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useMessages } from "./language";
import { Button } from "./ui/button";
import { FormDialog } from "./forms";
import {
  readAutoUpdateCheck,
  writeAutoUpdateCheck,
} from "@/lib/update-preference";

type UpdateStatus = {
  status?: string;
  stage?: string;
  message?: string;
  latestVersion?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  progressKnown?: boolean;
};

type UpdateInfo = {
  installed: boolean;
  currentVersion: string;
  authRequired: boolean;
  updateAvailable: boolean;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadSize?: number;
  status?: UpdateStatus;
};

type GitHubAuth = {
  status: "opening" | "waiting";
  verificationUrl?: string;
  userCode?: string;
};

function formatBytes(value?: number) {
  if (!value || value < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

export function SystemUpdate({ currentVersion }: { currentVersion: string }) {
  const it = useMessages();
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ status: "idle" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [githubAuth, setGitHubAuth] = useState<GitHubAuth | null>(null);
  const [autoCheck, setAutoCheck] = useState(true);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAutoCheck(readAutoUpdateCheck());
    });
    void checkForUpdates(false);
    // The initial check intentionally runs once when this page opens.
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkForUpdates(showResult = true) {
    setPending(true);
    setError("");
    if (showResult) setMessage("");
    try {
      const response = await fetch("/api/system-update", { cache: "no-store" });
      const result = (await response.json()) as Partial<UpdateInfo> & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || it.updateCheckFailed);
      const next: UpdateInfo = {
        installed: Boolean(result.installed),
        currentVersion: result.currentVersion || currentVersion,
        authRequired: Boolean(result.authRequired),
        updateAvailable: Boolean(result.updateAvailable),
        latestVersion: result.latestVersion,
        releaseName: result.releaseName,
        releaseNotes: result.releaseNotes,
        publishedAt: result.publishedAt,
        downloadSize: result.downloadSize,
        status: result.status,
      };
      setInfo(next);
      if (next.status) setStatus(next.status);
      if (!next.installed) setMessage(it.updateInstalledOnly);
      else if (next.authRequired) setMessage(it.updateAuthRequired);
      else if (next.updateAvailable)
        setMessage(
          it.updateAvailable.replace(
            "{version}",
            next.latestVersion || currentVersion,
          ),
        );
      else setMessage(it.updateCurrent);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : it.updateCheckFailed);
    } finally {
      setPending(false);
    }
  }

  async function beginGitHubLogin() {
    if (info?.installed && !info.authRequired) {
      setGitHubAuth(null);
      setError("");
      setMessage(it.updateLoginSuccess);
      return;
    }
    setPending(true);
    setError("");
    setMessage(it.updateLoginOpening);
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
      setMessage("");
      setError(cause instanceof Error ? cause.message : it.updateLoginFailed);
      setPending(false);
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
          setInfo((current) =>
            current ? { ...current, authRequired: false } : current,
          );
          setMessage(it.updateLoginSuccess);
          setPending(false);
          return;
        }
        if (result.status === "failed") {
          setGitHubAuth({
            status: "waiting",
            verificationUrl: result.verificationUrl,
            userCode: result.userCode,
          });
          setMessage("");
          setError(
            result.message
              ? `${it.updateLoginFailed} ${result.message}`
              : it.updateLoginFailed,
          );
          setPending(false);
          return;
        }
        const authStatus = result.status === "waiting" ? "waiting" : "opening";
        setGitHubAuth({
          status: authStatus,
          verificationUrl: result.verificationUrl,
          userCode: result.userCode,
        });
        setMessage(
          authStatus === "waiting"
            ? it.updateLoginWaiting
            : it.updateLoginOpening,
        );
      } catch (cause) {
        setMessage("");
        setError(cause instanceof Error ? cause.message : it.updateLoginFailed);
        setPending(false);
        return;
      }
    }
    setMessage("");
    setError(it.updateLoginTimeout);
    setPending(false);
  }

  async function copyGitHubAuth(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(it.updateLoginCopied);
      setError("");
    } catch {
      setError(it.updateLoginCopyFailed);
    }
  }

  async function startUpdate() {
    setConfirmationOpen(false);
    setPending(true);
    setError("");
    setMessage(it.updateStarting);
    try {
      const response = await fetch("/api/system-update", { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || it.updateFailed);
      setStatus({ status: "queued", stage: "checking" });
      await monitorUpdate();
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : it.updateFailed);
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
        const result = (await response.json()) as UpdateStatus;
        setStatus(result);
        setMessage("");
        if (result.status === "failed") {
          setPending(false);
          setError(result.message || it.updateFailed);
          return;
        }
        if (result.status === "complete") {
          setPending(false);
          setError("");
          setMessage(it.updateSuccess);
          setInfo((current) =>
            current
              ? {
                  ...current,
                  currentVersion:
                    result.latestVersion?.replace(/^v/i, "") ||
                    current.latestVersion ||
                    current.currentVersion,
                  updateAvailable: false,
                }
              : current,
          );
          return;
        }
      } catch {
        // The local server can be briefly unavailable while versions switch.
      }
    }
    setPending(false);
    setError(it.updateTimeout);
  }

  function changeAutoCheck(enabled: boolean) {
    writeAutoUpdateCheck(enabled);
    setAutoCheck(enabled);
  }

  const updateActive =
    pending &&
    [
      "queued",
      "checking",
      "downloading",
      "downloaded",
      "verifying",
      "backing-up",
      "installing",
      "validating",
    ].includes(status.status || "");
  const downloaded = status.bytesDownloaded || 0;
  const total = status.totalBytes || info?.downloadSize || 0;
  const progressKnown = status.progressKnown === true && total > 0;
  const percentage = progressKnown
    ? Math.min(100, Math.round((downloaded / total) * 100))
    : 0;
  const stages = [
    ["downloaded", it.updateStageDownloaded],
    ["verifying", it.updateStageVerifying],
    ["backing-up", it.updateStageBackup],
    ["installing", it.updateStageInstalling],
    ["validating", it.updateStageValidating],
    ["complete", it.updateStageComplete],
  ];
  const stageOrder = [
    "checking",
    "downloading",
    "downloaded",
    "verifying",
    "backing-up",
    "installing",
    "validating",
    "complete",
  ];
  const currentStage =
    status.status === "failed" ? status.stage : status.status;
  const currentIndex = stageOrder.indexOf(currentStage || "");

  return (
    <div className="system-update-page">
      {!info?.updateAvailable &&
        !updateActive &&
        status.status !== "failed" &&
        status.status !== "complete" && (
          <section className="panel padded update-overview">
            <div className="update-version-block">
              <span>{it.currentVersion}</span>
              <strong>v{info?.currentVersion || currentVersion}</strong>
              {!info?.authRequired && info && <small>{it.updateCurrent}</small>}
            </div>
            <div className="update-primary-actions">
              <Button
                type="button"
                disabled={pending}
                onClick={() => void checkForUpdates()}
              >
                <RefreshCw size={17} className={pending ? "spin" : undefined} />
                {pending ? it.checkingUpdates : it.checkForUpdates}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void beginGitHubLogin()}
              >
                <GitBranch size={18} />
                {it.authorizeGitHub}
              </Button>
            </div>
          </section>
        )}

      <div className="system-update-feedback" aria-live="polite">
        {message && (
          <p className="message success" role="status">
            {message}
          </p>
        )}
        {error && (
          <div className="message error update-error" role="alert">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void (status.status === "failed"
                  ? startUpdate()
                  : checkForUpdates())
              }
            >
              {status.status === "failed" ? it.retryUpdate : it.retry}
            </Button>
          </div>
        )}
        {githubAuth?.verificationUrl && (
          <div className="github-auth-fallback panel padded">
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

      {info?.updateAvailable &&
        !updateActive &&
        status.status !== "complete" && (
          <section className="panel padded update-release-card">
            <div className="update-release-heading">
              <div>
                <span>{it.updateAvailableLabel}</span>
                <strong>v{info.latestVersion}</strong>
                {info.publishedAt && (
                  <small>
                    {it.updatePublishedAt}:{" "}
                    {new Date(info.publishedAt).toLocaleDateString()}
                  </small>
                )}
              </div>
              <Button type="button" onClick={() => setConfirmationOpen(true)}>
                <Download size={17} />
                {it.updateNow}
              </Button>
            </div>
            <div className="update-release-notes">
              <strong>{it.updateReleaseNotes}</strong>
              <p>
                {info.releaseNotes ||
                  info.releaseName ||
                  it.updateNoReleaseNotes}
              </p>
            </div>
          </section>
        )}

      {(updateActive ||
        status.status === "failed" ||
        status.status === "complete") && (
        <section className="panel padded update-progress-card">
          {status.status === "downloading" && (
            <div className="download-progress">
              <div className="download-progress-heading">
                <strong>{it.updateDownloading}</strong>
                <span>
                  {progressKnown ? `${percentage}%` : it.updateCalculating}
                </span>
              </div>
              <div
                className={`update-progress-track${progressKnown ? "" : " indeterminate"}`}
                role="progressbar"
                aria-label={it.updateDownloading}
                aria-valuemin={progressKnown ? 0 : undefined}
                aria-valuemax={progressKnown ? 100 : undefined}
                aria-valuenow={progressKnown ? percentage : undefined}
              >
                {progressKnown && <span style={{ width: `${percentage}%` }} />}
              </div>
              <div className="download-progress-meta">
                <span>
                  {formatBytes(downloaded)} / {formatBytes(total)}
                </span>
                {Boolean(status.bytesPerSecond) && (
                  <span>
                    {it.updateSpeed}: {formatBytes(status.bytesPerSecond)}/s
                  </span>
                )}
                {Boolean(status.etaSeconds) && (
                  <span>
                    {it.updateEta}: {status.etaSeconds}s
                  </span>
                )}
              </div>
            </div>
          )}
          <ol className="update-stage-list">
            {stages.map(([stage, label]) => {
              const index = stageOrder.indexOf(stage);
              const complete =
                status.status === "complete" ||
                currentIndex > index ||
                (stage === "downloaded" && currentStage === "downloaded");
              const active =
                currentStage === stage ||
                (stage === "downloaded" &&
                  ["checking", "downloading"].includes(currentStage || ""));
              const failed =
                status.status === "failed" && currentStage === stage;
              return (
                <li
                  key={stage}
                  className={
                    failed
                      ? "failed"
                      : complete
                        ? "complete"
                        : active
                          ? "active"
                          : ""
                  }
                >
                  {failed ? (
                    <XCircle />
                  ) : complete ? (
                    <CheckCircle2 />
                  ) : active ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <Circle />
                  )}
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
          {status.status === "complete" && (
            <div className="update-complete">
              <Check size={28} />
              <strong>{it.updateSuccess}</strong>
            </div>
          )}
        </section>
      )}

      <section className="panel padded settings-card update-preferences">
        <div className="settings-card-title">
          <h2>{it.updateSettings}</h2>
        </div>
        <div className="settings-action">
          <div>
            <strong>{it.autoCheckUpdates}</strong>
            <p>{it.autoCheckUpdatesHelp}</p>
          </div>
          <button
            type="button"
            className="motion-switch"
            role="switch"
            aria-checked={autoCheck}
            aria-label={it.autoCheckUpdates}
            onClick={() => changeAutoCheck(!autoCheck)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </section>

      {confirmationOpen && info?.latestVersion && (
        <FormDialog
          title={it.updateConfirmTitle}
          onClose={() => setConfirmationOpen(false)}
        >
          <form
            className="dialog-form confirm-update-dialog"
            data-form-dialog-body
            onSubmit={(event) => {
              event.preventDefault();
              void startUpdate();
            }}
          >
            <div className="confirm-update-icon" aria-hidden="true">
              <Download size={22} />
            </div>
            <p>{it.updateConfirm.replace("{version}", info.latestVersion)}</p>
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmationOpen(false)}
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
    </div>
  );
}
