import type { TunnelView } from "../api/tunnelbox-api";

const STATUS_STYLES = {
  stopped: { label: "Stopped", dot: "bg-zinc-500", text: "text-zinc-400" },
  connecting: {
    label: "Connecting",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-300",
  },
  connected: {
    label: "Connected",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
  },
  retrying: {
    label: "Reconnecting",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-300",
  },
  error: { label: "Error", dot: "bg-red-500", text: "text-red-300" },
} as const;

export function StatusBadge({ tunnel }: { tunnel: TunnelView }) {
  if (!tunnel.provisioned) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-300">
        <span className="h-2 w-2 rounded-full bg-sky-400" />
        Needs VPS setup
      </span>
    );
  }

  const style = STATUS_STYLES[tunnel.status.state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
      {tunnel.status.state === "retrying" &&
        ` (attempt ${tunnel.status.retryAttempt})`}
    </span>
  );
}
