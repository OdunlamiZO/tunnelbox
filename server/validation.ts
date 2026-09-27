import type { SaveTunnelRequest, ServerSettings } from "./types";

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

const IPV6_PATTERN = /^(?=.*:)[0-9a-f:]+$/i;

const USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

const EMAIL_PATTERN = /^[^\s@'"`$\\]+@[^\s@'"`$\\]+\.[^\s@'"`$\\]+$/;

const KEY_PATH_PATTERN = /^[~A-Za-z0-9_./-]+$/;

export class ValidationError extends Error {}

export function isValidDomain(domain: string): boolean {
  return HOSTNAME_PATTERN.test(domain);
}

export function isValidPort(port: unknown): port is number {
  return (
    typeof port === "number" &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  );
}

export function validateTunnelRequest(body: unknown): SaveTunnelRequest {
  const candidate = (body ?? {}) as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const domain =
    typeof candidate.domain === "string"
      ? candidate.domain.trim().toLowerCase()
      : "";
  const localPort = candidate.localPort;

  if (name.length === 0 || name.length > 60) {
    throw new ValidationError("Name must be between 1 and 60 characters.");
  }

  if (!isValidDomain(domain)) {
    throw new ValidationError(
      "Domain must be a hostname like api.example.duckdns.org."
    );
  }

  if (!isValidPort(localPort)) {
    throw new ValidationError(
      "Local port must be a whole number between 1 and 65535."
    );
  }

  return { name, domain, localPort };
}

export function validateServerSettings(body: unknown): ServerSettings {
  const candidate = (body ?? {}) as Record<string, unknown>;
  const text = (key: string) =>
    typeof candidate[key] === "string" ? (candidate[key] as string).trim() : "";

  const host = text("host").toLowerCase();
  const administratorUser = text("administratorUser");
  const tunnelUser = text("tunnelUser");
  const tunnelKeyPath = text("tunnelKeyPath");
  const certificateEmail = text("certificateEmail");
  const firstRemotePort = candidate.firstRemotePort;

  if (
    !IPV4_PATTERN.test(host) &&
    !IPV6_PATTERN.test(host) &&
    !isValidDomain(host)
  ) {
    throw new ValidationError("Host must be an IP address or hostname.");
  }

  if (!USER_PATTERN.test(administratorUser)) {
    throw new ValidationError(
      "Administrator user must be a valid Linux user name."
    );
  }

  if (!USER_PATTERN.test(tunnelUser)) {
    throw new ValidationError("Tunnel user must be a valid Linux user name.");
  }

  if (tunnelUser === administratorUser) {
    throw new ValidationError(
      "Tunnel user must be different from the administrator user."
    );
  }

  if (!KEY_PATH_PATTERN.test(tunnelKeyPath)) {
    throw new ValidationError(
      "Tunnel key path may only contain letters, digits, and ~ _ . / -"
    );
  }

  if (!EMAIL_PATTERN.test(certificateEmail)) {
    throw new ValidationError(
      "Certificate email must be a valid email address."
    );
  }

  if (!isValidPort(firstRemotePort) || firstRemotePort < 1024) {
    throw new ValidationError(
      "First remote port must be between 1024 and 65535."
    );
  }

  return {
    host,
    administratorUser,
    tunnelUser,
    tunnelKeyPath,
    certificateEmail,
    firstRemotePort,
  };
}
