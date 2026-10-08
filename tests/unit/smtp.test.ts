import { createServer } from "node:net";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { SmtpAdapter, yahooSmtpOptions } from "../../packages/mail-send/src/smtp.js";
import type { CredentialStore } from "../../packages/yahoo-imap/src/credentials.js";
const store={load:async()=>({email:"from@example.test",appPassword:"synthetic-password"})} as CredentialStore;
async function sink(dropAfterData=false, rejectAuth=false) {
 const recipients:string[]=[];let data=""; let submissions=0;
 const server=createServer(socket=>{
  socket.write("220 synthetic.test ESMTP\r\n");let pending="", inData=false,auth=false;
  socket.on("data",chunk=>{
   pending+=chunk.toString();let end:number;
   while((end=pending.indexOf("\r\n"))>=0){const line=pending.slice(0,end);pending=pending.slice(end+2);
    if(inData){if(line==="."){inData=false;submissions++;if(dropAfterData) socket.destroy();else socket.write("250 accepted\r\n");}else data+=line+"\r\n";continue;}
    if(auth){auth=false;socket.write(rejectAuth ? "535 synthetic auth rejected\r\n" : "235 authenticated\r\n");continue;}
    if(line.startsWith("EHLO"))socket.write("250-synthetic.test\r\n250 AUTH PLAIN\r\n");
    else if(line==="STARTTLS")socket.end("454 TLS unavailable\r\n");
    else if(line.startsWith("AUTH")){if(line.split(" ").length>2)socket.write(rejectAuth ? "535 synthetic auth rejected\r\n" : "235 authenticated\r\n");else{auth=true;socket.write("334 \r\n");}}
    else if(line.startsWith("RCPT TO:")){recipients.push(line);socket.write("250 ok\r\n");}
    else if(line==="DATA"){inData=true;socket.write("354 data\r\n");}
    else if(line==="QUIT"){socket.end("221 bye\r\n");}
    else socket.write("250 ok\r\n");
   }
  });
 });
 server.listen(0,"127.0.0.1");await once(server,"listening");const port=(server.address() as {port:number}).port;
 return {port,recipients,get data(){return data;},get submissions(){return submissions;},close:async()=>{server.close();await once(server,"close");}};
}
describe("SMTP adapter against local synthetic sink",()=>{
 it("submits once with correct envelope and strips Bcc headers",async()=>{
  const s=await sink();try{
   const adapter=new SmtpAdapter(store,{host:"127.0.0.1",port:s.port,secure:false,ignoreTLS:true,logger:false,debug:false});
   const result=await adapter.submit("from@example.test",{to:["to@example.test"],cc:[],bcc:["blind@example.test"],subject:"Synthetic sink",body:"Canary sink"},"<synthetic@example.test>");
   expect(result.status).toBe("accepted");expect(s.submissions).toBe(1);expect(s.recipients.join(" ")).toContain("blind@example.test");
   expect(s.data).not.toMatch(/^Bcc:/mi);expect(s.data).not.toContain("blind@example.test");expect(s.data).toContain("Canary sink");expect(s.data).toContain("Subject: Synthetic sink");
  }finally{await s.close();}
 });
 it("returns unknown when acceptance is ambiguous and does not retry",async()=>{
  const s=await sink(true);try{
   const adapter=new SmtpAdapter(store,{host:"127.0.0.1",port:s.port,secure:false,ignoreTLS:true,logger:false,debug:false});
   expect((await adapter.submit("from@example.test",{to:["to@example.test"],cc:[],bcc:[],subject:"Synthetic sink",body:"Canary"},"<synthetic@example.test>")).status).toBe("unknown");
   expect(s.submissions).toBe(1);
  }finally{await s.close();}
 });
 it("returns a safe typed authentication failure without SMTP data",async()=>{
  const s=await sink(false,true);try{
   const adapter=new SmtpAdapter(store,{host:"127.0.0.1",port:s.port,secure:false,ignoreTLS:true,logger:false,debug:false});
   expect(await adapter.submit("from@example.test",{to:["to@example.test"],cc:[],bcc:[],subject:"Synthetic",body:"Canary"},"<synthetic@example.test>")).toEqual({status:"failed",errorCode:"authentication_failed"});
   expect(s.submissions).toBe(0);
  }finally{await s.close();}
 });
 it("production transport pins certificate validation and requires TLS",()=>{
  expect(yahooSmtpOptions.secure).toBe(true);expect(yahooSmtpOptions.port).toBe(465);expect(yahooSmtpOptions.tls.rejectUnauthorized).toBe(true);
  expect(yahooSmtpOptions.logger).toBe(false);expect(yahooSmtpOptions.debug).toBe(false);
 });
 it("refuses STARTTLS-required submission to a plaintext-only sink",async()=>{
  const s=await sink();try{
   const adapter=new SmtpAdapter(store,{host:"127.0.0.1",port:s.port,secure:false,requireTLS:true,logger:false,debug:false});
   const result=await adapter.submit("from@example.test",{to:["to@example.test"],cc:[],bcc:[],subject:"Synthetic",body:"Canary"},"<synthetic@example.test>");
   expect(result.status).not.toBe("accepted");expect(s.submissions).toBe(0);
  }finally{await s.close();}
 });
});
