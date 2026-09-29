import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import type { FetchMessageObject, MessageAddressObject, MessageStructureObject, SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import type {
  AttachmentMetadata,
  MailAddress,
  MailMessage,
  MailProvider,
  Mailbox,
  MessageSummary,
  SearchMessagesInput,
  SearchMessagesResult,
} from "../../mail-core/src/index.js";
import { MailConnectorError } from "../../mail-core/src/index.js";
import type { CredentialStore, YahooCredentials } from "./credentials.js";

const MAX_SEARCH_WINDOW = 1_000;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

interface MessageReference {
  version: 1;
  mailbox: string;
  uidValidity: string;
  uid: number;
}

function encodeOpaque(prefix: string, value: object): string {
  return `${prefix}:${Buffer.from(JSON.stringify(value), "utf8").toString("base64url")}`;
}

function decodeOpaque<T>(prefix: string, value: string): T {
  if (!value.startsWith(`${prefix}:`)) throw new MailConnectorError("invalid_reference", "The reference belongs to a different provider.");
  try {
    return JSON.parse(Buffer.from(value.slice(prefix.length + 1), "base64url").toString("utf8")) as T;
  } catch {
    throw new MailConnectorError("invalid_reference", "The reference is malformed.");
  }
}

export function encodeMailboxId(path: string): string {
  return encodeOpaque("ymb", { version: 1, path });
}

export function decodeMailboxId(value: string): string {
  const decoded = decodeOpaque<{ version?: unknown; path?: unknown }>("ymb", value);
  if (decoded.version !== 1 || typeof decoded.path !== "string" || decoded.path.length === 0) {
    throw new MailConnectorError("invalid_reference", "The mailbox reference is invalid.");
  }
  return decoded.path;
}

function encodeMessageRef(reference: MessageReference): string {
  return encodeOpaque("ymsg", reference);
}

function decodeMessageRef(value: string): MessageReference {
  const decoded = decodeOpaque<Partial<MessageReference>>("ymsg", value);
  if (
    decoded.version !== 1 ||
    typeof decoded.mailbox !== "string" ||
    typeof decoded.uidValidity !== "string" ||
    typeof decoded.uid !== "number" ||
    !Number.isSafeInteger(decoded.uid) ||
    decoded.uid < 1
  ) {
    throw new MailConnectorError("invalid_reference", "The message reference is invalid.");
  }
  return decoded as MessageReference;
}

function roleFor(specialUse: string | undefined): Mailbox["role"] {
  const roles: Record<string, Mailbox["role"]> = {
    "\\Inbox": "inbox",
    "\\Sent": "sent",
    "\\Drafts": "drafts",
    "\\Archive": "archive",
    "\\Trash": "trash",
    "\\Junk": "junk",
  };
  return specialUse === undefined ? undefined : roles[specialUse];
}

function addresses(values: MessageAddressObject[] | undefined): MailAddress[] {
  return (values ?? []).flatMap((value) => {
    if (!value.address) return [];
    return value.name ? [{ address: value.address, name: value.name }] : [{ address: value.address }];
  });
}

function structureHasAttachment(node: MessageStructureObject | undefined): boolean {
  if (!node) return false;
  if (node.disposition?.toLocaleLowerCase() === "attachment") return true;
  if (node.dispositionParameters?.filename || node.parameters?.name) return true;
  return node.childNodes?.some(structureHasAttachment) ?? false;
}

function attachmentMetadata(node: MessageStructureObject | undefined, reference: MessageReference): AttachmentMetadata[] {
  if (!node) return [];
  const children = node.childNodes?.flatMap((child) => attachmentMetadata(child, reference)) ?? [];
  if (!structureHasAttachment({ ...node, childNodes: undefined })) return children;
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name ?? "attachment";
  return [
    {
      attachmentRef: encodeOpaque("yatt", { ...reference, part: node.part ?? "unknown" }),
      filename,
      contentType: node.type,
      size: node.size ?? 0,
    },
    ...children,
  ];
}

function toIso(value: Date | string | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date(0);
  return Number.isNaN(date.valueOf()) ? new Date(0).toISOString() : date.toISOString();
}

function summaryFrom(message: FetchMessageObject, mailbox: string, uidValidity: bigint): MessageSummary {
  const reference: MessageReference = { version: 1, mailbox, uidValidity: uidValidity.toString(), uid: message.uid };
  return {
    messageRef: encodeMessageRef(reference),
    mailboxId: encodeMailboxId(mailbox),
    subject: message.envelope?.subject ?? "(no subject)",
    from: addresses(message.envelope?.from),
    to: addresses(message.envelope?.to),
    receivedAt: toIso(message.envelope?.date ?? message.internalDate),
    isRead: message.flags?.has("\\Seen") ?? false,
    hasAttachments: structureHasAttachment(message.bodyStructure),
    preview: "",
  };
}

export function createYahooClient(credentials: YahooCredentials): ImapFlow {
  return new ImapFlow({
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    auth: { user: credentials.email, pass: credentials.appPassword },
    logger: false,
    emitLogs: false,
    logRaw: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 10_000,
    socketTimeout: 45_000,
    maxLineLength: 1024 * 1024,
    maxLiteralSize: MAX_SOURCE_BYTES,
    maxResponseSize: MAX_SOURCE_BYTES + 1024 * 1024,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
  });
}

async function disconnect(client: ImapFlow): Promise<void> {
  if (!client.isClosed) await client.logout().catch(() => client.close());
}

export async function verifyYahooCredentials(credentials: YahooCredentials): Promise<void> {
  const client = createYahooClient(credentials);
  try {
    await client.connect();
  } finally {
    await disconnect(client);
  }
}

export class YahooImapProvider implements MailProvider {
  constructor(private readonly credentials: CredentialStore) {}

  async #withClient<T>(operation: (client: ImapFlow, email: string) => Promise<T>): Promise<T> {
    let credentials = await this.credentials.load();
    const client = createYahooClient(credentials);
    try {
      await client.connect();
      return await operation(client, credentials.email);
    } catch (error) {
      if (error instanceof MailConnectorError) throw error;
      const code = typeof error === "object" && error !== null && "authenticationFailed" in error ? "authentication_failed" : "provider_unavailable";
      throw new MailConnectorError(code, code === "authentication_failed" ? "Yahoo authentication failed. Run setup again with a current app password." : "Yahoo Mail is temporarily unavailable.");
    } finally {
      credentials = { email: "", appPassword: "" };
      await disconnect(client);
    }
  }

  async getProfile() {
    const credentials = await this.credentials.load();
    return {
      accountId: `yahoo_${createHash("sha256").update(credentials.email.toLocaleLowerCase()).digest("hex").slice(0, 16)}`,
      address: credentials.email,
      provider: "yahoo" as const,
      deploymentMode: "local" as const,
      capabilities: ["mail.read.metadata", "mail.read.body"],
    };
  }

  async listMailboxes(includeCounts: boolean): Promise<Mailbox[]> {
    return this.#withClient(async (client) => {
      const listed = await client.list(includeCounts ? { statusQuery: { messages: true, unseen: true } } : undefined);
      return listed.map((entry) => {
        const mailbox: Mailbox = { id: encodeMailboxId(entry.path), displayName: entry.name || entry.path };
        const role = roleFor(entry.specialUse);
        if (role) mailbox.role = role;
        if (includeCounts && entry.status?.messages !== undefined) mailbox.messageCount = entry.status.messages;
        if (includeCounts && entry.status?.unseen !== undefined) mailbox.unreadCount = entry.status.unseen;
        return mailbox;
      });
    });
  }

  async searchMessages(input: SearchMessagesInput): Promise<SearchMessagesResult> {
    return this.#withClient(async (client) => {
      const mailbox = input.mailboxId ? decodeMailboxId(input.mailboxId) : "INBOX";
      const lock = await client.getMailboxLock(mailbox, { readOnly: true, acquireTimeout: 10_000 });
      try {
        if (!client.mailbox) throw new MailConnectorError("provider_unavailable", "Yahoo did not open the requested mailbox.");
        const selectedMailbox = client.mailbox;
        const start = Math.max(1, selectedMailbox.exists - MAX_SEARCH_WINDOW + 1);
        const query: SearchObject = { seq: `${start}:*` };
        if (input.query) query.text = input.query;
        if (input.subject) query.subject = input.subject;
        if (input.from?.length) query.from = input.from.join(" ");
        if (input.to?.length) query.to = input.to.join(" ");
        if (input.after) query.since = new Date(input.after);
        if (input.before) query.before = new Date(input.before);
        if (input.readState === "read") query.seen = true;
        if (input.readState === "unread") query.seen = false;
        const matches = await client.search(query, { uid: true });
        const uids = Array.isArray(matches) ? [...matches].sort((a, b) => b - a) : [];
        const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
        if (!Number.isSafeInteger(offset) || offset < 0) throw new MailConnectorError("invalid_reference", "The search cursor is invalid.");
        const scanLimit = input.hasAttachment === undefined ? input.limit : Math.min(200, Math.max(input.limit * 4, input.limit));
        const candidates = uids.slice(offset, offset + scanLimit);
        const fetched = candidates.length
          ? await client.fetchAll(candidates, { uid: true, flags: true, envelope: true, internalDate: true, bodyStructure: true }, { uid: true })
          : [];
        const filtered = input.hasAttachment === undefined
          ? fetched
          : fetched.filter((message) => structureHasAttachment(message.bodyStructure) === input.hasAttachment);
        const page = filtered.slice(0, input.limit);
        const nextOffset = offset + candidates.length;
        const result: SearchMessagesResult = {
          messages: page.map((message) => summaryFrom(message, mailbox, selectedMailbox.uidValidity)),
          searchScope: "bounded_local",
          limitations: [
            `Search is bounded to the newest ${MAX_SEARCH_WINDOW} messages in one mailbox.`,
            "Summary previews are omitted to avoid downloading message bodies during search.",
          ],
        };
        if (nextOffset < uids.length) result.nextCursor = String(nextOffset);
        return result;
      } finally {
        lock.release();
      }
    });
  }

  async fetchMessage(messageRef: string, maxBodyChars: number): Promise<MailMessage> {
    const reference = decodeMessageRef(messageRef);
    return this.#withClient(async (client) => {
      const lock = await client.getMailboxLock(reference.mailbox, { readOnly: true, acquireTimeout: 10_000 });
      try {
        if (!client.mailbox || client.mailbox.uidValidity.toString() !== reference.uidValidity) {
          throw new MailConnectorError("invalid_reference", "The mailbox changed since this message reference was issued. Search again.");
        }
        const fetched = await client.fetchOne(
          reference.uid,
          { uid: true, flags: true, envelope: true, internalDate: true, bodyStructure: true, source: { maxLength: MAX_SOURCE_BYTES } },
          { uid: true },
        );
        if (!fetched || !fetched.source) throw new MailConnectorError("not_found", "The message no longer exists.");
        const parsed = await simpleParser(fetched.source, { maxHtmlLengthToParse: MAX_SOURCE_BYTES, skipImageLinks: true });
        const rawText = parsed.text ?? (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "");
        const bodyText = rawText.slice(0, maxBodyChars);
        return {
          ...summaryFrom(fetched, reference.mailbox, client.mailbox.uidValidity),
          bodyText,
          bodyTruncated: rawText.length > maxBodyChars || (fetched.size ?? 0) > MAX_SOURCE_BYTES,
          attachments: attachmentMetadata(fetched.bodyStructure, reference),
          untrustedContent: true,
        };
      } finally {
        lock.release();
      }
    });
  }
}
