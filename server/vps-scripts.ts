import type { ServerSettings, TunnelDefinition } from "./types";

export const HELPER_PATH = "/usr/local/sbin/tunnelbox-helper";

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function helper(...helperArguments: string[]): string {
  return ["sudo", "-n", HELPER_PATH, ...helperArguments.map(shellQuote)].join(
    " "
  );
}

function portList(remotePorts: number[]): string {
  return [...new Set(remotePorts)]
    .sort((first, second) => first - second)
    .join(",");
}

function addSite(tunnel: TunnelDefinition, settings: ServerSettings): string {
  return helper(
    "add-site",
    tunnel.domain,
    String(tunnel.remotePort),
    settings.certificateEmail
  );
}

function setPorts(publicKey: string, remotePorts: number[]): string {
  return helper("set-ports", publicKey, portList(remotePorts));
}

export function prepareServerCommand(
  publicKey: string,
  remotePorts: number[]
): string {
  return [helper("prepare"), setPorts(publicKey, remotePorts)].join(" && ");
}

export function provisionTunnelCommand(
  tunnel: TunnelDefinition,
  settings: ServerSettings,
  publicKey: string,
  remotePorts: number[]
): string {
  return [
    helper("check-port", String(tunnel.remotePort)),
    addSite(tunnel, settings),
    setPorts(publicKey, remotePorts),
  ].join(" && ");
}

export function deprovisionTunnelCommand(
  tunnel: TunnelDefinition,
  publicKey: string,
  remainingRemotePorts: number[]
): string {
  return [
    helper("remove-site", tunnel.nginxSiteName),
    setPorts(publicKey, remainingRemotePorts),
  ].join(" && ");
}

export function changeDomainCommand(
  previous: TunnelDefinition,
  next: TunnelDefinition,
  settings: ServerSettings
): string {
  return [
    addSite(next, settings),
    helper("remove-site", previous.nginxSiteName),
  ].join(" && ");
}
