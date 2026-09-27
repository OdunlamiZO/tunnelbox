import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import type { ServerSettings, TunnelDefinition } from "./types";
import {
  authorizedKeysLine,
  changeDomainScript,
  deprovisionTunnelScript,
  prepareServerScript,
  provisionTunnelScript,
  shellQuote,
} from "./vps-scripts";

const settings: ServerSettings = {
  host: "203.0.113.10",
  administratorUser: "root",
  tunnelUser: "tunnel",
  tunnelKeyPath: "~/.ssh/tunnelbox_tunnel",
  certificateEmail: "owner@example.com",
  firstRemotePort: 9080,
};

const tunnel: TunnelDefinition = {
  id: "tunnel-1",
  name: "Example API",
  domain: "api.example.org",
  localPort: 8080,
  remotePort: 9080,
  nginxSiteName: "tunnelbox-api.example.org",
  provisioned: true,
};

const publicKey = "ssh-ed25519 AAAAexample tunnelbox-api.example.org";

function assertValidBash(script: string) {
  const result = spawnSync("bash", ["-n"], { input: script });

  expect(result.stderr.toString()).toBe("");
  expect(result.status).toBe(0);
}

describe("authorizedKeysLine", () => {
  it("allows only the listed ports on localhost, sorted and without duplicates", () => {
    expect(authorizedKeysLine(publicKey, [9081, 9080, 9081])).toBe(
      `restrict,port-forwarding,permitlisten="127.0.0.1:9080",permitlisten="127.0.0.1:9081" ${publicKey}`
    );
  });

  it("drops port forwarding entirely when no ports remain", () => {
    expect(authorizedKeysLine(publicKey, [])).toBe(`restrict ${publicKey}`);
  });
});

describe("shellQuote", () => {
  it("survives embedded single quotes", () => {
    const result = spawnSync("bash", [
      "-c",
      `printf '%s' ${shellQuote("it's $HOME")}`,
    ]);

    expect(result.stdout.toString()).toBe("it's $HOME");
  });
});

describe("generated scripts", () => {
  it("provision script checks the port, writes the site, and requests a certificate", () => {
    const script = provisionTunnelScript(tunnel, settings, publicKey, [9080]);

    assertValidBash(script);
    expect(script).toContain("grep -q ':9080 '");
    expect(script).toContain("server_name api.example.org;");
    expect(script).toContain("proxy_pass http://127.0.0.1:9080;");
    expect(script).toContain("proxy_set_header Upgrade $http_upgrade;");
    expect(script).toContain(
      "certbot --nginx -d api.example.org --non-interactive"
    );
    expect(script).toContain('permitlisten="127.0.0.1:9080"');
  });

  it("deprovision script removes the site and certificate", () => {
    const script = deprovisionTunnelScript(tunnel, settings, publicKey, []);

    assertValidBash(script);
    expect(script).toContain(
      'rm -f "$ENABLED_DIRECTORY/tunnelbox-api.example.org"'
    );
    expect(script).toContain(
      "certbot delete --non-interactive --cert-name api.example.org"
    );
    expect(script).toContain(`restrict ${publicKey}`);
  });

  it("change-domain script adds the new site before removing the old one", () => {
    const moved = {
      ...tunnel,
      domain: "api.example.org",
      nginxSiteName: "tunnelbox-api.example.org",
    };
    const script = changeDomainScript(tunnel, moved, settings);

    assertValidBash(script);
    expect(script.indexOf("server_name api.example.org;")).toBeLessThan(
      script.indexOf("Removing nginx site for api.example.org")
    );
    expect(script).not.toContain("is already in use");
  });

  it("prepare-server script is valid bash", () => {
    assertValidBash(prepareServerScript(settings, publicKey, [9080]));
  });
});
