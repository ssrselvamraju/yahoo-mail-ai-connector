import { Entry } from "@napi-rs/keyring";
import { MailConnectorError } from "../../mail-core/src/index.js";

export interface YahooCredentials {
  email: string;
  appPassword: string;
}

export interface CredentialStore {
  load(): Promise<YahooCredentials>;
  save(credentials: YahooCredentials): Promise<void>;
  remove(): Promise<boolean>;
}

export type CredentialEnvironment = Readonly<Record<string, string | undefined>>;

const service = "yahoo-mail-ai-connector";
const account = "default-yahoo-account";

export class KeyringCredentialStore implements CredentialStore {
  readonly #entry = new Entry(service, account);

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
  if (source === undefined || source === "keyring") return new KeyringCredentialStore();
  if (source === "managed-environment") return new ManagedEnvironmentCredentialStore(environment);
  throw new MailConnectorError("authentication_failed", `Unsupported Yahoo credential source: ${source}`);
}
