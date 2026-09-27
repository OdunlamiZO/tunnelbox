import { useEffect, useRef } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useJob } from "../hooks/use-job";
import { CopyButton } from "./CopyButton";
import { Modal } from "./Modal";
import { PRIMARY_BUTTON_CLASS } from "./form-controls";

type Props = {
  jobId: string;
  title: string;
  onClose: () => void;
};

export function JobDialog({ jobId, title, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data: job } = useJob(jobId);
  const logReference = useRef<HTMLPreElement>(null);

  const isRunning = !job || job.state === "running";

  useEffect(() => {
    logReference.current?.scrollTo({ top: logReference.current.scrollHeight });
  }, [job?.logLines.length]);

  useEffect(() => {
    if (!isRunning) {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    }
  }, [isRunning, queryClient]);

  return (
    <Modal title={title} onClose={isRunning ? () => undefined : onClose} wide>
      <div className="mb-3 text-sm">
        {isRunning && (
          <span className="text-amber-300">Working on the VPS…</span>
        )}
        {job?.state === "succeeded" && (
          <span className="text-emerald-300">Done.</span>
        )}
        {job?.state === "failed" && (
          <span className="text-red-300">Failed: {job.error}</span>
        )}
      </div>

      <div className="relative mb-5">
        <pre
          ref={logReference}
          className="h-72 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 pr-10 font-mono text-xs leading-5 text-zinc-300"
        >
          {job?.logLines.join("\n") || "Starting…"}
        </pre>
        {job && job.logLines.length > 0 && (
          <div className="absolute right-2 top-2">
            <CopyButton value={job.logLines.join("\n")} label="log" />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isRunning}
          className={PRIMARY_BUTTON_CLASS}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
