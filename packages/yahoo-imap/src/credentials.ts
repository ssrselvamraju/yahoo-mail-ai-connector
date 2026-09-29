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
