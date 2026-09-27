import { randomUUID } from "node:crypto";

import type { Job, JobKind } from "./types";

const MAXIMUM_KEPT_JOBS = 50;

const MAXIMUM_LOG_LINES = 500;

export class JobRunner {
  private readonly jobs = new Map<string, Job>();

  start(
    kind: JobKind,
    tunnelId: string | null,
    work: (log: (line: string) => void) => Promise<void>
  ): Job {
    const job: Job = {
      id: randomUUID(),
      kind,
      tunnelId,
      state: "running",
      logLines: [],
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };

    this.jobs.set(job.id, job);
    this.forgetOldJobs();

    const log = (line: string) => {
      job.logLines.push(line);

      if (job.logLines.length > MAXIMUM_LOG_LINES) {
        job.logLines.shift();
      }
    };

    work(log)
      .then(() => {
        job.state = "succeeded";
      })
      .catch((error: unknown) => {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        log(`Error: ${job.error}`);
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
      });

    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  runningJobForTunnel(tunnelId: string): Job | undefined {
    return [...this.jobs.values()].find(
      (job) => job.tunnelId === tunnelId && job.state === "running"
    );
  }

  private forgetOldJobs() {
    while (this.jobs.size > MAXIMUM_KEPT_JOBS) {
      const oldestId = this.jobs.keys().next().value;

      if (oldestId === undefined) {
        return;
      }

      this.jobs.delete(oldestId);
    }
  }
}
