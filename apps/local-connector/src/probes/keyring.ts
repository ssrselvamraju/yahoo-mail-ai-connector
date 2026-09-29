import { randomBytes } from "node:crypto";
import { Entry } from "@napi-rs/keyring";

const service = "yahoo-mail-ai-connector-spike";
const account = `probe-${process.pid}-${Date.now()}`;
const canary = `CANARY-${randomBytes(24).toString("hex")}`;
const entry = new Entry(service, account);

let stored = false;
try {
  entry.setPassword(canary);
  stored = true;
  const recovered = entry.getPassword();
  if (recovered !== canary) throw new Error("The recovered keyring value did not match the generated canary.");
  entry.deletePassword();
  stored = false;
  let recoveredAfterDelete: string | null = null;
  try {
    recoveredAfterDelete = entry.getPassword();
  } catch {
    // Some platform backends signal a missing credential by throwing.
  }
  if (recoveredAfterDelete !== null) throw new Error("The keyring entry remained readable after deletion.");
  process.stdout.write(
    `${JSON.stringify({ ok: true, platform: process.platform, backend: "@napi-rs/keyring", stored: true, read: true, deleted: true })}\n`,
  );
} catch (error) {
  if (stored) {
    try {
      entry.deletePassword();
    } catch {
      // The error output deliberately omits the canary and any native error payload that might echo it.
    }
  }
  const message = error instanceof Error ? error.message.replaceAll(canary, "[REDACTED]") : "Unknown keyring error";
  process.stderr.write(`Keyring probe failed: ${message}\n`);
  process.exitCode = 1;
}
