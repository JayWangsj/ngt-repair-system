const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const token = process.env.GITHUB_TOKEN;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const outputPath = "release-metrics.json";

const safeDate = (value) => (value ? Date.parse(value) : null);
const round = (value) => Math.round(value * 10) / 10;

async function writeSummary(metrics) {
  const lines = [
    "# Windows Studio Release metrics",
    "",
    "- Tag: " + (metrics.tag || "unknown"),
    "- Commit: " + (metrics.commit || "unknown"),
    "- Run: " + (runId || "unknown"),
    "- Runner elapsed time: " + metrics.runnerMinutes + " minutes",
    "- Critical path: " + metrics.criticalPathMinutes + " minutes",
    "- End-to-end elapsed time: " + metrics.endToEndMinutes + " minutes",
    "",
    "| Job | Result | Queue minutes | Runner minutes |",
    "| --- | --- | ---: | ---: |",
    ...metrics.jobs.map(
      (job) =>
        "| " +
        job.name +
        " | " +
        job.conclusion +
        " | " +
        (job.queueMinutes ?? "n/a") +
        " | " +
        (job.runnerMinutes ?? "n/a") +
        " |",
    ),
    "",
    metrics.metricsAvailable
      ? "Times use GitHub job timestamps; runner elapsed time is not billing-rounded."
      : "GitHub job metrics were unavailable: " + metrics.error,
  ];
  if (summaryPath) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(summaryPath, lines.join("\n") + "\n", "utf8");
  }
}

async function main() {
  let metrics;
  try {
    const response = await fetch(
      "https://api.github.com/repos/" +
        repository +
        "/actions/runs/" +
        runId +
        "/jobs?per_page=100",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new Error(
        "GitHub Actions jobs API returned HTTP " + response.status + ".",
      );
    const payload = await response.json();
    const jobs = (payload.jobs || []).filter(
      (job) => job.name !== "Record Release run metrics",
    );
    const entries = jobs.map((job) => {
      const started = safeDate(job.started_at);
      const completed = safeDate(job.completed_at);
      const created = safeDate(job.created_at);
      return {
        name: job.name,
        conclusion: job.conclusion || job.status,
        queueMinutes:
          started !== null && created !== null
            ? round((started - created) / 60000)
            : null,
        runnerMinutes:
          started !== null && completed !== null
            ? round((completed - started) / 60000)
            : null,
        started,
        completed,
        created,
      };
    });
    const timed = entries.filter(
      (job) => job.started !== null && job.completed !== null,
    );
    const createdTimes = entries
      .map((job) => job.created)
      .filter(Number.isFinite);
    const firstCreated = createdTimes.length ? Math.min(...createdTimes) : null;
    const firstStarted = timed.length
      ? Math.min(...timed.map((job) => job.started))
      : null;
    const lastCompleted = timed.length
      ? Math.max(...timed.map((job) => job.completed))
      : null;
    const runnerMinutes = round(
      timed.reduce((total, job) => total + (job.completed - job.started), 0) /
        60000,
    );
    metrics = {
      metricsAvailable: true,
      tag: process.env.GITHUB_REF_NAME,
      commit: process.env.GITHUB_SHA,
      runnerMinutes,
      criticalPathMinutes:
        firstStarted !== null && lastCompleted !== null
          ? round((lastCompleted - firstStarted) / 60000)
          : 0,
      endToEndMinutes:
        firstCreated !== null && lastCompleted !== null
          ? round((lastCompleted - firstCreated) / 60000)
          : 0,
      jobs: entries.map(
        ({ name, conclusion, queueMinutes, runnerMinutes: jobMinutes }) => ({
          name,
          conclusion,
          queueMinutes,
          runnerMinutes: jobMinutes,
        }),
      ),
    };
  } catch (error) {
    metrics = {
      metricsAvailable: false,
      error: error.message.replace(/https?:\/\/[^\s]+/g, "[URL]"),
      tag: process.env.GITHUB_REF_NAME,
      commit: process.env.GITHUB_SHA,
      runnerMinutes: "n/a",
      criticalPathMinutes: "n/a",
      endToEndMinutes: "n/a",
      jobs: [],
    };
    console.warn(
      "::warning::Release metrics could not be read; publication result is unchanged.",
    );
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outputPath, JSON.stringify(metrics, null, 2) + "\n", "utf8");
  await writeSummary(metrics);
}

main().catch((error) => {
  console.error("Release metrics report failed: " + error.message);
  process.exitCode = 1;
});
