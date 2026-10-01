import { describe, expect, it } from "vitest";
import {
  ManagedEnvironmentCredentialStore,
  createRuntimeCredentialStore,
  osCredentialBackendFor,
} from "../../packages/yahoo-imap/src/credentials.js";

describe("managed-environment credentials", () => {
  it("loads explicitly enabled platform-injected secrets", async () => {
    const store = new ManagedEnvironmentCredentialStore({
      YAHOO_CREDENTIAL_SOURCE: "managed-environment",
      YAHOO_EMAIL: " test@yahoo.example ",
      YAHOO_APP_PASSWORD: "synthetic-app-password",
    });

    await expect(store.load()).resolves.toEqual({
      email: "test@yahoo.example",
      appPassword: "synthetic-app-password",
    });
  });

  it("fails closed unless managed-environment mode is explicit", async () => {
    const store = new ManagedEnvironmentCredentialStore({
      YAHOO_EMAIL: "test@yahoo.example",
      YAHOO_APP_PASSWORD: "synthetic-app-password",
    });
    await expect(store.load()).rejects.toThrow("YAHOO_CREDENTIAL_SOURCE=managed-environment");
  });

  it("does not allow the connector to modify platform-managed secrets", async () => {
    const store = new ManagedEnvironmentCredentialStore({ YAHOO_CREDENTIAL_SOURCE: "managed-environment" });
    await expect(store.save({ email: "test@yahoo.example", appPassword: "synthetic-app-password" })).rejects.toThrow(
      "hosting platform's secret store",
    );
    await expect(store.remove()).rejects.toThrow("hosting platform's secret store");
  });

  it("rejects unknown credential sources", () => {
    expect(() => createRuntimeCredentialStore({ YAHOO_CREDENTIAL_SOURCE: "plaintext-file" })).toThrow(
      "Unsupported Yahoo credential source",
    );
  });

  it("selects the native persistent store for each supported desktop OS", () => {
    expect(osCredentialBackendFor("win32")).toBe("windows-credential-manager");
    expect(osCredentialBackendFor("darwin")).toBe("macos-keychain");
    expect(osCredentialBackendFor("linux")).toBe("linux-secret-service");
    expect(() => osCredentialBackendFor("freebsd")).toThrow("No approved operating-system credential store");
  });
});
