import { describe, expect, it } from "vitest";
import type { ImapFlow, FetchMessageObject, SearchObject, FetchQueryObject } from "imapflow";
import { CursorCodec } from "../../packages/local-security/src/cursor.js";
import { bindingFor, matchesDate, searchQuery, traverse } from "../../packages/yahoo-imap/src/traversal.js";

function mailbox(uids: number[]) {
  const fetches: object[] = [];
  const searches: SearchObject[] = [];
  const client = {
    mailbox: { uidNext: Math.max(0, ...uids) + 1 },
    async search(query: SearchObject) {
      searches.push(query);
      const [low, high] = String(query.uid).split(":").map(Number);
      return uids.filter(uid => uid >= low! && uid <= high!);
    },
    async fetchAll(ids: number[], query: FetchQueryObject) {
      fetches.push(query);
      return [...ids].reverse().map(uid => ({ uid, internalDate: new Date("2024-01-01"), envelope: { subject: `Synthetic ${uid}`, from: [{ address: "test@example.test" }] } })) as FetchMessageObject[];
    },
  } as unknown as ImapFlow;
  return { client, searches, fetches };
}
describe("bounded history traversal", () => {
  it("reaches mail older than 1000, returns descending pages with no gaps and ignores new arrivals", async () => {
    const {client} = mailbox(Array.from({length:1500},(_,i)=>i+1));
    const codec = new CursorCodec(); let cursor: string | undefined; const seen: number[] = [];
    do {
      const page = await traverse(client, codec, "binding", {limit:73, cursor});
      seen.push(...page.messages.map(m=>m.uid)); cursor = page.nextCursor;
      if (client.mailbox) client.mailbox.uidNext = 1600;
    } while (cursor);
    expect(seen).toEqual(Array.from({length:1500},(_,i)=>1500-i));
  });
  it("continues across empty sparse ranges with at most four commands per invocation", async () => {
    const {client, searches} = mailbox([1, 10000]);
    const codec = new CursorCodec();
    const first = await traverse(client,codec,"b",{limit:100});
    expect(searches.length).toBe(4); expect(first.nextCursor).toBeDefined();
    const next = await traverse(client,codec,"b",{limit:100,cursor:first.nextCursor});
    expect(next.messages).toHaveLength(0); expect(next.complete).toBe(false); expect(next.nextCursor).toBeDefined();
  });
  it("does not skip leftover matches after local filtering", async () => {
    const {client} = mailbox([1,2,3,4,5,6]); const codec = new CursorCodec();
    const a = await traverse(client,codec,"b",{limit:2},false,m=>m.uid % 2 === 0);
    const b = await traverse(client,codec,"b",{limit:2,cursor:a.nextCursor},false,m=>m.uid % 2 === 0);
    expect(a.messages.map(m=>m.uid)).toEqual([6,4]); expect(b.messages.map(m=>m.uid)).toEqual([2]);
  });
  it("rejects changed filters, UIDVALIDITY, account, tampering and expired cursors", async () => {
    let now = 0; const codec = new CursorCodec(undefined,()=>now); const {client} = mailbox([1,2]);
    const binding = bindingFor("a","box","1",{subject:"a"});
    const page = await traverse(client,codec,binding,{limit:1});
    for (const changed of [bindingFor("b","box","1",{subject:"a"}),bindingFor("a","box","2",{subject:"a"}),bindingFor("a","box","1",{subject:"b"})]) {
      await expect(traverse(client,codec,changed,{limit:1,cursor:page.nextCursor})).rejects.toThrow("does not match");
    }
    await expect(traverse(client,codec,binding,{limit:1,cursor:page.nextCursor+"x"})).rejects.toThrow("cursor");
    now=30*60_000; await expect(traverse(client,codec,binding,{limit:1,cursor:page.nextCursor})).rejects.toThrow("expired");
  });
  it("uses envelope only for sender traversal and never fetches bodies", async () => {
    const {client,fetches} = mailbox([1]);
    await traverse(client,new CursorCodec(),"senders",{limit:100},true);
    expect(fetches).toEqual([{uid:true,envelope:true}]);
  });
  it("applies exclusive UID bounds and exact internal-date boundaries", async () => {
    const {client} = mailbox([1,2,3,4]);
    const page=await traverse(client,new CursorCodec(),"b",{limit:10,uidAfter:1,uidBefore:4});
    expect(page.messages.map(m=>m.uid)).toEqual([3,2]);
    const m={internalDate:new Date("2024-01-01T12:00:00Z")} as FetchMessageObject;
    expect(matchesDate(m,{limit:1,after:"2024-01-01T12:00:00Z"})).toBe(true);
    expect(matchesDate(m,{limit:1,before:"2024-01-01T12:00:00Z"})).toBe(false);
    expect(searchQuery({limit:1,after:"2024-01-01T12:00:00Z"}).seq).toBeUndefined();
  });
  it("handles empty mailboxes and rejects inverted intervals", async () => {
    const {client}=mailbox([]);
    expect((await traverse(client,new CursorCodec(),"b",{limit:1})).complete).toBe(true);
    await expect(traverse(client,new CursorCodec(),"b",{limit:1,uidAfter:3,uidBefore:2})).rejects.toThrow("interval");
  });
});
