import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttemptLedger, GuardedSendService, sendInput } from "../../packages/mail-send/src/service.js";
import type { SendAccount, SendAdapter } from "../../packages/mail-send/src/service.js";
const content={to:["to@example.test"],cc:[],bcc:["blind@example.test"],subject:"Synthetic canary",body:"Synthetic secret body canary"};
const directories:string[]=[];
afterEach(()=>{ for(const dir of directories.splice(0)) rmSync(dir,{recursive:true,force:true}); });
function setup(adapter:SendAdapter={submit:vi.fn(async()=>({status:"accepted" as const}))}) {
 const dir=mkdtempSync(join(tmpdir(),"yahoo-send-")); directories.push(dir);
 let now=1_000_000;
 let account:SendAccount={accountId:"synthetic",address:"from@example.test"};
 const ledger=new AttemptLedger(dir);
 const service=new GuardedSendService(async()=>account,adapter,ledger,()=>now);
 return {dir,ledger,service,adapter,advance:(ms:number)=>now+=ms,changeAccount:()=>{account={accountId:"other",address:"other@example.test"};}};
}
const commit=(p:{token:string;previewDigest:string},key="synthetic-idempotency-key")=>({token:p.token,previewDigest:p.previewDigest,idempotencyKey:key,confirmed:true});
describe("guarded send",()=>{
 it("prepares without submission, replays one result and persists no content, addresses or token",async()=>{
  const s=setup();const p=await s.service.prepare(content);expect(s.adapter.submit).not.toHaveBeenCalled();
  expect(await s.service.commit(commit(p))).toEqual({status:"accepted"});
  expect(await s.service.commit(commit(p))).toEqual({status:"accepted"});expect(s.adapter.submit).toHaveBeenCalledTimes(1);
  const state=readdirSync(s.dir).map(f=>readFileSync(join(s.dir,f),"utf8")).join("");
  for(const secret of [content.subject,content.body,...content.to,...content.bcc,p.token,"from@example.test"]) expect(state).not.toContain(secret);
 });
 it("rejects confirmation omission, digest change, account change, expiry and new key replay",async()=>{
  const s=setup();const p=await s.service.prepare(content);
  await expect(s.service.commit({...commit(p),confirmed:false})).rejects.toThrow();
  await expect(s.service.commit({...commit(p),previewDigest:"a".repeat(64)})).rejects.toThrow();
  s.changeAccount();await expect(s.service.commit(commit(p))).rejects.toThrow("account changed");
  const t=setup();const q=await t.service.prepare(content);t.advance(5*60_000);await expect(t.service.commit(commit(q))).rejects.toThrow("expired");
  const u=setup();const r=await u.service.prepare(content);await u.service.commit(commit(r));
  await expect(u.service.commit(commit(r,"another-idempotency-key"))).rejects.toThrow("already been committed");
 });
 it("does not resend after a restart, ambiguous acceptance or key conflict",async()=>{
  const adapter={submit:vi.fn(async()=>{throw Error("private server response");})};const s=setup(adapter);const p=await s.service.prepare(content);
  expect((await s.service.commit(commit(p))).status).toBe("unknown");
  expect((await s.service.commit(commit(p))).status).toBe("unknown");expect(adapter.submit).toHaveBeenCalledTimes(1);
  const restarted=new GuardedSendService(async()=>({accountId:"synthetic",address:"from@example.test"}),adapter,new AttemptLedger(s.dir));
  await expect(restarted.commit(commit(p))).rejects.toThrow("previous server session");
  const q=await restarted.prepare(content);await expect(restarted.commit(commit(q))).rejects.toThrow("conflicts");
  await expect(restarted.commit(commit(q,"different-idempotency-key"))).rejects.toThrow("unknown outcome");
 });
 it("rejects concurrent commits and enforces durable rate limits",async()=>{
  let resolve!:(v:{status:"accepted"})=>void;const adapter={submit:vi.fn(()=>new Promise<{status:"accepted"}>(r=>{resolve=r;}))};
  const s=setup(adapter);const p=await s.service.prepare(content);const pending=s.service.commit(commit(p));await Promise.resolve();await Promise.resolve();
  await expect(s.service.commit(commit(p))).rejects.toThrow("in progress");resolve({status:"accepted"});await pending;
  const q=await s.service.prepare(content);await expect(s.service.commit(commit(q,"second-idempotency-key"))).rejects.toThrow("rate limit");
 });
 it("fails closed on journal write failure and preserves unknown after crash claim",async()=>{
  const s=setup();const p=await s.service.prepare(content);s.ledger.claim("synthetic","synthetic-idempotency-key",p.token,"<synthetic@test>",1_000_000);
  expect((await s.service.commit(commit(p))).status).toBe("unknown");expect(s.adapter.submit).not.toHaveBeenCalled();
  vi.spyOn(s.ledger,"claim").mockImplementation(()=>{throw Error("disk failure");});await expect(s.service.commit(commit(p))).rejects.toThrow();expect(s.adapter.submit).not.toHaveBeenCalled();
 });
 it("rejects header injection and recipient/byte limits",()=>{
  for(const input of [{...content,subject:"ok\r\nBcc: x@example.test"},{...content,to:["x@example.test\r\n"]},{...content,body:"😀".repeat(20_000)},{...content,to:Array(11).fill("x@example.test")}]) expect(()=>sendInput.parse(input)).toThrow();
 });
});
