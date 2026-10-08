import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { expect, it, vi } from "vitest";
import { createMailMcpServer } from "../../packages/mcp-contract/src/server.js";
import { FakeMailProvider } from "../../packages/mail-core/src/fake-provider.js";
import { AttemptLedger, GuardedSendService } from "../../packages/mail-send/src/service.js";

it("keeps send absent by default and exposes guarded write tools only with explicit service",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"mcp-send-"));
 try{
  for(const enabled of [false,true]){
   const provider=new FakeMailProvider(); const submit=vi.fn(async()=>({status:"accepted" as const}));
   const service=enabled ? new GuardedSendService(()=>provider.getProfile(),{submit},new AttemptLedger(dir)) : undefined;
   const server=createMailMcpServer(provider,service);const client=new Client({name:"synthetic-contract",version:"0"});
   const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
   try{
    const {tools}=await client.listTools();expect(tools.some(t=>t.name==="commit_send_message")).toBe(enabled);
    const profile=await client.callTool({name:"get_profile",arguments:{}});
    expect(((profile.structuredContent as Record<string, unknown>)?.capabilities as string[]).includes("mail.send")).toBe(enabled);
    const stats=await client.callTool({name:"scan_senders",arguments:{}});expect(stats.isError).not.toBe(true);expect((stats.structuredContent as Record<string, unknown>)?.scannedMessages).toBe(3);
    if(enabled){
     const tool=tools.find(t=>t.name==="commit_send_message")!;expect(tool.annotations?.readOnlyHint).toBe(false);expect(tool.annotations?.destructiveHint).toBe(true);
     const prepared=await client.callTool({name:"prepare_send_message",arguments:{to:["test@example.test"],subject:"Synthetic",body:"Synthetic canary"}});expect(prepared.isError).not.toBe(true);expect(submit).not.toHaveBeenCalled();
     const data=prepared.structuredContent as Record<string, unknown>;
     expect((await client.callTool({name:"commit_send_message",arguments:{token:data.token,previewDigest:data.previewDigest,idempotencyKey:"synthetic-key-0001",confirmed:false}})).isError).toBe(true);
     expect(submit).not.toHaveBeenCalled();
     const result=await client.callTool({name:"commit_send_message",arguments:{token:data.token,previewDigest:data.previewDigest,idempotencyKey:"synthetic-key-0001",confirmed:true}});expect((result.structuredContent as Record<string, unknown>)?.status).toBe("accepted");expect(submit).toHaveBeenCalledTimes(1);
    }
   }finally{await client.close();await server.close();}
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
},30_000);
