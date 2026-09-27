import { useState } from "react";

import type { Job, TunnelView } from "../api/tunnelbox-api";
import { useDeleteTunnel } from "../hooks/use-delete-tunnel";
import { useSettings } from "../hooks/use-settings";
import { useTunnels } from "../hooks/use-tunnels";
import { JobDialog } from "./JobDialog";
import { Modal } from "./Modal";
import { SettingsDialog } from "./SettingsDialog";
import { ThemeToggle } from "./ThemeToggle";
import { TunnelCard } from "./TunnelCard";
import { TunnelFormDialog } from "./TunnelFormDialog";
import {
  DANGER_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  errorMessage,
} from "./form-controls";

type FormTarget = { tunnel: TunnelView | null };

type ActiveJob = { id: string; title: string };

export function App() {
  const { data: tunnels = [], isLoading, isError, error } = useTunnels();
  const { data: settings } = useSettings();
  const deleteTunnel = useDeleteTunnel();

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TunnelView | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);

  const needsSettings = settings === null;
  const connectedCount = tunnels.filter(
    (tunnel) => tunnel.status.state === "connected"
  ).length;

  function showJob(job: Job, title: string) {
    setActiveJob({ id: job.id, title });
  }

  function confirmDelete() {
    if (!deleteTarget) return;

    const target = deleteTarget;

    deleteTunnel.mutate(target.id, {
      onSuccess: ({ job }) => {
        setDeleteTarget(null);

        if (job) {
          showJob(job, `Removing ${target.domain}`);
        }
      },
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">tunnelbox</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {settings ? `VPS ${settings.host}` : "No VPS configured"} ·{" "}
            {connectedCount} of {tunnels.length} connected
          </p>
        </div>

        <div className="flex gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className={SECONDARY_BUTTON_CLASS}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setFormTarget({ tunnel: null })}
            disabled={needsSettings}
            className={PRIMARY_BUTTON_CLASS}
          >
            Add tunnel
          </button>
        </div>
      </header>

      {needsSettings && (
        <div className="mb-6 rounded-2xl border border-sky-900 bg-sky-950/40 p-5 text-sm text-sky-200">
          Start by adding your VPS in{" "}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="font-semibold underline"
          >
            Settings
          </button>
          .
        </div>
      )}

      {isError && <p className="text-sm text-red-300">{errorMessage(error)}</p>}

      {!isLoading && tunnels.length === 0 && !needsSettings && (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          No tunnels yet. Add one to expose a local port on a public HTTPS URL.
        </div>
      )}

      <ul className="space-y-4">
        {tunnels.map((tunnel) => (
          <TunnelCard
            key={tunnel.id}
            tunnel={tunnel}
            onEdit={() => setFormTarget({ tunnel })}
            onDelete={() => setDeleteTarget(tunnel)}
            onJobStarted={showJob}
          />
        ))}
      </ul>

      {formTarget && (
        <TunnelFormDialog
          tunnel={formTarget.tunnel}
          onClose={() => setFormTarget(null)}
          onJobStarted={showJob}
        />
      )}

      {showSettings && (
        <SettingsDialog
          settings={settings ?? null}
          onClose={() => setShowSettings(false)}
          onJobStarted={showJob}
        />
      )}

      {deleteTarget && (
        <Modal
          title={`Delete ${deleteTarget.name}?`}
          onClose={() => setDeleteTarget(null)}
        >
          <p className="mb-5 text-sm leading-6 text-zinc-400">
            {deleteTarget.provisioned
              ? `This stops the tunnel and removes ${deleteTarget.domain} from the VPS: its nginx site, its certificate, and its port permission.`
              : "This removes the tunnel from tunnelbox. Nothing was set up on the VPS yet."}
          </p>

          {deleteTunnel.isError && (
            <p className="mb-4 text-sm text-red-300">
              {errorMessage(deleteTunnel.error)}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleteTunnel.isPending}
              className={DANGER_BUTTON_CLASS}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {activeJob && (
        <JobDialog
          jobId={activeJob.id}
          title={activeJob.title}
          onClose={() => setActiveJob(null)}
        />
      )}
    </div>
  );
}
