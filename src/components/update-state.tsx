"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  classifyUpdateCheck,
  classifyUpdateTask,
  isUpdateTaskMonitorable,
  type UpdateCheckPhase,
  type UpdateInfo,
  type UpdateStatus,
  type UpdateTaskPhase,
} from "@/lib/system-update-state";
import {
  readAutoUpdateCheck,
  UPDATE_CHECKED_SESSION_KEY,
} from "@/lib/update-preference";

type CheckState = {
  phase: UpdateCheckPhase;
  error?: string;
  lastCheckedAt?: string;
  lastSuccessfulCheckAt?: string;
};

type TaskState = {
  phase: UpdateTaskPhase;
  status?: UpdateStatus;
  lastTrustedStatus?: UpdateStatus;
  message?: string;
};

type UpdateStateValue = {
  currentVersion: string;
  info: UpdateInfo | null;
  check: CheckState;
  task: TaskState;
  ensureChecked: () => Promise<boolean>;
  checkForUpdates: () => Promise<boolean>;
  refreshTask: () => Promise<TaskState>;
  startUpdate: (targetVersion: string) => Promise<void>;
};

const UpdateContext = createContext<UpdateStateValue | null>(null);

function toUpdateInfo(
  value: Partial<UpdateInfo> & { currentVersion?: string },
): UpdateInfo {
  return {
    installed: Boolean(value.installed),
    currentVersion: value.currentVersion || "",
    authRequired: Boolean(value.authRequired),
    updateAvailable: Boolean(value.updateAvailable),
    notInstallable: Boolean(value.notInstallable),
    latestVersion: value.latestVersion,
    releaseName: value.releaseName,
    releaseNotes: value.releaseNotes,
    publishedAt: value.publishedAt,
    downloadSize: value.downloadSize,
  };
}

function taskFromStatus(status: UpdateStatus): TaskState {
  const safeStatus = {
    ...status,
    message: status.message ? redactDiagnostic(status.message) : undefined,
    recoveryMessage: status.recoveryMessage
      ? redactDiagnostic(status.recoveryMessage)
      : undefined,
  };
  const phase = classifyUpdateTask(safeStatus);
  return {
    phase,
    status: safeStatus,
    lastTrustedStatus:
      safeStatus.executorAlive === true ||
      ["complete", "failed", "interrupted"].includes(safeStatus.status || "")
        ? safeStatus
        : undefined,
    message: safeStatus.message,
  };
}

function redactDiagnostic(value: string) {
  return value
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]")
    .replace(/(token\s*[:=]\s*)\S+/gi, "$1[redacted]");
}

