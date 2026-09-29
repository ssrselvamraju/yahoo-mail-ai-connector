export type DeploymentMode = "local" | "relay" | "hosted";

export interface MailProfile {
  accountId: string;
  address: string;
  provider: "yahoo" | "fake";
  deploymentMode: DeploymentMode;
  capabilities: readonly string[];
}

export interface Mailbox {
  id: string;
  displayName: string;
  role?: "inbox" | "sent" | "drafts" | "archive" | "trash" | "junk";
  messageCount?: number;
  unreadCount?: number;
}

export interface MailAddress {
  address: string;
  name?: string;
}

export interface MessageSummary {
  messageRef: string;
  mailboxId: string;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  preview: string;
}

export interface AttachmentMetadata {
  attachmentRef: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface MailMessage extends MessageSummary {
  bodyText: string;
  bodyTruncated: boolean;
  attachments: AttachmentMetadata[];
  untrustedContent: true;
}

export interface SearchMessagesInput {
  query?: string | undefined;
  from?: string[] | undefined;
  to?: string[] | undefined;
  subject?: string | undefined;
  after?: string | undefined;
  before?: string | undefined;
  readState?: "read" | "unread" | "any" | undefined;
  hasAttachment?: boolean | undefined;
  mailboxId?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export interface SearchMessagesResult {
  messages: MessageSummary[];
  nextCursor?: string | undefined;
  searchScope: "server" | "bounded_local" | "synthetic";
  limitations: string[];
}

export interface MailProvider {
  getProfile(): Promise<MailProfile>;
  listMailboxes(includeCounts: boolean): Promise<Mailbox[]>;
  searchMessages(input: SearchMessagesInput): Promise<SearchMessagesResult>;
  fetchMessage(messageRef: string, maxBodyChars: number): Promise<MailMessage>;
}

export class MailConnectorError extends Error {
  constructor(
    public readonly code:
      | "invalid_reference"
      | "not_found"
      | "authentication_failed"
      | "provider_unavailable"
      | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "MailConnectorError";
  }
}
