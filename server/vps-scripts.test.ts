import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { ServerSettings, TunnelDefinition } from "./types";
import {
  changeDomainCommand,
  deprovisionTunnelCommand,
  prepareServerCommand,
  provisionTunnelCommand,
  shellQuote,
} from "./vps-scripts";

const HELPER_FILE = fileURLToPath(
  new URL("../vps/tunnelbox-helper", import.meta.url)
);

const INSTALL_FILE = fileURLToPath(
  new URL("../vps/install.sh", import.meta.url)
);

const settings: ServerSettings = {
  host: "203.0.113.10",
  administratorUser: "tunnelbox-admin",
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

const publicKey = "ssh-ed25519 AAAAexample tunnelbox-tunnel";

function assertValidBash(script: string) {
  const result = spawnSync("bash", ["-n"], { input: script });

  expect(result.stderr.toString()).toBe("");
  expect(result.status).toBe(0);
}

function runHelperFunction(...functionCall: string[]) {
  const call = functionCall.map(shellQuote).join(" ");
  const result = spawnSync("bash", [
    "-c",
    `source ${shellQuote(HELPER_FILE)} && ${call}`,
  ]);

  return {
    succeeded: result.status === 0,
    output: result.stdout.toString().trim(),
  };
}

describe("shellQuote", () => {
  it("survives embedded single quotes", () => {
    const result = spawnSync("bash", [
      "-c",
      `printf '%s' ${shellQuote("it's $HOME")}`,
    ]);

    expect(result.stdout.toString()).toBe("it's $HOME");
  });
});

describe("helper commands", () => {
  it("provisioning checks the port, adds the site, then updates the key's ports", () => {
    const command = provisionTunnelCommand(
      tunnel,
      settings,
      publicKey,
      [9081, 9080, 9081]
    );

    assertValidBash(command);
    expect(command).toBe(
      [
        "sudo -n /usr/local/sbin/tunnelbox-helper 'check-port' '9080'",
        "sudo -n /usr/local/sbin/tunnelbox-helper 'add-site' 'api.example.org' '9080' 'owner@example.com'",
        `sudo -n /usr/local/sbin/tunnelbox-helper 'set-ports' '${publicKey}' '9080,9081'`,
      ].join(" && ")
    );
  });

  it("deprovisioning removes the site and passes no ports when none remain", () => {
    const command = deprovisionTunnelCommand(tunnel, publicKey, []);

    assertValidBash(command);
    expect(command).toContain("'remove-site' 'tunnelbox-api.example.org'");
    expect(command).toMatch(/'set-ports' '.+' ''$/);
  });

  it("changing the domain adds the new site before removing the old one", () => {
    const moved: TunnelDefinition = {
      ...tunnel,
      domain: "app.example.org",
      nginxSiteName: "tunnelbox-app.example.org",
    };
    const command = changeDomainCommand(tunnel, moved, settings);

    assertValidBash(command);
    expect(command.indexOf("'add-site' 'app.example.org'")).toBeLessThan(
      command.indexOf("'remove-site' 'tunnelbox-api.example.org'")
    );
  });

  it("preparing the server installs the tunnel key", () => {
    const command = prepareServerCommand(publicKey, [9080]);

    assertValidBash(command);
    expect(command).toContain("'prepare'");
    expect(command).toContain("'set-ports'");
  });
});

describe("VPS scripts", () => {
  it("are valid bash", () => {
    for (const file of [HELPER_FILE, INSTALL_FILE]) {
      const result = spawnSync("bash", ["-n", file]);

      expect(result.stderr.toString()).toBe("");
      expect(result.status).toBe(0);
    }
  });
});

describe("tunnelbox-helper validation", () => {
  it.each(["api.example.org", "myapp.duckdns.org", "a-b.example.co"])(
    "accepts the domain %s",
    (domain) => {
      expect(runHelperFunction("valid_domain", domain).succeeded).toBe(true);
    }
  );

  it.each([
    "example",
    "-bad.example.org",
    "api.example.org; rm -rf /",
    "api.example.org/../x",
    "API.EXAMPLE.ORG",
  ])("rejects the domain %s", (domain) => {
    expect(runHelperFunction("valid_domain", domain).succeeded).toBe(false);
  });

  it.each(["1024", "9080", "65535"])("accepts the port %s", (port) => {
    expect(runHelperFunction("valid_port", port).succeeded).toBe(true);
  });

  it.each(["80", "1023", "65536", "9080a", "", "9080 9081"])(
    "rejects the port %s",
    (port) => {
      expect(runHelperFunction("valid_port", port).succeeded).toBe(false);
    }
  );

  it("only manages tunnelbox sites", () => {
    expect(
      runHelperFunction("valid_site_name", "tunnelbox-api.example.org")
        .succeeded
    ).toBe(true);
    expect(runHelperFunction("valid_site_name", "default").succeeded).toBe(
      false
    );
    expect(
      runHelperFunction("valid_site_name", "tunnelbox-../../ssh").succeeded
    ).toBe(false);
  });

  it("rejects public keys with options or extra content", () => {
    expect(runHelperFunction("valid_public_key", publicKey).succeeded).toBe(
      true
    );
    expect(
      runHelperFunction("valid_public_key", `command="sh" ${publicKey}`)
        .succeeded
    ).toBe(false);
    expect(
      runHelperFunction("valid_public_key", `${publicKey}\nssh-ed25519 AAAAx`)
        .succeeded
    ).toBe(false);
  });

  it("allows only the listed ports on localhost, sorted and without duplicates", () => {
    expect(
      runHelperFunction("authorized_keys_line", publicKey, "9081,9080,9081")
        .output
    ).toBe(
      `restrict,port-forwarding,permitlisten="127.0.0.1:9080",permitlisten="127.0.0.1:9081" ${publicKey}`
    );
  });

  it("drops port forwarding entirely when no ports remain", () => {
    expect(
      runHelperFunction("authorized_keys_line", publicKey, "").output
    ).toBe(`restrict ${publicKey}`);
  });
});
