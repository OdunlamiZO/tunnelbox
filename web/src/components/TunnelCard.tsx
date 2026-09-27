import type { Job, TunnelView } from "../api/tunnelbox-api";
import {
  useProvisionTunnel,
  useStartTunnel,
  useStopTunnel,
} from "../hooks/use-tunnel-actions";
import { CopyButton } from "./CopyButton";
import { RequestLog } from "./RequestLog";
import { StatusBadge } from "./StatusBadge";
import { SECONDARY_BUTTON_CLASS, errorMessage } from "./form-controls";

type Props = {
  tunnel: TunnelView;
  onEdit: () => void;
  onDelete: () => void;
  onJobStarted: (job: Job, title: string) => void;
};

export function TunnelCard({ tunnel, onEdit, onDelete, onJobStarted }: Props) {
  const startTunnel = useStartTunnel();
  const stopTunnel = useStopTunnel();
  const provisionTunnel = useProvisionTunnel();

  const isOn = ["connecting", "connected", "retrying"].includes(
    tunnel.status.state
  );
  const actionError =
    startTunnel.error ?? stopTunnel.error ?? provisionTunnel.error;

  const latestActivity = tunnel.status.logLines.at(-1);

  function toggle() {
    if (isOn) {
      stopTunnel.mutate(tunnel.id);
    } else {
      startTunnel.mutate(tunnel.id);
    }
  }

  function finishSetup() {
    provisionTunnel.mutate(tunnel.id, {
      onSuccess: (job) => onJobStarted(job, `Setting up ${tunnel.domain}`),
    });
  }

  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="truncate font-semibold">{tunnel.name}</h3>
            <StatusBadge tunnel={tunnel} />
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-zinc-400">
            <a
              href={`https://${tunnel.domain}`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-zinc-200 hover:text-emerald-300 hover:underline"
            >
              https://{tunnel.domain}
            </a>
            <CopyButton value={`https://${tunnel.domain}`} label="public URL" />
            <span className="mx-1 text-zinc-600">→</span>
            <span>localhost:{tunnel.localPort}</span>
            <CopyButton
              value={`localhost:${tunnel.localPort}`}
              label="local address"
            />
          </div>
          {tunnel.status.lastError && tunnel.status.state !== "connected" && (
            <p className="mt-1 text-xs text-red-300">
              {tunnel.status.lastError}
            </p>
          )}
        </div>

        {tunnel.provisioned ? (
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={isOn ? `Stop ${tunnel.name}` : `Start ${tunnel.name}`}
            onClick={toggle}
            disabled={startTunnel.isPending || stopTunnel.isPending}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              isOn ? "bg-emerald-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                isOn ? "left-6" : "left-1"
              }`}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={finishSetup}
            disabled={provisionTunnel.isPending}
            className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:opacity-50"
          >
            Finish VPS setup
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          className={SECONDARY_BUTTON_CLASS}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-red-300 hover:border-red-400"
        >
          Delete
        </button>
      </div>

      {actionError && (
        <p className="mt-3 text-sm text-red-300">{errorMessage(actionError)}</p>
      )}

      <RequestLog requests={tunnel.status.requests} />

      <details className="group mt-4 border-t border-zinc-800 pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300">
          <span className="transition-transform group-open:rotate-90">▸</span>
          <span className="font-medium text-zinc-400">Activity</span>
          <span className="truncate font-mono">
            {latestActivity ?? "No activity yet"}
          </span>
        </summary>

        <div className="relative mt-3">
          <pre className="max-h-56 overflow-auto rounded-lg bg-zinc-950 p-3 pr-10 font-mono text-xs leading-5 text-zinc-400">
            {tunnel.status.logLines.join("\n") || "No activity yet."}
          </pre>
          {tunnel.status.logLines.length > 0 && (
            <div className="absolute right-2 top-2">
              <CopyButton
                value={tunnel.status.logLines.join("\n")}
                label="activity log"
              />
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