export function UpdateStateProvider({
  initialVersion,
  children,
}: {
  initialVersion: string;
  children: ReactNode;
}) {
  const [currentVersion, setCurrentVersion] = useState(initialVersion);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [check, setCheck] = useState<CheckState>({ phase: "not-checked" });
  const [task, setTask] = useState<TaskState>({ phase: "idle" });
  const checkPromise = useRef<Promise<boolean> | null>(null);
  const requestId = useRef(0);
  const lastSuccessfulCheck = useRef(0);
  const monitorId = useRef(0);
  const monitorTimer = useRef<number | null>(null);

  const checkForUpdates = useCallback(() => {
    if (checkPromise.current) return checkPromise.current;
    const id = ++requestId.current;
    setCheck((current) => ({
      ...current,
      phase: "checking",
      error: undefined,
    }));
    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch("/api/system-update", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as Partial<UpdateInfo> & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || "update_check_failed");
        const next = toUpdateInfo(result);
        const checkedAt = new Date().toISOString();
        if (id === requestId.current) {
          setInfo((previous) =>
            next.authRequired && previous?.updateAvailable
              ? {
                  ...previous,
                  currentVersion: next.currentVersion,
                  authRequired: true,
                }
              : next,
          );
          setCurrentVersion(next.currentVersion || initialVersion);
          lastSuccessfulCheck.current = Date.now();
          setCheck({
            phase: classifyUpdateCheck(next),
            lastCheckedAt: checkedAt,
            lastSuccessfulCheckAt: checkedAt,
          });
        }
        return true;
      } catch (cause) {
        if (id === requestId.current) {
          setCheck((current) => ({
            ...current,
            phase: "failed",
            lastCheckedAt: new Date().toISOString(),
            error: redactDiagnostic(
              cause instanceof Error && cause.name !== "AbortError"
                ? cause.message
                : "update_check_timeout",
            ),
          }));
        }
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (id === requestId.current) checkPromise.current = null;
      }
    })();
    checkPromise.current = request;
    return request;
  }, [initialVersion]);

  const ensureChecked = useCallback(() => {
    if (checkPromise.current) return checkPromise.current;
    if (
      lastSuccessfulCheck.current &&
      Date.now() - lastSuccessfulCheck.current < 5 * 60_000
    )
      return Promise.resolve(true);
    return checkForUpdates();
  }, [checkForUpdates]);

  const stopMonitoring = useCallback(() => {
    monitorId.current += 1;
    if (monitorTimer.current !== null) {
      window.clearTimeout(monitorTimer.current);
      monitorTimer.current = null;
    }
  }, []);

  const startMonitoring = useCallback(() => {
    stopMonitoring();
    const id = monitorId.current;
    let failures = 0;
    let attempts = 0;
    const poll = async () => {
      if (id !== monitorId.current) return;
      attempts += 1;
      try {
        const response = await fetch("/api/system-update/status", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("status_unavailable");
        const status = (await response.json()) as UpdateStatus;
        failures = 0;
        const next = taskFromStatus(status);
        setTask((previous) => ({
          ...next,
          lastTrustedStatus:
            next.lastTrustedStatus || previous.lastTrustedStatus,
        }));
        if (status.currentVersion) setCurrentVersion(status.currentVersion);
        if (next.phase === "succeeded" && status.targetVersion) {
          const actualVersion = status.actualVersion || status.currentVersion;
          if (
            actualVersion?.replace(/^v/i, "") ===
            status.targetVersion.replace(/^v/i, "")
          ) {
            setInfo((current) => {
              if (
                !current ||
                current.latestVersion?.replace(/^v/i, "") !==
                  status.targetVersion?.replace(/^v/i, "")
              )
                return current;
              return {
                ...current,
                updateAvailable: false,
                notInstallable: false,
              };
            });
          }
        }
        if (
          [
            "succeeded",
            "failed",
            "rollback-succeeded",
            "rollback-failed",
          ].includes(next.phase)
        )
          void checkForUpdates();
        if (!isUpdateTaskMonitorable(next.phase)) return;
      } catch {
        failures += 1;
        setTask((previous) => ({
          ...previous,
          phase: previous.lastTrustedStatus ? "reconnecting" : "verifying",
          message: "update_status_reconnecting",
        }));
        if (failures >= 30) {
          setTask((previous) => ({
            ...previous,
            phase: "verifying",
            message: "update_status_needs_verification",
          }));
          return;
        }
      }
      if (attempts >= 120) {
        setTask((previous) => ({
          ...previous,
          phase: "verifying",
          message: "update_status_needs_verification",
        }));
        return;
      }
      monitorTimer.current = window.setTimeout(() => void poll(), 2_000);
    };
    monitorTimer.current = window.setTimeout(() => void poll(), 1_000);
  }, [checkForUpdates, stopMonitoring]);

  const refreshTask = useCallback(async () => {
    try {
      const response = await fetch("/api/system-update/status", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("status_unavailable");
      const status = (await response.json()) as UpdateStatus;
      const next = taskFromStatus(status);
      setTask(next);
      if (status.currentVersion) setCurrentVersion(status.currentVersion);
      if (
        next.phase === "succeeded" &&
        status.targetVersion &&
        (status.actualVersion || status.currentVersion)?.replace(/^v/i, "") ===
          status.targetVersion.replace(/^v/i, "")
      ) {
        setInfo((current) => {
          if (
            !current ||
            current.latestVersion?.replace(/^v/i, "") !==
              status.targetVersion?.replace(/^v/i, "")
          )
            return current;
          return { ...current, updateAvailable: false, notInstallable: false };
        });
        void checkForUpdates();
      }
      if (isUpdateTaskMonitorable(next.phase)) startMonitoring();
      return next;
    } catch {
      const next: TaskState = {
        phase: "verifying",
        message: "update_status_needs_verification",
      };
      setTask(next);
      return next;
    }
  }, [startMonitoring]);

  const startUpdate = useCallback(
    async (targetVersion: string) => {
      setTask({ phase: "starting", message: "update_task_starting" });
      try {
        const response = await fetch("/api/system-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetVersion }),
        });
        const result = (await response.json()) as UpdateStatus & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || "update_start_failed");
        const next = taskFromStatus(result);
        setTask(next);
        startMonitoring();
      } catch (cause) {
        const error =
          cause instanceof Error ? cause.message : "update_start_failed";
        if (error === "studio_update_in_progress") await refreshTask();
        else setTask({ phase: "idle" });
        throw cause;
      }
    },
    [refreshTask, startMonitoring],
  );

  useEffect(() => {
    void refreshTask();
    if (
      readAutoUpdateCheck() &&
      window.sessionStorage.getItem(UPDATE_CHECKED_SESSION_KEY) !== "true"
    ) {
      void checkForUpdates().then((success) => {
        if (success)
          window.sessionStorage.setItem(UPDATE_CHECKED_SESSION_KEY, "true");
      });
    }
    return stopMonitoring;
  }, [checkForUpdates, refreshTask, stopMonitoring]);

  const value = useMemo<UpdateStateValue>(
    () => ({
      currentVersion,
      info,
      check,
      task,
      ensureChecked,
      checkForUpdates,
      refreshTask,
      startUpdate,
    }),
    [
      currentVersion,
      info,
      check,
      task,
      ensureChecked,
      checkForUpdates,
      refreshTask,
      startUpdate,
    ],
  );

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
}

export function useUpdateState() {
  const value = useContext(UpdateContext);
  if (!value)
    throw new Error("useUpdateState must be used inside UpdateStateProvider");
  return value;
}
