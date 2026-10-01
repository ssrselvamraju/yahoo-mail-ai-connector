import { Entry } from "@napi-rs/keyring";
import { MailConnectorError } from "../../mail-core/src/index.js";

export interface YahooCredentials {
  email: string;
  appPassword: string;
}

export interface CredentialStore {
  readonly backend: CredentialBackend;
  load(): Promise<YahooCredentials>;
  save(credentials: YahooCredentials): Promise<void>;
  remove(): Promise<boolean>;
}

export type CredentialEnvironment = Readonly<Record<string, string | undefined>>;
export type CredentialBackend =
  | "windows-credential-manager"
  | "macos-keychain"
  | "linux-secret-service"
  | "managed-environment";

const service = "yahoo-mail-ai-connector";
const account = "default-yahoo-account";

export function osCredentialBackendFor(platform: NodeJS.Platform): Exclude<CredentialBackend, "managed-environment"> {
  if (platform === "win32") return "windows-credential-manager";
  if (platform === "darwin") return "macos-keychain";
  if (platform === "linux") return "linux-secret-service";
  throw new MailConnectorError("unsupported", `No approved operating-system credential store is configured for ${platform}.`);
}

export function createOsCredentialEntry(
  serviceName = service,
  accountName = account,
  platform: NodeJS.Platform = process.platform,
): Entry {
  osCredentialBackendFor(platform);
  return new Entry(
    serviceName,
    accountName,
    platform === "linux" ? { linux: { store: "secret-service" } } : undefined,
  );
}

export class OsCredentialStore implements CredentialStore {
  readonly backend: Exclude<CredentialBackend, "managed-environment">;
  readonly #entry: Entry;

  constructor(platform: NodeJS.Platform = process.platform) {
    this.backend = osCredentialBackendFor(platform);
    this.#entry = createOsCredentialEntry(service, account, platform);
  }

  async load(): Promise<YahooCredentials> {
    let stored = this.#entry.getPassword();
    if (stored === null) {
      throw new MailConnectorError("authentication_failed", "Yahoo is not configured. Run the setup command first.");
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("email" in parsed) ||
        !("appPassword" in parsed) ||
        typeof parsed.email !== "string" ||
        typeof parsed.appPassword !== "string"
      ) {
        throw new Error("invalid credential record");
      }
      return { email: parsed.email, appPassword: parsed.appPassword };
    } catch {
      throw new MailConnectorError("authentication_failed", "The stored Yahoo credential record is invalid. Remove it and run setup again.");
    } finally {
      stored = "";
    }
  }

  async save(credentials: YahooCredentials): Promise<void> {
    this.#entry.setPassword(JSON.stringify(credentials));
  }

  async remove(): Promise<boolean> {
    return this.#entry.deletePassword();
  }
}

export class ManagedEnvironmentCredentialStore implements CredentialStore {
  readonly backend = "managed-environment" as const;

  constructor(private readonly environment: CredentialEnvironment = process.env) {}

  async load(): Promise<YahooCredentials> {
    if (this.environment.YAHOO_CREDENTIAL_SOURCE !== "managed-environment") {
      throw new MailConnectorError(
        "authentication_failed",
        "Managed-environment credentials require YAHOO_CREDENTIAL_SOURCE=managed-environment.",
      );
    }

    const email = this.environment.YAHOO_EMAIL?.trim();
    const appPassword = this.environment.YAHOO_APP_PASSWORD;
    if (!email?.includes("@") || appPassword === undefined || appPassword.length < 8) {
      throw new MailConnectorError(
        "authentication_failed",
        "The managed Yahoo credential configuration is missing or invalid.",
      );
    }
    return { email, appPassword };
  }

  async save(_credentials: YahooCredentials): Promise<void> {
    throw new MailConnectorError("unsupported", "Managed credentials must be changed in the hosting platform's secret store.");
  }

  async remove(): Promise<boolean> {
    throw new MailConnectorError("unsupported", "Managed credentials must be removed from the hosting platform's secret store.");
  }
}

export function createRuntimeCredentialStore(environment: CredentialEnvironment = process.env): CredentialStore {
  const source = environment.YAHOO_CREDENTIAL_SOURCE;
  if (source === undefined || source === "keyring" || source === "os-keyring") return new OsCredentialStore();
  if (source === "managed-environment") return new ManagedEnvironmentCredentialStore(environment);
  throw new MailConnectorError("authentication_failed", `Unsupported Yahoo credential source: ${source}`);
}
