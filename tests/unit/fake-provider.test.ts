import { describe, expect, it } from "vitest";
import { FakeMailProvider } from "../../packages/mail-core/src/fake-provider.js";

describe("FakeMailProvider", () => {
  it("filters synthetic mail without contacting a provider", async () => {
    const provider = new FakeMailProvider();
    const result = await provider.searchMessages({ query: "United", readState: "any", limit: 25 });
    expect(result.searchScope).toBe("synthetic");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.subject).toContain("United");
  });

  it("truncates bodies and labels them as untrusted", async () => {
    const provider = new FakeMailProvider();
    const message = await provider.fetchMessage("fake:inbox:101", 12);
    expect(message.bodyText).toHaveLength(12);
    expect(message.bodyTruncated).toBe(true);
    expect(message.untrustedContent).toBe(true);
  });

  it("omits counts unless requested", async () => {
    const provider = new FakeMailProvider();
    const mailboxes = await provider.listMailboxes(false);
    expect(mailboxes[0]).not.toHaveProperty("messageCount");
    expect(mailboxes[0]).not.toHaveProperty("unreadCount");
  });
});
