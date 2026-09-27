import { spawn } from "node:child_process";

import type { ServerSettings } from "./types";

export type RemoteRunner = (
  settings: ServerSettings,
  script: string,
  onLine: (line: string) => void
) => Promise<void>;

export const runRemoteScript: RemoteRunner = (settings, script, onLine) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "StrictHostKeyChecking=accept-new",
        `${settings.administratorUser}@${settings.host}`,
        "bash -s",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const forwardLines = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim().length > 0) {
          onLine(line);
        }
      }
    };

    child.stdout.on("data", forwardLines);
    child.stderr.on("data", forwardLines);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`The VPS script exited with code ${code}.`));
      }
    });

    child.stdin.end(script);
  });
