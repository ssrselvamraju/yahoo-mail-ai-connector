import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MailConnectorError } from "../../mail-core/src/index.js";

export class CursorCodec {
  constructor(private readonly key = randomBytes(32), private readonly now = Date.now) {}
  encode(data: object): string {
    const payload = Buffer.from(JSON.stringify({ ...data, expires: this.now() + 30 * 60_000 })).toString("base64url");
    return `${payload}.${createHmac("sha256", this.key).update(payload).digest("base64url")}`;
  }
  decode<T>(value: string): T {
    try {
      const [payload, signature, extra] = value.split(".");
      if (!payload || !signature || extra || value.length > 2048) throw Error();
      const expected = createHmac("sha256", this.key).update(payload).digest();
      const actual = Buffer.from(signature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
      const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { expires: number };
      if (!Number.isFinite(data.expires) || data.expires <= this.now()) throw Error();
      return data as T;
    } catch { throw new MailConnectorError("invalid_reference", "The cursor is invalid, expired, or belongs to a previous server session. Restart the search."); }
  }
}
