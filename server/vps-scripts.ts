import type { ServerSettings, TunnelDefinition } from "./types";

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function authorizedKeysLine(
  publicKey: string,
  remotePorts: number[]
): string {
  if (remotePorts.length === 0) {
    return `restrict ${publicKey}`;
  }

  const permissions = [...new Set(remotePorts)]
    .sort((first, second) => first - second)
    .map((port) => `permitlisten="127.0.0.1:${port}"`);

  return `restrict,port-forwarding,${permissions.join(",")} ${publicKey}`;
}

export function nginxSiteConfiguration(
  domain: string,
  remotePort: number
): string {
  return [
    "server {",
    "    listen 80;",
    "    listen [::]:80;",
    `    server_name ${domain};`,
    "",
    "    location / {",
    `        proxy_pass http://127.0.0.1:${remotePort};`,
    "        proxy_http_version 1.1;",
    "        proxy_set_header Upgrade $http_upgrade;",
    "        proxy_set_header Connection $http_connection;",
    "",
    "        proxy_set_header Host $host;",
    "        proxy_set_header X-Real-IP $remote_addr;",
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "        proxy_set_header X-Forwarded-Proto $scheme;",
    "",
    "        proxy_buffering off;",
    "        proxy_read_timeout 1h;",
    "    }",
    "}",
    "",
  ].join("\n");
}

function scriptHeader(): string[] {
  return [
    "set -euo pipefail",
    "if [ -d /etc/nginx/sites-available ]; then",
    "  SITE_DIRECTORY=/etc/nginx/sites-available",
    "  ENABLED_DIRECTORY=/etc/nginx/sites-enabled",
    "else",
    "  SITE_DIRECTORY=/etc/nginx/conf.d",
    "  ENABLED_DIRECTORY=",
    "fi",
  ];
}

function writeAuthorizedKeys(settings: ServerSettings, line: string): string[] {
  const home = `/home/${settings.tunnelUser}`;

  return [
    `echo '==> Updating port permissions for ${settings.tunnelUser}'`,
    `mkdir -p ${home}/.ssh`,
    `printf '%s\\n' ${shellQuote(line)} > ${home}/.ssh/authorized_keys`,
    `chown -R ${settings.tunnelUser}:${settings.tunnelUser} ${home}/.ssh`,
    `chmod 700 ${home}/.ssh`,
    `chmod 600 ${home}/.ssh/authorized_keys`,
  ];
}

function siteFilePaths(siteName: string): string[] {
  return [
    `SITE_FILE="$SITE_DIRECTORY/${siteName}"`,
    `if [ "$SITE_DIRECTORY" = /etc/nginx/conf.d ]; then SITE_FILE="$SITE_FILE.conf"; fi`,
  ];
}

function portFreeCheck(remotePort: number): string[] {
  return [
    `echo '==> Checking port ${remotePort} is free'`,
    `if ss -tln | grep -q ':${remotePort} '; then`,
    `  echo 'Port ${remotePort} is already in use on the VPS.' >&2`,
    "  exit 1",
    "fi",
  ];
}

function addSite(tunnel: TunnelDefinition, settings: ServerSettings): string[] {
  return [
    `echo '==> Writing nginx site for ${tunnel.domain}'`,
    ...siteFilePaths(tunnel.nginxSiteName),
    `printf '%s' ${shellQuote(nginxSiteConfiguration(tunnel.domain, tunnel.remotePort))} > "$SITE_FILE"`,
    `if [ -n "$ENABLED_DIRECTORY" ]; then ln -sf "$SITE_FILE" "$ENABLED_DIRECTORY/${tunnel.nginxSiteName}"; fi`,
    "nginx -t",
    "systemctl reload nginx",
    `echo '==> Certificate for ${tunnel.domain}'`,
    "if ! command -v certbot >/dev/null 2>&1; then",
    "  apt-get install -y certbot python3-certbot-nginx",
    "fi",
    `certbot --nginx -d ${tunnel.domain} --non-interactive --agree-tos --no-eff-email --redirect --keep-until-expiring -m ${shellQuote(settings.certificateEmail)}`,
    "nginx -t",
    "systemctl reload nginx",
  ];
}

function removeSite(
  tunnel: Pick<TunnelDefinition, "domain" | "nginxSiteName">
): string[] {
  return [
    `echo '==> Removing nginx site for ${tunnel.domain}'`,
    ...siteFilePaths(tunnel.nginxSiteName),
    `if [ -n "$ENABLED_DIRECTORY" ]; then rm -f "$ENABLED_DIRECTORY/${tunnel.nginxSiteName}"; fi`,
    'rm -f "$SITE_FILE"',
    "nginx -t",
    "systemctl reload nginx",
    `echo '==> Removing certificate for ${tunnel.domain}'`,
    `if [ -d /etc/letsencrypt/live/${tunnel.domain} ]; then certbot delete --non-interactive --cert-name ${tunnel.domain}; fi`,
  ];
}

export function prepareServerScript(
  settings: ServerSettings,
  publicKey: string,
  remotePorts: number[]
): string {
  return [
    "set -euo pipefail",
    `echo '==> Tunnel user ${settings.tunnelUser}'`,
    `id ${settings.tunnelUser} >/dev/null 2>&1 || adduser --disabled-password --gecos '' ${settings.tunnelUser}`,
    ...writeAuthorizedKeys(
      settings,
      authorizedKeysLine(publicKey, remotePorts)
    ),
    "echo '==> SSH keep-alive settings'",
    "printf 'ClientAliveInterval 30\\nClientAliveCountMax 3\\n' > /etc/ssh/sshd_config.d/tunnel.conf",
    "sshd -t",
    "systemctl reload ssh 2>/dev/null || systemctl reload sshd",
    "echo '==> Done'",
    "",
  ].join("\n");
}

export function provisionTunnelScript(
  tunnel: TunnelDefinition,
  settings: ServerSettings,
  publicKey: string,
  remotePorts: number[]
): string {
  return [
    ...scriptHeader(),
    ...portFreeCheck(tunnel.remotePort),
    ...addSite(tunnel, settings),
    ...writeAuthorizedKeys(
      settings,
      authorizedKeysLine(publicKey, remotePorts)
    ),
    "echo '==> Done'",
    "",
  ].join("\n");
}

export function deprovisionTunnelScript(
  tunnel: TunnelDefinition,
  settings: ServerSettings,
  publicKey: string,
  remainingRemotePorts: number[]
): string {
  return [
    ...scriptHeader(),
    ...removeSite(tunnel),
    ...writeAuthorizedKeys(
      settings,
      authorizedKeysLine(publicKey, remainingRemotePorts)
    ),
    "echo '==> Done'",
    "",
  ].join("\n");
}

export function changeDomainScript(
  previous: TunnelDefinition,
  next: TunnelDefinition,
  settings: ServerSettings
): string {
  return [
    ...scriptHeader(),
    ...addSite(next, settings),
    ...removeSite(previous),
    "echo '==> Done'",
    "",
  ].join("\n");
}
