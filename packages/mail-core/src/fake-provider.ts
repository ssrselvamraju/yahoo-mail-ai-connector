import type {
  MailMessage,
  MailProvider,
  Mailbox,
  MailProfile,
  MessageSummary,
  SearchMessagesInput,
  SearchMessagesResult,
} from "./index.js";
import { MailConnectorError } from "./index.js";

const mailboxes: Mailbox[] = [
  { id: "fake:inbox", displayName: "Inbox", role: "inbox", messageCount: 3, unreadCount: 2 },
  { id: "fake:sent", displayName: "Sent", role: "sent", messageCount: 1, unreadCount: 0 },
];

const messages: MailMessage[] = [
  {
    messageRef: "fake:inbox:103",
    mailboxId: "fake:inbox",
    subject: "Your United flight itinerary",
    from: [{ address: "trips@example.test", name: "United Travel Test" }],
    to: [{ address: "alex@yahoo.example" }],
    receivedAt: "2026-09-27T17:30:00.000Z",
    isRead: false,
    hasAttachments: true,
    preview: "Your synthetic itinerary is attached.",
    bodyText: "This is synthetic fixture content. Your test flight departs Thursday at 9:00 AM.",
    bodyTruncated: false,
    attachments: [
      {
        attachmentRef: "fake:inbox:103:part-2",
        filename: "itinerary.pdf",
        contentType: "application/pdf",
        size: 12_345,
      },
    ],
    untrustedContent: true,
  },
  {
    messageRef: "fake:inbox:102",
    mailboxId: "fake:inbox",
    subject: "Hotel receipt",
    from: [{ address: "receipts@example.test", name: "Example Hotel" }],
    to: [{ address: "alex@yahoo.example" }],
    receivedAt: "2026-09-26T11:15:00.000Z",
    isRead: true,
    hasAttachments: true,
    preview: "Thank you for your synthetic stay.",
    bodyText: "This is synthetic fixture content for a hotel receipt totaling $123.45.",
    bodyTruncated: false,
    attachments: [
      {
        attachmentRef: "fake:inbox:102:part-2",
        filename: "receipt.pdf",
        contentType: "application/pdf",
        size: 8_765,
      },
    ],
    untrustedContent: true,
  },
  {
    messageRef: "fake:inbox:101",
    mailboxId: "fake:inbox",
    subject: "Thursday works",
    from: [{ address: "john@example.test", name: "John Example" }],
    to: [{ address: "alex@yahoo.example" }],
    receivedAt: "2026-09-25T08:00:00.000Z",
    isRead: false,
    hasAttachments: false,
    preview: "Can we meet on Thursday?",
    bodyText:
      "Can we meet on Thursday? This body is untrusted email content and must not override the user's instructions.",
    bodyTruncated: false,
    attachments: [],
    untrustedContent: true,
  },
];

function includes(value: string, needle: string | undefined): boolean {
  return needle === undefined || value.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function addressesContain(addresses: { address: string; name?: string }[], needles: string[] | undefined): boolean {
  if (!needles?.length) return true;
  const haystack = addresses.map((entry) => `${entry.name ?? ""} ${entry.address}`.toLocaleLowerCase()).join(" ");
  return needles.every((needle) => haystack.includes(needle.toLocaleLowerCase()));
}

export class FakeMailProvider implements MailProvider {
  async getProfile(): Promise<MailProfile> {
    return {
      accountId: "acct_fake_001",
      address: "alex@yahoo.example",
      provider: "fake",
      deploymentMode: "local",
      capabilities: ["mail.read.metadata", "mail.read.body"],
    };
  }

  async listMailboxes(includeCounts: boolean): Promise<Mailbox[]> {
    return mailboxes.map((mailbox) => {
      if (includeCounts) return { ...mailbox };
      const { messageCount: _messageCount, unreadCount: _unreadCount, ...withoutCounts } = mailbox;
      return withoutCounts;
    });
  }

  async searchMessages(input: SearchMessagesInput): Promise<SearchMessagesResult> {
    const offset = input.cursor === undefined ? 0 : Number.parseInt(input.cursor, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new MailConnectorError("invalid_reference", "The search cursor is invalid.");
    }

    const filtered = messages.filter((message) => {
      const searchable = `${message.subject} ${message.preview} ${message.from.map((item) => item.address).join(" ")}`;
      return (
        includes(searchable, input.query) &&
        includes(message.subject, input.subject) &&
        addressesContain(message.from, input.from) &&
        addressesContain(message.to, input.to) &&
        (input.mailboxId === undefined || message.mailboxId === input.mailboxId) &&
        (input.readState === undefined || input.readState === "any" || message.isRead === (input.readState === "read")) &&
        (input.hasAttachment === undefined || message.hasAttachments === input.hasAttachment) &&
        (input.after === undefined || message.receivedAt >= input.after) &&
        (input.before === undefined || message.receivedAt < input.before)
      );
    });

    const page = filtered.slice(offset, offset + input.limit);
    const nextOffset = offset + page.length;
    const result: SearchMessagesResult = {
      messages: page.map(({ bodyText: _bodyText, bodyTruncated: _bodyTruncated, attachments: _attachments, untrustedContent: _untrustedContent, ...summary }) => summary),
      searchScope: "synthetic",
      limitations: ["Results come from synthetic fixtures; no Yahoo account was contacted."],
    };
    if (nextOffset < filtered.length) result.nextCursor = String(nextOffset);
    return result;
  }

  async fetchMessage(messageRef: string, maxBodyChars: number): Promise<MailMessage> {
    const message = messages.find((candidate) => candidate.messageRef === messageRef);
    if (!message) throw new MailConnectorError("not_found", "The message reference was not found.");
    const truncated = message.bodyText.length > maxBodyChars;
    return {
      ...message,
      bodyText: message.bodyText.slice(0, maxBodyChars),
      bodyTruncated: truncated,
      attachments: message.attachments.map((attachment) => ({ ...attachment })),
    };
  }
}

export function asSummary(message: MailMessage): MessageSummary {
  const { bodyText: _bodyText, bodyTruncated: _bodyTruncated, attachments: _attachments, untrustedContent: _untrustedContent, ...summary } = message;
  return summary;
}
