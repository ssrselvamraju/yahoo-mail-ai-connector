import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { windowsStorage } from "./windows-storage.js";

const address = z.string().max(254).regex(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/);
export const sendInput = z.strictObject({
  to: z.array(address).min(1).max(10), cc: z.array(address).max(10).default([]), bcc: z.array(address).max(10).default([]),
  subject: z.string().min(1).max(500).regex(/^[^\r\n\x00-\x1f\x7f]+$/),
  body: z.string().min(1).max(50_000).refine(value => !value.includes("\0")),
}).superRefine((value, ctx) => {
  if (value.to.length + value.cc.length + value.bcc.length > 10) ctx.addIssue({ code: "custom", message: "At most 10 recipients are allowed." });
  if (Buffer.byteLength(value.body) > 50_000) ctx.addIssue({ code: "custom", message: "Body exceeds 50,000 bytes." });
});
export type SendContent = z.infer<typeof sendInput>;
export type SendStatus = "accepted" | "partial" | "unknown" | "failed";
export interface SendResult { status: SendStatus; messageId?: string; acceptedCount?: number; rejectedCount?: number; errorCode?: string }
export interface SendAdapter { submit(from: string, content: SendContent, messageId: string): Promise<SendResult> }
export const commitInput = z.strictObject({ token: z.string().min(32).max(128), previewDigest: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().min(16).max(128), confirmed: z.literal(true) });
export interface SendAccount { accountId: string; address: string }
interface Prepared { account: SendAccount; content: SendContent; digest: string; expires: number }
interface Attempt { tokenHash: string; status: SendStatus; time: number; messageId: string; result?: SendResult }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function readAttempt(path: string): Attempt {
  const record = JSON.parse(readFileSync(path, "utf8")) as Attempt;
  if (!record || !/^[a-f0-9]{64}$/.test(record.tokenHash) || !["accepted", "partial", "unknown", "failed"].includes(record.status) || !Number.isFinite(record.time) || typeof record.messageId !== "string") {
    throw Error("Send state is corrupt; inspect the ledger before sending.");
  }
  return record;
}


// Contains hashes, timestamps, generated message IDs and outcomes only. Never content or addresses.
export class AttemptLedger {
  constructor(readonly directory: string) {
    this.directory = resolve(directory);
    if (process.platform === "win32") windowsStorage("initialize", this.directory);
    else {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      this.#validate();
    }
  }
  #validate(): void {
    if (process.platform === "win32") windowsStorage("validate", this.directory);
    else if (lstatSync(this.directory).isSymbolicLink() || (statSync(this.directory).mode & 0o077) !== 0) {
      throw Error("Send state directory must be private (mode 0700).");
    }
  }
  #write(path: string, data: Attempt, exclusive: boolean): void {
    const windows = process.platform === "win32";
    const target = exclusive && !windows ? path : `${path}.${randomBytes(8).toString("hex")}.tmp`;
    const fd = openSync(target, "wx", 0o600);
    try { writeFileSync(fd, JSON.stringify(data)); fsyncSync(fd); } finally { closeSync(fd); }
    if (windows) {
      windowsStorage("publish", this.directory, { source: target, destination: path, exclusive });
      return;
    }
    if (!exclusive) renameSync(target, path);
    const dir = openSync(this.directory, "r");
    try { fsyncSync(dir); } finally { closeSync(dir); }
  }
  claim(accountId: string, key: string, token: string, messageId: string, now: number): { prior?: Attempt; path: string } {
    this.#validate();
    const path = join(this.directory, `${hash(accountId + ":" + key)}.json`);
    const lock = join(this.directory, ".lock");
    try { mkdirSync(lock, { mode: 0o700 }); } catch { throw Error("Send state is busy or requires inspection after an interrupted operation."); }
    try {
      const files = readdirSync(this.directory).filter(name => name.endsWith(".json"));
      if (files.length >= 10_000) throw Error("Send state capacity reached; review the ledger before sending.");
      const records = files.map(name => readAttempt(join(this.directory, name)));
      const tokenHash = hash(token);
      if (files.includes(path.split(/[\\/]/).at(-1)!)) {
        const prior = readAttempt(path);
        if (prior.tokenHash !== tokenHash) throw Error("Idempotency key conflicts with another preparation.");
        return { prior, path };
      }
      if (records.some(record => record.tokenHash === tokenHash)) throw Error("This preparation has already been committed.");
      if (records.some(record => record.status === "unknown")) throw Error("An earlier send has an unknown outcome; inspect the ledger before sending again.");
      // Global to this local ledger, so separate accounts cannot defeat conservative limits.
      if (records.some(record => now - record.time < 60_000) || records.filter(record => now - record.time < 3_600_000).length >= 5) throw Error("Send rate limit reached (one per minute, five per hour).");
      this.#write(path, { tokenHash, status: "unknown", time: now, messageId }, true);
      return { path };
    } finally { rmdirSync(lock); }
  }
  finish(path: string, result: SendResult): void {
    this.#validate();
    const attempt = readAttempt(path);
    this.#write(path, { ...attempt, status: result.status, result }, false);
  }
}

export class GuardedSendService {
  readonly #prepared = new Map<string, Prepared>();
  #busy = false;
  constructor(private readonly account: () => Promise<SendAccount>, private readonly adapter: SendAdapter, private readonly ledger: AttemptLedger, private readonly now = Date.now) {}
  async prepare(input: unknown) {
    const content = sendInput.parse(input);
    content.to = [...new Set(content.to)]; content.cc = [...new Set(content.cc)]; content.bcc = [...new Set(content.bcc)];
    const account = await this.account();
    address.parse(account.address);
    const now = this.now();
    for (const [token, entry] of this.#prepared) if (entry.expires <= now) this.#prepared.delete(token);
    if (this.#prepared.size >= 100) throw Error("Too many pending preparations.");
    const token = randomBytes(32).toString("base64url");
    const digest = hash(JSON.stringify([account.accountId, account.address, content]));
    const expires = now + 5 * 60_000;
    this.#prepared.set(token, { account, content, digest, expires });
    return { token, previewDigest: digest, expiresAt: new Date(expires).toISOString(), preview: { from: account.address, ...structuredClone(content) }, confirmationRequired: true };
  }
  async commit(input: unknown): Promise<SendResult> {
    const { token, previewDigest, idempotencyKey } = commitInput.parse(input);
    if (this.#busy) throw Error("A send is already in progress.");
    this.#busy = true;
    try {
      const prepared = this.#prepared.get(token);
      if (!prepared || prepared.digest !== previewDigest) throw Error("Preparation is invalid or belongs to a previous server session.");
      const current = await this.account();
      if (current.accountId !== prepared.account.accountId || current.address !== prepared.account.address) throw Error("The account changed; prepare again.");
      if (prepared.expires <= this.now()) throw Error("Preparation expired; prepare again.");
      const messageId = `<${randomBytes(16).toString("hex")}@yahoo-mail-ai-connector.invalid>`;
      const claim = this.ledger.claim(current.accountId, idempotencyKey, token, messageId, this.now());
      if (claim.prior) return claim.prior.result ?? { status: "unknown", messageId: claim.prior.messageId };
      let result: SendResult;
      try { result = await this.adapter.submit(current.address, prepared.content, messageId); }
      catch { result = { status: "unknown", messageId }; }
      // If persisting the result fails, the initial unknown record remains. Do not retry SMTP.
      try { this.ledger.finish(claim.path, result); } catch { return { status: "unknown", messageId }; }
      return result;
    } finally { this.#busy = false; }
  }
}
