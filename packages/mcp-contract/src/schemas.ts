import { z } from "zod";

export const getProfileInput = z.strictObject({});
export const listMailboxesInput = z.strictObject({ includeCounts: z.boolean().default(false) });

export const searchMessagesInput = z.strictObject({
  mode: z.enum(["recent", "history"]).default("recent"),
  uidAfter: z.number().int().min(0).max(4_294_967_295).optional(),
  uidBefore: z.number().int().min(1).max(4_294_967_296).optional(),
  query: z.string().trim().min(1).max(500).optional(),
  from: z.array(z.string().trim().min(1).max(320)).max(20).optional(),
  to: z.array(z.string().trim().min(1).max(320)).max(20).optional(),
  subject: z.string().trim().min(1).max(500).optional(),
  after: z.iso.datetime({ offset: true }).optional(),
  before: z.iso.datetime({ offset: true }).optional(),
  readState: z.enum(["read", "unread", "any"]).default("any"),
  hasAttachment: z.boolean().optional(),
  mailboxId: z.string().trim().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(2048).optional(),
});

export const fetchMessageInput = z.strictObject({
  messageRef: z.string().trim().min(1).max(2048),
  bodyFormat: z.enum(["text", "metadata_only"]).default("text"),
  maxBodyChars: z.number().int().min(0).max(100_000).default(20_000),
});

const addressOutput = z.strictObject({ address: z.string(), name: z.string().optional() });
const mailboxOutput = z.strictObject({
  id: z.string(),
  displayName: z.string(),
  role: z.enum(["inbox", "sent", "drafts", "archive", "trash", "junk"]).optional(),
  messageCount: z.number().int().nonnegative().optional(),
  unreadCount: z.number().int().nonnegative().optional(),
});
const summaryOutput = z.strictObject({
  messageRef: z.string(),
  mailboxId: z.string(),
  subject: z.string(),
  from: z.array(addressOutput),
  to: z.array(addressOutput),
  receivedAt: z.string(),
  isRead: z.boolean(),
  hasAttachments: z.boolean(),
  preview: z.string(),
});

export const getProfileOutput = z.strictObject({
  accountId: z.string(),
  address: z.string(),
  provider: z.enum(["yahoo", "fake"]),
  deploymentMode: z.enum(["local", "relay", "hosted"]),
  capabilities: z.array(z.string()),
});
export const listMailboxesOutput = z.strictObject({ mailboxes: z.array(mailboxOutput) });
export const searchMessagesOutput = z.strictObject({
  messages: z.array(summaryOutput),
  nextCursor: z.string().optional(),
  searchScope: z.enum(["server", "bounded_local", "synthetic"]),
  limitations: z.array(z.string()),
  scannedRange: z.strictObject({ uidAfter: z.number(), uidBefore: z.number() }).optional(),
  complete: z.boolean().optional(),
});
export const fetchMessageOutput = summaryOutput.extend({
  bodyText: z.string(),
  bodyTruncated: z.boolean(),
  attachments: z.array(
    z.strictObject({
      attachmentRef: z.string(),
      filename: z.string(),
      contentType: z.string(),
      size: z.number().int().nonnegative(),
    }),
  ),
  untrustedContent: z.literal(true),
});

export const scanSendersInput = z.strictObject({
  mailboxId: z.string().min(1).max(512).optional(),
  cursor: z.string().min(1).max(2048).optional(),
  sampleSubjects: z.number().int().min(0).max(3).default(0),
});
export const scanSendersOutput = z.strictObject({
  domains: z.array(z.strictObject({ domain: z.string(), count: z.number().int(), sampleSubjects: z.array(z.string()) })),
  scannedMessages: z.number().int(), nextCursor: z.string().optional(), complete: z.boolean(), limitations: z.array(z.string()),
});
