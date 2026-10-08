import { mkdtempSync, readFileSync, readdirSync, rmSync, chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttemptLedger, GuardedSendService, sendInput } from "../../packages/mail-send/src/service.js";
import type { SendAccount, SendAdapter } from "../../packages/mail-send/src/service.js";
import * as windows from "../../packages/mail-send/src/windows-storage.js";
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
// These are native filesystem tests: Windows ACL checks and write-through
// publication invoke the OS helper. Keep every assertion, with a bounded budget.
describe("guarded send", { timeout: 30_000 }, ()=>{
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
 it("keeps an unknown claim when outcome persistence fails and never resubmits",async()=>{
  const s=setup();const p=await s.service.prepare(content);
  vi.spyOn(s.ledger,"finish").mockImplementation(()=>{throw Error("synthetic disk failure");});
  expect((await s.service.commit(commit(p))).status).toBe("unknown");
  expect((await s.service.commit(commit(p))).status).toBe("unknown");
  expect(s.adapter.submit).toHaveBeenCalledTimes(1);
  const file=readdirSync(s.dir).find(name=>name.endsWith(".json"))!;
  expect(JSON.parse(readFileSync(join(s.dir,file),"utf8")).status).toBe("unknown");
  s.advance(60_001);const q=await s.service.prepare(content);
  await expect(s.service.commit(commit(q,"second-idempotency-key"))).rejects.toThrow("unknown outcome");
 });
 it("fails closed on durable publication failure before or after submission",async()=>{
  const s=setup();const p=await s.service.prepare(content);
  const native=windows.windowsStorage;
  const failure=process.platform==="win32"
   ? vi.spyOn(windows,"windowsStorage").mockImplementation((operation,directory,publication)=>{
      if(operation==="publish")throw Error("synthetic publication failure");
      native(operation,directory,publication);
     })
   : vi.spyOn(s.ledger,"claim").mockImplementation(()=>{throw Error("synthetic publication failure");});
  try{
   await expect(s.service.commit(commit(p))).rejects.toThrow("publication failure");
   expect(s.adapter.submit).not.toHaveBeenCalled();
  }finally{failure.mockRestore();}
  const completionFailure=process.platform==="win32"
   ? vi.spyOn(windows,"windowsStorage").mockImplementation((operation,directory,publication)=>{
      if(operation==="publish" && !publication?.exclusive)throw Error("synthetic publication failure");
      native(operation,directory,publication);
     })
   : vi.spyOn(s.ledger,"finish").mockImplementation(()=>{throw Error("synthetic publication failure");});
  try{
   expect((await s.service.commit(commit(p))).status).toBe("unknown");
   expect((await s.service.commit(commit(p))).status).toBe("unknown");
   expect(s.adapter.submit).toHaveBeenCalledTimes(1);
   const file=readdirSync(s.dir).find(name=>name.endsWith(".json"))!;
   expect(JSON.parse(readFileSync(join(s.dir,file),"utf8")).status).toBe("unknown");
  }finally{completionFailure.mockRestore();}
 });
 it("rejects exposed existing state instead of silently repairing it",()=>{
  const s=setup();writeFileSync(join(s.dir,"existing.json"),"synthetic");
  if(process.platform==="win32"){
   const script="$ErrorActionPreference='Stop'; $d=[IO.DirectoryInfo]::new([Console]::In.ReadToEnd()); $a=$d.GetAccessControl(); $a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','Allow')); $d.SetAccessControl($a)";
   const result=spawnSync(join(process.env.SystemRoot ?? "C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe"),["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(script,"utf16le").toString("base64")],{input:s.dir,encoding:"utf8",windowsHide:true});
   expect(result.status,result.stderr).toBe(0);
  }else chmodSync(s.dir,0o755);
  expect(()=>new AttemptLedger(s.dir)).toThrow(/private|privacy/);
  expect(()=>s.ledger.claim("synthetic","key","token","<test>",1_000_000)).toThrow(/private|privacy/);
  expect(readFileSync(join(s.dir,"existing.json"),"utf8")).toBe("synthetic");
 });
 it("rejects linked state directories and fails closed with a stale lock",()=>{
  const s=setup();const link=join(s.dir,"linked");const target=join(s.dir,"target");mkdirSync(target,{mode:0o700});
  symlinkSync(target,link,process.platform==="win32" ? "junction" : "dir");
  expect(()=>new AttemptLedger(link)).toThrow(/private|privacy/);
  rmSync(link);rmSync(target,{recursive:true});mkdirSync(join(s.dir,".lock"),{mode:0o700});
  expect(()=>s.ledger.claim("synthetic","key","token","<test>",1_000_000)).toThrow("busy");
 });
});
