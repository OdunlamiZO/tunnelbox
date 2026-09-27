import type { RequestLogEntry } from "../api/tunnelbox-api";

function statusClass(status: number | null): string {
  if (status === null || status >= 500) return "text-red-300";
  if (status >= 400) return "text-amber-300";
  if (status >= 300) return "text-sky-300";
  if (status >= 200) return "text-emerald-300";

  return "text-zinc-400";
}

function formatTime(time: string): string {
  return new Date(time).toLocaleTimeString("en-GB", { hour12: false });
}

function summary(entry: RequestLogEntry): string {
  return `${entry.method} ${entry.path} ${entry.status ?? "—"} · ${entry.durationMilliseconds} ms`;
}

export function RequestLog({ requests }: { requests: RequestLogEntry[] }) {
  const newestFirst = [...requests].reverse();
  const latest = newestFirst[0];

  return (
    <details className="group mt-4 border-t border-zinc-800 pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300">
        <span className="transition-transform group-open:rotate-90">▸</span>
        <span className="font-medium text-zinc-400">Requests</span>
        {requests.length > 0 && (
          <span className="rounded bg-zinc-800 px-1.5 text-[10px] text-zinc-400">
            {requests.length}
          </span>
        )}
        <span
          className="truncate font-mono"
          title={latest ? summary(latest) : undefined}
        >
          {latest ? summary(latest) : "No requests yet"}
        </span>
      </summary>

      <div className="mt-3 max-h-64 overflow-auto rounded-lg bg-zinc-950 font-mono text-xs">
        {newestFirst.length === 0 ? (
          <p className="p-3 text-zinc-500">
            Requests to the public URL appear here while the tunnel is on.
          </p>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[4.75rem]" />
              <col className="w-14" />
              <col />
              <col className="w-11" />
              <col className="w-16" />
              <col className="w-28" />
            </colgroup>
            <tbody>
              {newestFirst.map((entry, index) => (
                <tr
                  key={`${entry.time}-${index}`}
                  className="border-b border-zinc-900 last:border-0"
                  title={entry.error ?? undefined}
                >
                  <td className="whitespace-nowrap py-1.5 pl-3 pr-2 text-zinc-500">
                    {formatTime(entry.time)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-zinc-300">
                    {entry.method}
                  </td>
                  <td
                    className="truncate py-1.5 pr-2 text-zinc-200"
                    title={entry.path}
                  >
                    {entry.path}
                    {entry.error && (
                      <span className="ml-2 text-red-300">{entry.error}</span>
                    )}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right ${statusClass(entry.status)}`}
                  >
                    {entry.status ?? "—"}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right text-zinc-500">
                    {entry.durationMilliseconds} ms
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right text-zinc-600">
                    {entry.clientAddress ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
