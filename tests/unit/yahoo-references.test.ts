import { describe, expect, it } from "vitest";
import { decodeMailboxId, encodeMailboxId } from "../../packages/yahoo-imap/src/provider.js";

describe("Yahoo opaque mailbox references", () => {
  it("round-trips Unicode and delimiters without exposing the mailbox path directly", () => {
    const path = "Receipts/Travel ✈";
    const encoded = encodeMailboxId(path);
    expect(encoded).toMatch(/^ymb:/);
    expect(encoded).not.toContain(path);
    expect(decodeMailboxId(encoded)).toBe(path);
  });

  it("rejects foreign and malformed references", () => {
    expect(() => decodeMailboxId("fake:inbox")).toThrow("different provider");
    expect(() => decodeMailboxId("ymb:not-json")).toThrow("malformed");
  });
});
