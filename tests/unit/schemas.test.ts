import { describe, expect, it } from "vitest";
import { fetchMessageInput, searchMessagesInput } from "../../packages/mcp-contract/src/schemas.js";

describe("MCP input schemas", () => {
  it("rejects unknown search fields", () => {
    expect(() => searchMessagesInput.parse({ query: "receipt", surprise: true })).toThrow();
  });

  it("bounds result counts", () => {
    expect(() => searchMessagesInput.parse({ limit: 101 })).toThrow();
    expect(searchMessagesInput.parse({}).limit).toBe(25);
  });

  it("bounds message body output", () => {
    expect(() => fetchMessageInput.parse({ messageRef: "fake:inbox:1", maxBodyChars: 100_001 })).toThrow();
  });
});
