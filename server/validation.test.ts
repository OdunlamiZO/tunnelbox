import { describe, expect, it } from "vitest";

import {
  ValidationError,
  validateServerSettings,
  validateTunnelRequest,
} from "./validation";

const validSettings = {
  host: "203.0.113.10",
  administratorUser: "root",
  tunnelUser: "tunnel",
  tunnelKeyPath: "~/.ssh/tunnelbox_tunnel",
  certificateEmail: "owner@example.com",
  firstRemotePort: 9080,
};

describe("validateTunnelRequest", () => {
  it("trims and lowercases the domain", () => {
    expect(
      validateTunnelRequest({
        name: " API ",
        domain: " API.Example.org ",
        localPort: 8080,
      })
    ).toEqual({
      name: "API",
      domain: "api.example.org",
      localPort: 8080,
    });
  });

  it.each([
    [{ name: "", domain: "a.example.org", localPort: 80 }],
    [{ name: "API", domain: "not a domain", localPort: 80 }],
    [{ name: "API", domain: "a.example.org; rm -rf /", localPort: 80 }],
    [{ name: "API", domain: "a.example.org", localPort: 70000 }],
    [{ name: "API", domain: "a.example.org", localPort: "8080" }],
  ])("rejects %j", (body) => {
    expect(() => validateTunnelRequest(body)).toThrow(ValidationError);
  });
});

describe("validateServerSettings", () => {
  it("accepts valid settings", () => {
    expect(validateServerSettings(validSettings)).toEqual(validSettings);
  });

  it("accepts an IPv6 host", () => {
    expect(
      validateServerSettings({ ...validSettings, host: "2604:a00:50::1" }).host
    ).toBe("2604:a00:50::1");
  });

  it.each([
    ["host", "203.0.113.10; whoami"],
    ["administratorUser", "root user"],
    ["tunnelUser", "root"],
    ["tunnelKeyPath", "~/.ssh/key $(whoami)"],
    ["certificateEmail", "owner'@example.com"],
    ["firstRemotePort", 80],
  ])("rejects an invalid %s", (field, value) => {
    expect(() =>
      validateServerSettings({ ...validSettings, [field]: value })
    ).toThrow(ValidationError);
  });
});
