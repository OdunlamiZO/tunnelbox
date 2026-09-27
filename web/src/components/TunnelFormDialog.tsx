import { useState } from "react";

import type { Job, TunnelView } from "../api/tunnelbox-api";
import { useSaveTunnel } from "../hooks/use-save-tunnel";
import { Modal } from "./Modal";
import {
  Field,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  errorMessage,
} from "./form-controls";

type Props = {
  tunnel: TunnelView | null;
  onClose: () => void;
  onJobStarted: (job: Job, title: string) => void;
};

export function TunnelFormDialog({ tunnel, onClose, onJobStarted }: Props) {
  const saveTunnel = useSaveTunnel(tunnel?.id ?? null);
  const [name, setName] = useState(tunnel?.name ?? "");
  const [domain, setDomain] = useState(tunnel?.domain ?? "");
  const [localPort, setLocalPort] = useState(String(tunnel?.localPort ?? ""));

  const isEditing = tunnel !== null;
  const domainChanged =
    isEditing && domain.trim().toLowerCase() !== tunnel.domain;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    saveTunnel.mutate(
      { name, domain, localPort: Number(localPort) },
      {
        onSuccess: ({ job }) => {
          onClose();

          if (job) {
            onJobStarted(
              job,
              isEditing ? `Moving to ${domain}` : `Setting up ${domain}`
            );
          }
        },
      }
    );
  }

  return (
    <Modal
      title={isEditing ? `Edit ${tunnel.name}` : "Add tunnel"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <Field
          id="tunnel-name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="My API"
          maxLength={60}
          required
          autoFocus
        />

        <Field
          id="tunnel-domain"
          label="Public domain"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="myapp.duckdns.org"
          required
          hint={
            domainChanged
              ? "Changing the domain sets up the new one on the VPS, then removes the old one."
              : "Point this domain's DNS at your VPS first."
          }
        />

        <Field
          id="tunnel-local-port"
          label="Local port"
          type="number"
          min={1}
          max={65535}
          value={localPort}
          onChange={(event) => setLocalPort(event.target.value)}
          placeholder="8080"
          required
          hint="The port your app listens on, on this Mac."
        />

        {!isEditing && (
          <p className="mb-4 rounded-lg bg-zinc-800/60 p-3 text-xs leading-5 text-zinc-400">
            Saving connects to the VPS as the administrator user, creates the
            nginx site, gets an HTTPS certificate, and allows a new port for the
            tunnel user.
          </p>
        )}

        {saveTunnel.isError && (
          <p className="mb-4 text-sm text-red-300">
            {errorMessage(saveTunnel.error)}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveTunnel.isPending}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isEditing ? "Save" : "Add tunnel"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
