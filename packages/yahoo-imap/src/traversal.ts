import { createHash } from "node:crypto";
import type { ImapFlow, FetchMessageObject, SearchObject } from "imapflow";
import type { SearchMessagesInput } from "../../mail-core/src/index.js";
import { MailConnectorError } from "../../mail-core/src/index.js";
import { CursorCodec } from "../../local-security/src/cursor.js";

interface Continuation { binding: string; high: number; floor: number }
export function bindingFor(account: string, mailbox: string, validity: string, input: object): string {
  return createHash("sha256").update(JSON.stringify([account.toLowerCase(), mailbox, validity, input])).digest("hex");
}
export function searchQuery(input: SearchMessagesInput): SearchObject {
  const query: SearchObject = {};
  if (input.query) query.text = input.query;
  if (input.subject) query.subject = input.subject;
  // Multiple sender filters mean OR, not a single space-joined address.
  if (input.from?.length) query.or = input.from.map(from => ({ from }));
  if (input.to?.length) {
    const to = input.to.map(value => ({ to: value }));
    if (query.or) return { ...query, or: undefined, not: { or: [{ not: { or: query.or } }, { not: { or: to } }] }, ...dateAndFlags(input) };
    query.or = to;
  }
  return { ...query, ...dateAndFlags(input) };
}
function dateAndFlags(input: SearchMessagesInput): SearchObject {
  const query: SearchObject = {};
  // IMAP searches are day-granular. Widen conservatively; compare exact internalDate below.
  if (input.after) query.since = new Date(new Date(input.after).valueOf() - 86_400_000);
  if (input.before) query.before = new Date(new Date(input.before).valueOf() + 86_400_000);
  if (input.readState === "read") query.seen = true;
  if (input.readState === "unread") query.seen = false;
  return query;
}
export function matchesDate(message: FetchMessageObject, input: SearchMessagesInput): boolean {
  const time = new Date(message.internalDate ?? 0).valueOf();
  return (!input.after || time >= Date.parse(input.after)) && (!input.before || time < Date.parse(input.before));
}
async function traversePage(
  client: ImapFlow, codec: CursorCodec, binding: string, input: SearchMessagesInput,
  envelopeOnly = false, accept: (message: FetchMessageObject) => boolean = () => true,
): Promise<{ messages: FetchMessageObject[]; nextCursor?: string; complete: boolean; scannedRange: { uidAfter: number; uidBefore: number } }> {
  if (!client.mailbox) throw new MailConnectorError("provider_unavailable", "Mailbox unavailable.");
  const ceiling = Math.min(client.mailbox.uidNext - 1, (input.uidBefore ?? 4_294_967_296) - 1);
  let high = ceiling;
  const floor = (input.uidAfter ?? 0) + 1;
  if (floor < 1 || ceiling < 0 || (input.uidBefore !== undefined && input.uidAfter !== undefined && input.uidBefore <= input.uidAfter + 1)) {
    throw new MailConnectorError("invalid_input", "The UID interval is empty or invalid.");
  }
  if (input.after && input.before && Date.parse(input.after) >= Date.parse(input.before)) throw new MailConnectorError("invalid_input", "after must be earlier than before.");
  if (input.cursor) {
    const saved = codec.decode<Continuation>(input.cursor);
    if (saved.binding !== binding || saved.floor !== floor || !Number.isSafeInteger(saved.high) || saved.high > ceiling || saved.high < floor) {
      throw new MailConnectorError("invalid_reference", "The cursor does not match this account, mailbox, or search.");
    }
    high = saved.high;
  }
  const initialHigh = high;
  const messages: FetchMessageObject[] = [];
  const deadline = Date.now() + 15_000;
  for (let commands = 0; high >= floor && commands < 4 && Date.now() < deadline; commands++) {
    const low = Math.max(floor, high - 249);
    const query = { ...searchQuery(input), uid: `${low}:${high}` };
    const found = await client.search(query, { uid: true });
    const uids = [...new Set(Array.isArray(found) ? found : [])].filter(uid => uid >= low && uid <= high).sort((a,b) => b-a);
    const fetched = uids.length ? await client.fetchAll(uids, envelopeOnly ? { uid: true, envelope: true } : { uid: true, flags: true, envelope: true, internalDate: true, bodyStructure: true }, { uid: true }) : [];
    const byUid = new Map(fetched.map(message => [message.uid, message]));
    for (const uid of uids) {
      const message = byUid.get(uid);
      high = uid - 1;
      if (message && (envelopeOnly || matchesDate(message, input)) && accept(message)) messages.push(message);
      if (messages.length === input.limit) break;
    }
    if (messages.length === input.limit) break;
    high = low - 1;
  }
  const complete = high < floor;
  return {
    messages, complete, scannedRange: { uidAfter: Math.max(0, high), uidBefore: initialHigh + 1 },
    ...(!complete ? { nextCursor: codec.encode({ binding, high, floor }) } : {}),
  };
}

export async function traverse(...args: Parameters<typeof traversePage>): ReturnType<typeof traversePage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([traversePage(...args), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { args[0].close(); reject(new MailConnectorError("timeout", "History scan reached its 15-second deadline. Restart this page.")); }, 15_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
