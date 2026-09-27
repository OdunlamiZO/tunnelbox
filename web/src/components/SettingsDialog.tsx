import { useState } from "react";

import type { Job, ServerSettings } from "../api/tunnelbox-api";
import { useSaveSettings } from "../hooks/use-save-settings";
import { usePrepareServer } from "../hooks/use-tunnel-actions";
import { Modal } from "./Modal";
import {
  Field,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  errorMessage,
} from "./form-controls";

type Props = {
  settings: ServerSettings | null;
  onClose: () => void;
  onJobStarted: (job: Job, title: string) => void;
};

const EMPTY_SETTINGS: ServerSettings = {
  host: "",
  administratorUser: "tunnelbox-admin",
  tunnelUser: "tunnel",
  tunnelKeyPath: "~/.ssh/tunnelbox_tunnel",
  certificateEmail: "",
  firstRemotePort: 9080,
};

export function SettingsDialog({ settings, onClose, onJobStarted }: Props) {
  const saveSettings = useSaveSettings();
  const prepareServer = usePrepareServer();
  const [form, setForm] = useState<ServerSettings>(settings ?? EMPTY_SETTINGS);

  function update<Key extends keyof ServerSettings>(
    key: Key,
    value: ServerSettings[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    saveSettings.mutate(form, { onSuccess: onClose });
  }

  function handlePrepareServer() {
    prepareServer.mutate(undefined, {
      onSuccess: (job) => {
        onClose();
        onJobStarted(job, "Preparing the VPS");
      },
    });
  }

  const error = saveSettings.error ?? prepareServer.error;

  return (
    <Modal title="VPS settings" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field
          id="settings-host"
          label="VPS host"
          value={form.host}
          onChange={(event) => update("host", event.target.value)}
          placeholder="203.0.113.10"
          required
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="settings-administrator-user"
            label="Administrator user"
            value={form.administratorUser}
            onChange={(event) =>
              update("administratorUser", event.target.value)
            }
            required
          />
          <Field
            id="settings-tunnel-user"
            label="Tunnel user"
            value={form.tunnelUser}
            onChange={(event) => update("tunnelUser", event.target.value)}
            required
          />
        </div>
        <Field
          id="settings-key"
          label="Tunnel key (private key path)"
          value={form.tunnelKeyPath}
          onChange={(event) => update("tunnelKeyPath", event.target.value)}
          required
          hint="Its .pub file is installed for the tunnel user on the VPS."
        />
        <Field
          id="settings-email"
          label="Certificate email"
          type="email"
          value={form.certificateEmail}
          onChange={(event) => update("certificateEmail", event.target.value)}
          required
          hint="Let's Encrypt sends certificate expiry notices here."
        />
        <Field
          id="settings-first-port"
          label="First VPS port for tunnels"
          type="number"
          min={1024}
          max={65535}
          value={form.firstRemotePort}
          onChange={(event) =>
            update("firstRemotePort", Number(event.target.value))
          }
          required
        />

        <p className="mb-4 text-xs leading-5 text-zinc-500">
          The administrator user must be able to log in with an SSH key (no
          password prompt). tunnelbox never asks for or stores passwords.
        </p>

        {error && (
          <p className="mb-4 text-sm text-red-300">{errorMessage(error)}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrepareServer}
            disabled={!settings || prepareServer.isPending}
            className={SECONDARY_BUTTON_CLASS}
            title="Creates the tunnel user and SSH keep-alive settings on the VPS"
          >
            Prepare VPS
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveSettings.isPending}
              className={PRIMARY_BUTTON_CLASS}
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
